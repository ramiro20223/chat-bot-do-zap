import { query } from '@/lib/db.js';
import { hashPassword, signToken, safeEqual } from '@/lib/auth.js';
import { createLimiter } from '@/lib/limits.js';
import { clientIp, passwordProblem, registrationPolicy } from '@/lib/web-security.js';
import { setSessionCookie, readJson, bad } from '@/lib/session.js';
import { generateAccountCode } from '@/lib/subscription.js';

const perIp = createLimiter({ max: 5, windowMs: 60 * 60_000 });

export async function POST(req) {
  const policy = registrationPolicy(process.env);
  if (!policy.open) return bad('Cadastro fechado. Peça um convite ao administrador.', 403);

  const ip = clientIp(req.headers.get('x-forwarded-for'), Number(process.env.TRUST_PROXY_HOPS || 1));
  if (!perIp.allow(ip)) return Response.json({ error: 'Muitas tentativas. Tente mais tarde.' }, { status: 429, headers: { 'Retry-After': '3600' } });

  const { email, password, businessName, inviteCode } = await readJson(req);
  if (policy.code && !safeEqual(inviteCode, policy.code)) return bad('Código de convite inválido', 403);

  const mail = String(email || '').trim().toLowerCase();
  if (mail.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return bad('E-mail inválido');
  if (process.env.ADMIN_EMAIL && mail === String(process.env.ADMIN_EMAIL).trim().toLowerCase()) return bad('Este e-mail já está cadastrado', 409);   // reservado ao administrador
  const weak = passwordProblem(password, mail);
  if (weak) return bad(weak);
  const name = String(businessName || '').trim().slice(0, 120) || 'Minha empresa';

  if ((await query('select 1 from users where email = $1', [mail])).rowCount) return bad('Este e-mail já está cadastrado', 409);

  // O ID (ex.: ZB-7K2M9Q) é o que o cliente manda para o administrador no WhatsApp. Se por azar repetir, sorteia outro.
  const hash = await hashPassword(password);
  let user = null; let code;
  for (let i = 0; i < 6 && !user; i++) {
    code = generateAccountCode();
    try {
      user = (await query('insert into users (email, password_hash, account_code) values ($1, $2, $3) returning id, token_version', [mail, hash, code])).rows[0];
    } catch (e) {
      if (e.code === '23505' && String(e.constraint || '').includes('account_code')) continue;
      if (e.code === '23505') return bad('Este e-mail já está cadastrado', 409);
      throw e;
    }
  }
  if (!user) return bad('Não foi possível criar a conta agora. Tente novamente.', 503);
  await query('insert into businesses (user_id, name) values ($1, $2)', [user.id, name]);
  await setSessionCookie(await signToken(user.id, Number(user.token_version)));
  return Response.json({ ok: true, accountCode: code });
}
