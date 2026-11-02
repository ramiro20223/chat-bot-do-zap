import { query } from '@/lib/db.js';
import { hashPassword, signToken, tooManyAttempts, recordAttempt } from '@/lib/auth.js';
import { setSessionCookie, bad } from '@/lib/session.js';

export async function POST(req) {
  const ip = req.headers.get('x-forwarded-for') || 'local';
  if (tooManyAttempts(`reg:${ip}`, 10, 60 * 60_000)) return bad('Muitas tentativas. Tente mais tarde.', 429);
  recordAttempt(`reg:${ip}`);

  const { email, password, businessName } = await req.json().catch(() => ({}));
  const mail = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return bad('E-mail inválido');
  if (String(password || '').length < 8) return bad('A senha precisa ter pelo menos 8 caracteres');
  const name = String(businessName || '').trim().slice(0, 120);
  if (!name) return bad('Informe o nome da empresa');

  const exists = await query('select 1 from users where email = $1', [mail]);
  if (exists.rowCount) return bad('Este e-mail já está cadastrado', 409);

  const user = (await query('insert into users (email, password_hash) values ($1, $2) returning id', [mail, await hashPassword(password)])).rows[0];
  await query('insert into businesses (user_id, name) values ($1, $2)', [user.id, name]);
  await setSessionCookie(await signToken(user.id));
  return Response.json({ ok: true });
}
