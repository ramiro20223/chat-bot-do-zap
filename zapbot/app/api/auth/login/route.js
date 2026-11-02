import { query } from '@/lib/db.js';
import { checkPassword, signToken, tooManyAttempts, recordAttempt } from '@/lib/auth.js';
import { setSessionCookie, bad } from '@/lib/session.js';

export async function POST(req) {
  const { email, password } = await req.json().catch(() => ({}));
  const mail = String(email || '').trim().toLowerCase();
  const key = `login:${req.headers.get('x-forwarded-for') || 'local'}:${mail}`;
  if (tooManyAttempts(key)) return bad('Muitas tentativas. Aguarde alguns minutos.', 429);

  const user = (await query('select id, password_hash from users where email = $1', [mail])).rows[0];
  if (!user || !(await checkPassword(String(password || ''), user.password_hash))) {
    recordAttempt(key);
    return bad('E-mail ou senha incorretos', 401);
  }
  await setSessionCookie(await signToken(user.id));
  return Response.json({ ok: true });
}
