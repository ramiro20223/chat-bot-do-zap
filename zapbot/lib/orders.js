import { query } from './db.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const PENDING = ['awaiting_payment', 'proof_received', 'proof_review'];

/** Produtos do catálogo por id (só da empresa). Ids inválidos são ignorados. */
export async function getCatalogByIds(businessId, ids) {
  const valid = [...new Set(ids.filter((i) => UUID.test(i)))];
  if (!valid.length) return new Map();
  const { rows } = await query(
    'select id, name, price, in_stock, active from products where business_id = $1 and id = any($2::uuid[])', [businessId, valid]);
  return new Map(rows.map((r) => [r.id, r]));
}

export async function findOpenOrder(conversationId, statuses = ['draft', 'awaiting_payment']) {
  const { rows } = await query(
    'select * from orders where conversation_id = $1 and status = any($2::text[]) order by created_at desc limit 1', [conversationId, statuses]);
  return rows[0] || null;
}

/** Cria ou atualiza o rascunho da conversa. Mudou o pedido? Volta a rascunho e o Pix antigo deixa de valer. */
export async function saveDraft({ business, conv, name, order, delivery, address, details }) {
  const existing = await findOpenOrder(conv.id, ['draft', 'awaiting_payment']);
  const v = [JSON.stringify(order.lines), order.subtotalCents, order.discountPct, order.totalCents, delivery || null, address || null, details || null, name || null];
  const sql = existing
    ? `update orders set lines = $1::jsonb, subtotal_cents = $2, discount_pct = $3, total_cents = $4, delivery = $5, address = $6,
         details = $7, customer_name = $8, status = 'draft', pix_txid = null, pix_payload = null, updated_at = now()
       where id = $9 returning *`
    : `insert into orders (lines, subtotal_cents, discount_pct, total_cents, delivery, address, details, customer_name, business_id, conversation_id, jid)
       values ($1::jsonb, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning *`;
  const params = existing ? [...v, existing.id] : [...v, business.id, conv.id, conv.jid];
  return (await query(sql, params)).rows[0];
}

export const markAwaitingPayment = (id, txid, payload) =>
  query("update orders set status = 'awaiting_payment', pix_txid = $2, pix_payload = $3, updated_at = now() where id = $1", [id, txid, payload]);

export const setStatus = (id, status, reason = null) =>
  query('update orders set status = $2, reject_reason = $3, updated_at = now() where id = $1', [id, status, reason]);

export async function cancelOpenOrder(conversationId) {
  const { rows } = await query(
    "update orders set status = 'cancelled', updated_at = now() where conversation_id = $1 and status in ('draft','awaiting_payment') returning *", [conversationId]);
  return rows[0] || null;
}

export async function isDuplicateProof(businessId, orderId, sha256, e2eId) {
  const { rows } = await query(
    `select 1 from order_proofs where business_id = $1 and order_id <> $2
       and (image_sha256 = $3 or ($4::text is not null and e2e_id = $4)) limit 1`, [businessId, orderId, sha256, e2eId || null]);
  return rows.length > 0;
}

export const recordProof = ({ orderId, businessId, sha256, e2eId, amountCents, extracted, verdict, problems, warnings }) =>
  query(
    `insert into order_proofs (order_id, business_id, image_sha256, e2e_id, amount_cents, extracted, verdict, problems, warnings)
     values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb, $9::jsonb)`,
    [orderId, businessId, sha256, e2eId || null, amountCents ?? null, JSON.stringify(extracted || {}), verdict, JSON.stringify(problems), JSON.stringify(warnings)]);

export async function getOrderByNum(businessId, num) {
  const { rows } = await query('select * from orders where business_id = $1 and num = $2', [businessId, num]);
  return rows[0] || null;
}

export async function listOrders(businessId, statuses = null, limit = 100) {
  const { rows } = await query(
    `select o.*, c.contact_name,
       (select verdict from order_proofs p where p.order_id = o.id order by p.id desc limit 1) as proof_verdict,
       (select problems from order_proofs p where p.order_id = o.id order by p.id desc limit 1) as proof_problems
     from orders o join conversations c on c.id = o.conversation_id
     where o.business_id = $1 and o.status <> 'draft' and ($2::text[] is null or o.status = any($2::text[]))
     order by o.created_at desc limit $3`, [businessId, statuses, limit]);
  return rows;
}
