// Ferramentas de venda usadas pela IA + ações do dono. Todo valor em dinheiro é calculado AQUI (nunca pela IA).
import { buildOrder, parseDiscountLimit, fmtCents, describeLines, parseOwnerCommand, OWNER_HELP, STATUS_PT, phoneOf } from './order-logic.js';
import { getPixConfig, buildPixPayload } from './pix.js';
import * as db from './orders.js';

export function orderOwnerText(o, title) {
  const lines = typeof o.lines === 'string' ? JSON.parse(o.lines) : o.lines;
  const disc = Number(o.discount_pct) > 0 ? `\nSubtotal: ${fmtCents(o.subtotal_cents)} • Desconto: ${Number(o.discount_pct)}%` : '';
  return `${title}\nCliente: ${o.customer_name || 'sem nome'} (${phoneOf(o.jid)})\n\n${describeLines(lines)}${disc}\n*Total: ${fmtCents(o.total_cents)}*`
    + `\n\nEntrega: ${o.delivery === 'entrega' ? `entrega — ${o.address || 'endereço não informado'}` : 'retirada no local'}`
    + (o.details ? `\nDetalhes: ${o.details}` : '');
}

const missingFields = (o, fallbackName) => {
  const f = [];
  if (!o.delivery) f.push('entrega: pergunte se é retirada ou entrega');
  if (o.delivery === 'entrega' && !o.address) f.push('endereco de entrega');
  if (!o.customer_name && !fallbackName) f.push('nome do cliente');
  return f;
};

export function makeSalesTools({ business, conv, name }) {
  const answers = business.answers || {};
  const maxDiscount = parseDiscountLimit(answers.max_discount);
  const pix = getPixConfig(answers);

  return {
    async registrar_pedido(args = {}) {
      const items = Array.isArray(args.itens) ? args.itens : [];
      const catalog = await db.getCatalogByIds(business.id, items.map((i) => String(i?.produto_id || '')));
      const r = buildOrder({ items, catalog, discountPct: Number(args.desconto_percentual) || 0, maxDiscountPct: maxDiscount });
      if (!r.ok) return { response: { ok: false, erros: r.errors } };

      const delivery = ['retirada', 'entrega'].includes(String(args.entrega || '').toLowerCase()) ? String(args.entrega).toLowerCase() : null;
      const row = await db.saveDraft({
        business, conv, name: String(args.nome_cliente || name || '').trim() || null, order: r.order,
        delivery, address: String(args.endereco || '').trim() || null, details: String(args.detalhes || '').trim().slice(0, 1500) || null,
      });
      return {
        response: {
          ok: true, pedido_num: Number(row.num),
          itens: r.order.lines.map((l) => ({ produto: l.name, quantidade: l.quantity, preco_unitario: fmtCents(l.unitCents), subtotal: fmtCents(l.subtotalCents), observacao: l.note })),
          subtotal: fmtCents(r.order.subtotalCents), desconto_aplicado_pct: r.order.discountPct, total: fmtCents(r.order.totalCents),
          ...(r.order.discountClamped ? { aviso: `O desconto pedido passa do permitido; foi limitado a ${r.order.discountPct}%. Explique isso com educação.` } : {}),
          faltando: missingFields(row, name),
          proximo_passo: 'Mostre o resumo ao cliente e pergunte se está tudo certo e se pode gerar o Pix.',
        },
      };
    },

    async gerar_pix(args = {}) {
      if (args.cliente_confirmou !== true) {
        return { response: { ok: false, erro: 'Só gere o Pix depois que o cliente confirmar o resumo com um "sim" claro.' } };
      }
      const o = await db.findOpenOrder(conv.id, ['draft', 'awaiting_payment']);
      if (!o) return { response: { ok: false, erro: 'Não há pedido em andamento. Chame registrar_pedido primeiro.' } };
      const faltando = missingFields(o, name);
      if (faltando.length) return { response: { ok: false, erro: 'Faltam dados do pedido.', faltando } };
      if (!pix) return { response: { ok: false, erro: 'O Pix da empresa não está configurado. Use chamar_atendente_humano.' } };

      const txid = `ZB${o.num}`;
      const payload = buildPixPayload({ ...pix, amountCents: o.total_cents, txid });
      const firstTime = o.status === 'draft';
      await db.markAwaitingPayment(o.id, txid, payload);
      return {
        response: { ok: true, pedido_num: Number(o.num), total: fmtCents(o.total_cents), instrucao: 'O código Pix será enviado em mensagens separadas logo após a sua resposta. Peça o comprovante (foto ou print) depois do pagamento. NÃO diga que o pagamento foi confirmado.' },
        send: [`💳 *Pix do pedido #${o.num}* — ${fmtCents(o.total_cents)}\nFavorecido: ${pix.name}\n\nCopie o código abaixo e cole no app do seu banco (Pix Copia e Cola) 👇`, payload],
        notifyOwner: firstTime ? [orderOwnerText({ ...o, customer_name: o.customer_name || name }, `🛒 *Novo pedido #${o.num}* — aguardando pagamento`)] : [],
      };
    },

    async cancelar_pedido() {
      const o = await db.cancelOpenOrder(conv.id);
      if (!o) return { response: { ok: false, erro: 'Não há pedido em andamento.' } };
      return { response: { ok: true, pedido_num: Number(o.num) }, notifyOwner: o.pix_payload ? [`❌ Pedido #${o.num} cancelado pelo cliente (${o.customer_name || phoneOf(o.jid)}).`] : [] };
    },
  };
}

