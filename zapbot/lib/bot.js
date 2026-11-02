import { query } from './db.js';
import { generateReply } from './ai.js';

const HANDOFF_PAUSE_MIN = Number(process.env.HANDOFF_PAUSE_MINUTES || 60);

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
 * Trata uma mensagem de cliente: registra, consulta a IA e envia a resposta.
 * @param {{business: object, jid: string, name?: string, text: string, send: (t: string) => Promise<void>, ignorePause?: boolean}} p
 * @returns {Promise<{replied: boolean, text?: string}>}
 */
export async function handleIncoming({ business, jid, name, text, send, ignorePause = false }) {
  const conv = await upsertConversation(business.id, jid, name);
  const { rows: recent } = await query(
    'select direction, body from (select id, direction, body from messages where conversation_id = $1 order by id desc limit 14) m order by id',
    [conv.id],
  );
  await save(conv.id, 'in', text);

  if (!ignorePause && conv.paused_until && new Date(conv.paused_until) > new Date()) return { replied: false };

  const reply = await generateReply({ business, history: recent, text });
  await save(conv.id, 'out', reply.text);
  if (reply.handoff) {
    await query("update conversations set paused_until = now() + make_interval(mins => $2) where id = $1", [conv.id, HANDOFF_PAUSE_MIN]);
    console.log(`[bot] ${business.name}: atendente humano acionado (${reply.handoffReason || 'sem motivo'}) — ${jid}`);
  }
  await send(reply.text);
  return { replied: true, text: reply.text };
}
