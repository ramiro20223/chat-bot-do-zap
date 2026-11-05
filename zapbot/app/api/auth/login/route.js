import { query } from '@/lib/db.js';
import { checkPassword, burnPasswordCheck, signToken, hashPassword, needsRehash } from '@/lib/auth.js';
import { statusOf } from '@/lib/subscription.js';
import { createLimiter } from '@/lib/limits.js';
import { clientIp } from '@/lib/web-security.js';
import { setSessionCookie, readJson, bad } from '@/lib/session.js';

// Três freios: por e-mail (contra rodízio de IPs), por IP+e-mail e por IP (contra varredura de e-mails).
const byEmail = createLimiter({ max: 15, windowMs: 10 * 60_000 });
const byPair = createLimiter({ max: 6, windowMs: 10 * 60_000 });
const byIp = createLimiter({ max: 50, windowMs: 10 * 60_000 });

export async function POST(req) {
  const { email, password } = await readJson(req);
  const mail = String(email || '').trim().toLowerCase().slice(0, 254);
  const ip = clientIp(req.headers.get('x-forwarded-for'), Number(process.env.TRUST_PROXY_HOPS || 1));
  const pair = `${ip}|${mail}`;

  if (byEmail.blocked(mail) || byPair.blocked(pair) || byIp.blocked(ip)) {
    return Response.json({ error: 'Muitas tentativas. Aguarde alguns minutos.' }, { status: 429, headers: { 'Retry-After': '600' } });
  }

  const pw = typeof password === 'string' ? password.slice(0, 200) : '';
  const user = (await query('select id, password_hash, token_version, subscription_until, blocked from users where email = $1', [mail])).rows[0];
  const ok = user ? await checkPassword(pw, user.password_hash) : (await burnPasswordCheck(pw), false);
  if (!ok) {
    byEmail.record(mail); byPair.record(pair); byIp.record(ip);
    return bad('E-mail ou senha incorretos', 401);
  }
  byPair.clear(pair);
  if (needsRehash(user.password_hash)) await query('update users set password_hash = $1 where id = $2', [await hashPassword(pw), user.id]).catch(() => {});
  await setSessionCookie(await signToken(user.id, Number(user.token_version)));
  return Response.json({ ok: true, status: statusOf(user) });
}