/** Ações do dono (pelo WhatsApp ou pelo painel). notifyCustomer(jid, texto) -> {sent, reason?} */
export async function applyOrderAction({ business, num, action, reason, notifyCustomer }) {
  const o = await db.getOrderByNum(business.id, num);
  if (!o) return { ok: false, message: `Pedido #${num} não encontrado.` };
  const first = String(o.customer_name || '').split(' ')[0];
  const tell = async (text) => {
    const r = await notifyCustomer(o.jid, text);
    return r?.sent ? 'Avisei o cliente.' : `Não consegui avisar o cliente (${r?.reason || 'erro'}). Avise você mesmo.`;
  };

  if (action === 'confirmar') {
    if (!db.PENDING.includes(o.status)) return { ok: false, message: `Pedido #${num} está "${STATUS_PT[o.status]}"; não dá para confirmar.` };
    await db.setStatus(o.id, 'paid');
    return { ok: true, message: `✅ Pedido #${num} confirmado como pago. ${await tell(`✅ Pagamento do pedido #${num} confirmado${first ? `, ${first}` : ''}! Obrigado pela compra. Qualquer dúvida é só chamar por aqui.`)}` };
  }
  if (action === 'recusar') {
    if (!db.PENDING.includes(o.status)) return { ok: false, message: `Pedido #${num} está "${STATUS_PT[o.status]}"; não dá para recusar.` };
    await db.setStatus(o.id, 'awaiting_payment', reason || null);
    return { ok: true, message: `Pagamento do pedido #${num} recusado. ${await tell(`Não conseguimos confirmar o pagamento do pedido #${num}${reason ? `: ${reason}` : ''}. Pode conferir e enviar um novo comprovante, ou falar com a gente por aqui.`)}` };
  }
  if (action === 'cancelar') {
    if (o.status === 'paid' || o.status === 'cancelled') return { ok: false, message: `Pedido #${num} está "${STATUS_PT[o.status]}"; não dá para cancelar.` };
    await db.setStatus(o.id, 'cancelled');
    return { ok: true, message: `Pedido #${num} cancelado. ${await tell(`Seu pedido #${num} foi cancelado. Se foi engano ou quiser refazer, é só me chamar!`)}` };
  }
  return { ok: false, message: 'Ação inválida.' };
}

/** Responde uma mensagem enviada pelo dono ao bot. */
export async function handleOwnerCommand({ business, text, notifyCustomer }) {
  const cmd = parseOwnerCommand(text);
  if (!cmd) return `Não entendi 🙂\n\n${OWNER_HELP}`;
  if (cmd.cmd === 'ajuda') return OWNER_HELP;
  if (cmd.cmd === 'pedidos') {
    const rows = await db.listOrders(business.id, db.PENDING, 20);
    if (!rows.length) return 'Nenhum pedido pendente 🎉';
    return `*Pedidos pendentes*\n${rows.map((o) => `#${o.num} • ${o.customer_name || o.contact_name || phoneOf(o.jid)} • ${fmtCents(o.total_cents)} • ${STATUS_PT[o.status]}`).join('\n')}\n\nResponda *ok N* para confirmar.`;
  }
  const map = { confirmar: 'confirmar', recusar: 'recusar', cancelar: 'cancelar' };
  return (await applyOrderAction({ business, num: cmd.num, action: map[cmd.cmd], reason: cmd.reason, notifyCustomer })).message;
}
