import crypto from 'node:crypto';
import { query } from './db.js';
import { generateReply } from './ai.js';
import { makeSalesTools, orderOwnerText } from './order-tools.js';
import { extractProof } from './proof-ai.js';
import { evaluateProof, describeFindings } from './proof.js';
import { fmtCents, phoneOf } from './order-logic.js';
import * as orders from './orders.js';

const HANDOFF_PAUSE_MIN = Number(process.env.HANDOFF_PAUSE_MINUTES || 60);
const salesOn = (business) => business.answers?.sales_mode === true;

async function upsertConversation(businessId, jid, name) {
  const { rows } = await query(
    `insert into conversations (business_id, jid, contact_name, last_message_at) values ($1, $2, $3, now())
     on conflict (business_id, jid) do update
       set last_message_at = now(), contact_name = coalesce($3, conversations.contact_name)
     returning *`,
    [businessId, jid, name || null],
  );
  return rows[0];
}

const save = (conversationId, direction, body) =>
  query('insert into messages (conversation_id, direction, body) values ($1, $2, $3)', [conversationId, direction, body]);

export const pauseConversation = (businessId, jid, minutes) =>
  query(
    `insert into conversations (business_id, jid, paused_until) values ($1, $2, now() + make_interval(mins => $3))
     on conflict (business_id, jid) do update set paused_until = now() + make_interval(mins => $3)`,
    [businessId, jid, minutes],
  );

/**
 * Trata uma mensagem de cliente: registra, consulta a IA e responde.
 * @param {object} p
 * @param {object} p.business
 * @param {string} p.jid
 * @param {string} [p.name]
 * @param {string} [p.text]
 * @param {Array<{kind:'image'|'audio', mimeType:string, data:string}>} [p.media]  imagens/áudios (base64)
 * @param {(t: string) => Promise<void>} p.send                    envia texto ao cliente
 * @param {(t: string, image?: object) => Promise<void>} [p.notifyOwner]  avisa o dono (único destino proativo)
 * @param {boolean} [p.ignorePause]
 */
export async function handleIncoming({ business, jid, name, text = '', media = [], send, notifyOwner = async () => {}, ignorePause = false }) {
  const conv = await upsertConversation(business.id, jid, name);
  const { rows: recent } = await query(
    'select direction, body from (select id, direction, body from messages where conversation_id = $1 order by id desc limit 14) m order by id',
    [conv.id],
  );
  const hasAudio = media.some((m) => m.kind === 'audio');
  const hasImage = media.some((m) => m.kind === 'image');
  await save(conv.id, 'in', [text, hasAudio && '[áudio]', hasImage && '[imagem]'].filter(Boolean).join(' ') || '[mensagem]');

  if (!ignorePause && conv.paused_until && new Date(conv.paused_until) > new Date()) return { replied: false };

  const say = async (t) => { await save(conv.id, 'out', t); await send(t); };
  const sales = salesOn(business) ? makeSalesTools({ business, conv, name }) : null;

  // Cliente mandou imagem com um pagamento pendente: é o comprovante.
  if (sales && hasImage) {
    const order = await orders.findOpenOrder(conv.id, orders.PENDING);
    if (order) {
      await handleProof({ business, conv, jid, name, order, img: media.find((m) => m.kind === 'image'), say, notifyOwner });
      return { replied: true };
    }
  }

  const reply = await generateReply({
    business, history: recent, media, sales,
    text: text || (hasAudio ? '(mensagem de voz do cliente: ouça e responda)' : hasImage ? '(o cliente enviou esta imagem)' : ''),
  });

  await say(reply.text);
  for (const extra of reply.extraMessages) await say(extra);          // ex.: código Pix, em mensagem separada para copiar
  for (const notice of reply.ownerNotices) await notifyOwner(notice);

  if (reply.handoff) {
    await query('update conversations set paused_until = now() + make_interval(mins => $2) where id = $1', [conv.id, HANDOFF_PAUSE_MIN]);
    console.log(`[bot] ${business.name}: atendente humano acionado (${reply.handoffReason || 'sem motivo'}) — ${jid}`);
    await notifyOwner(`🙋 *${name || phoneOf(jid)}* (${phoneOf(jid)}) precisa de atendimento humano.\nMotivo: ${reply.handoffReason || 'não informado'}${text ? `\nÚltima mensagem: "${text.slice(0, 200)}"` : ''}\n\nO bot ficou em silêncio nessa conversa por ${HANDOFF_PAUSE_MIN} min.`);
  }
  return { replied: true, text: reply.text };
}

