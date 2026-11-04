import { cookies } from 'next/headers';
import { query } from '@/lib/db.js';
import { verifyToken, COOKIE } from '@/lib/auth.js';
import { clearSessionCookie, unauthorized } from '@/lib/session.js';

// "Sair de todos os aparelhos": aumenta a versão das sessões e todos os logins antigos deixam de valer.
export async function POST() {
  const token = (await cookies()).get(COOKIE)?.value;
  const s = token && (await verifyToken(token));
  if (!s) return unauthorized();
  await query('update users set token_version = token_version + 1 where id = $1', [s.userId]);
  await clearSessionCookie();
  return Response.json({ ok: true });
}
