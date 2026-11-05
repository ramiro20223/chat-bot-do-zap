// Regras de pedido, desconto e comandos do dono (puro). Dinheiro SEMPRE em centavos inteiros.
import { normalize } from './text.js';

export const toCents = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) : null; };
export const fmtCents = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** "10", "10%", "7,5" -> número entre 0 e 100 (limite de desconto definido pelo dono). */
export function parseDiscountLimit(v) {
  const n = Number(String(v ?? '').replace(',', '.').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), 100) : 0;
}

/**
 * Monta o pedido a partir do catálogo. O valor vem SEMPRE do catálogo; o desconto é limitado ao máximo do dono.
 * @param {{items: Array, catalog: Map<string, object>, discountPct?: number, maxDiscountPct?: number}} p
 */
export function buildOrder({ items, catalog, discountPct = 0, maxDiscountPct = 0 }) {
  if (!Array.isArray(items) || !items.length) return { ok: false, errors: ['Nenhum item informado'] };
  const errors = []; const lines = [];
  for (const it of items) {
    const p = catalog.get(String(it?.produto_id || ''));
    const qty = Number(it?.quantidade ?? 1);
    if (!p) { errors.push('Produto não encontrado: use o produto_id retornado por buscar_produtos'); continue; }
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) { errors.push(`Quantidade inválida para ${p.name}`); continue; }
    if (!p.active || !p.in_stock) { errors.push(`${p.name} está sem estoque`); continue; }
    const unit = toCents(p.price);
    if (unit === null || unit <= 0) { errors.push(`${p.name} não tem preço cadastrado (chame um atendente)`); continue; }
    lines.push({ productId: p.id, name: p.name, unitCents: unit, quantity: qty, note: String(it?.observacao || '').trim().slice(0, 300) || null, subtotalCents: unit * qty });
  }
  if (errors.length) return { ok: false, errors };

  const subtotalCents = lines.reduce((s, l) => s + l.subtotalCents, 0);
  const requested = Math.max(0, Number(discountPct) || 0);
  const applied = Math.min(requested, Math.max(0, Number(maxDiscountPct) || 0));
  const discountCents = Math.round((subtotalCents * applied) / 100);
  const totalCents = subtotalCents - discountCents;
  if (totalCents <= 0) return { ok: false, errors: ['Total inválido'] };
  return { ok: true, order: { lines, subtotalCents, discountPct: applied, discountCents, totalCents, discountClamped: requested > applied, requestedDiscountPct: requested } };
}

export function describeLines(lines) {
  return lines.map((l) => `${l.quantity}x ${l.name} — ${fmtCents(l.subtotalCents)}${l.note ? ` (${l.note})` : ''}`).join('\n');
}

/** Interpreta mensagens do dono: "ok 12", "recusar 12 valor errado", "cancelar 12", "pedidos", "ajuda". */
export function parseOwnerCommand(text) {
  const t = String(text ?? '').trim().replace(/^[*_#\s]+|[*_\s]+$/g, '');
  const flat = normalize(t);
  let m;
  if ((m = /^(ok|confirmar|confirma|confirmado|pago|recebido|aprovar|aprovado)\s*(\d+)$/.exec(flat))) return { cmd: 'confirmar', num: Number(m[2]) };
  if ((m = /^(recusar|recusado|negar|rejeitar|nao recebi)\s*(\d+)\s*(.*)$/.exec(flat))) {
    const reason = t.replace(/^\S+\s*#?\s*\d+\s*/i, '').trim();
    return { cmd: 'recusar', num: Number(m[2]), reason: reason || null };
  }
  if ((m = /^(cancelar|cancela|cancelado)\s*(\d+)$/.exec(flat))) return { cmd: 'cancelar', num: Number(m[2]) };
  if (/^(pedidos|lista|pendentes|pendente)$/.test(flat)) return { cmd: 'pedidos' };
  if (/^(ajuda|help|menu|comandos)$/.test(flat)) return { cmd: 'ajuda' };
  return null;
}

export const OWNER_HELP = '*Comandos do dono*\n• *pedidos* — lista os pedidos pendentes\n• *ok 12* — confirma o pagamento do pedido 12\n• *recusar 12 motivo* — pede novo comprovante\n• *cancelar 12* — cancela o pedido';

export const STATUS_PT = {
  draft: 'montando pedido', awaiting_payment: 'aguardando pagamento', proof_received: 'comprovante recebido',
  proof_review: 'comprovante precisa de revisão', paid: 'pago', cancelled: 'cancelado',
};
export const phoneOf = (jid) => `+${String(jid || '').split('@')[0].split(':')[0]}`;