/** Comprovante: lê a imagem, confere com o pedido, avisa o cliente e envia tudo ao dono (que confirma de verdade). */
async function handleProof({ business, conv, jid, name, order, img, say, notifyOwner }) {
  let extracted = null;
  try { extracted = await extractProof(img); } catch (e) { console.error('[proof] falha ao ler a imagem:', e.message); }
  if (!extracted) {
    await say('Não consegui ler essa imagem agora. Pode enviar de novo um print do comprovante mostrando valor, data e favorecido?');
    return;
  }

  const sha = crypto.createHash('sha256').update(Buffer.from(img.data, 'base64')).digest('hex');
  const e2e = extracted.e2e_id ? String(extracted.e2e_id).trim() : null;
  const duplicate = await orders.isDuplicateProof(business.id, order.id, sha, e2e);
  const ev = evaluateProof({ extracted, order, business, duplicate });

  if (ev.verdict === 'nao_comprovante') {
    await say(`Essa imagem não parece um comprovante de Pix. Quando pagar o pedido #${order.num} (${fmtCents(order.total_cents)}), me envie o print do comprovante, combinado?`);
    return;
  }
  if (ev.verdict === 'ilegivel') {
    await say('Não consegui ler o valor no comprovante. Pode mandar um print mais nítido, mostrando valor, data e favorecido?');
    return;
  }

  await orders.recordProof({ orderId: order.id, businessId: business.id, sha256: sha, e2eId: e2e, amountCents: ev.amountCents, extracted, verdict: ev.verdict, problems: ev.problems, warnings: ev.warnings });
  await orders.setStatus(order.id, ev.verdict === 'ok' ? 'proof_received' : 'proof_review');

  const paid = fmtCents(ev.amountCents);
  if (ev.problems.includes('duplicado')) {
    await say('Esse comprovante já foi usado em outro pedido. Chamei o responsável para verificar, tudo bem?');
    await pauseConversation(business.id, jid, HANDOFF_PAUSE_MIN);
  } else if (ev.problems.includes('valor_diferente')) {
    await say(`Recebi o comprovante, mas o valor (${paid}) é diferente do pedido #${order.num} (${fmtCents(order.total_cents)}). 🤔 Pode conferir? Já avisei o responsável para verificar.`);
  } else if (ev.problems.includes('nao_efetivado')) {
    await say('O comprovante mostra o pagamento como agendado/pendente. Assim que for efetivado, me envie o novo comprovante, combinado?');
  } else {
    await say(`Recebi seu comprovante de ${paid} ✅\nJá enviei para o responsável confirmar o pagamento do pedido #${order.num}. Assim que confirmar, eu te aviso por aqui!`);
  }

  const head = ev.verdict === 'ok' ? `🧾 *Comprovante recebido — pedido #${order.num}*` : `⚠️ *Comprovante para REVISAR — pedido #${order.num}*`;
  await notifyOwner(
    `${head}\n\n${orderOwnerText({ ...order, customer_name: order.customer_name || name }, '').trim()}\n\nValor no comprovante: *${paid}*\n${describeFindings(ev, order)}\n\n`
    + '🔎 A leitura é automática e um print pode ser falso: *confira no app do banco se o dinheiro entrou* antes de liberar.\n'
    + `Responda *ok ${order.num}* para confirmar ou *recusar ${order.num} motivo*.`,
    { mimeType: img.mimeType, data: img.data, caption: `Comprovante — pedido #${order.num}` },
  );
}
