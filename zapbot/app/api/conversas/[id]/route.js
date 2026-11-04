import { isUuid } from '@/lib/web-security.js';
import { query } from '@/lib/db.js';
import { currentBusiness, unauthorized } from '@/lib/session.js';

export const dynamic = 'force-dynamic';

export async function GET(_req, { params }) {
  const b = await currentBusiness();
  if (!b) return unauthorized();
  const { id } = await params;
  if (!isUuid(id)) return Response.json({ error: 'Não encontrado' }, { status: 404 });
  const { rows } = await query(
    `select m.direction, m.body, m.created_at from messages m join conversations c on c.id = m.conversation_id
     where c.id = $1 and c.business_id = $2 order by m.id desc limit 100`,
    [id, b.id],
  );
  return Response.json(rows.reverse());
}

// Retoma o bot numa conversa que estava pausada (atendimento humano).
export async function POST(_req, { params }) {
  const b = await currentBusiness();
  if (!b) return unauthorized();
  const { id } = await params;
  if (!isUuid(id)) return Response.json({ error: 'Não encontrado' }, { status: 404 });
  await query('update conversations set paused_until = null where id = $1 and business_id = $2', [id, b.id]);
  return Response.json({ ok: true });
}
