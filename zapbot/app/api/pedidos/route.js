import { currentBusiness, unauthorized, bad } from '@/lib/session.js';
import { listOrders } from '@/lib/orders.js';
import { applyOrderAction } from '@/lib/order-tools.js';
import { sendToCustomer } from '@/lib/wa.js';

export const dynamic = 'force-dynamic';

export async function GET() {
  const b = await currentBusiness();
  if (!b) return unauthorized();
  const rows = await listOrders(b.id, null, 100);
  return Response.json(rows.map((o) => ({
    id: o.id, num: Number(o.num), status: o.status, customer: o.customer_name || o.contact_name, phone: o.jid.split('@')[0],
    lines: o.lines, subtotal_cents: o.subtotal_cents, discount_pct: Number(o.discount_pct), total_cents: o.total_cents,
    delivery: o.delivery, address: o.address, details: o.details, created_at: o.created_at,
    proof_verdict: o.proof_verdict, proof_problems: o.proof_problems,
  })));
}

// Ações do dono pelo painel: confirmar | recusar | cancelar
export async function POST(req) {
  const b = await currentBusiness();
  if (!b) return unauthorized();
  const { num, action, reason } = await req.json().catch(() => ({}));
  if (!['confirmar', 'recusar', 'cancelar'].includes(action) || !Number.isInteger(num)) return bad('Ação inválida');
  const r = await applyOrderAction({ business: b, num, action, reason: reason ? String(reason).slice(0, 300) : null, notifyCustomer: (jid, t) => sendToCustomer(b.id, jid, t) });
  return Response.json(r, { status: r.ok ? 200 : 400 });
}
