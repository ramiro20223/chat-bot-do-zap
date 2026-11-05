import { query } from '@/lib/db.js';
import { currentBusiness, unauthorized } from '@/lib/session.js';

export const dynamic = 'force-dynamic';

export async function GET() {
  const b = await currentBusiness();
  if (!b) return await unauthorized();
  const { rows } = await query(
    `select c.id, c.jid, c.contact_name, c.last_message_at, (c.paused_until > now()) as paused,
       (select body from messages m where m.conversation_id = c.id order by id desc limit 1) as last_body
     from conversations c where c.business_id = $1 and c.jid not like 'teste:%'
     order by c.last_message_at desc limit 50`,
    [b.id],
  );
  return Response.json(rows.map((r) => ({ ...r, phone: r.jid.split('@')[0] })));
}
