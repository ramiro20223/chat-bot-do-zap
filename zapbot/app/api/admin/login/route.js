import { query } from '@/lib/db.js';
import { checkAdminLogin, adminConfigured } from '@/lib/admin-auth.js';
import { signAdminToken, setAdminCookie } from '@/lib/admin-session.js';
import { createLimiter } from '@/lib/limits.js';
import { clientIp } from '@/lib/web-security.js';
import { readJson } from '@/lib/session.js';

// Freios fortes: poucas tentativas por IP e um teto global (quem tentar de vários IPs também trava).
const byIp = createLimiter({ max: 5, windowMs: 15 * 60_000 });
const global = createLimiter({ max: 30, windowMs: 60 * 60_000 });
const FAIL = () => Response.json({ error: 'Dados incorretos' }, { status: 401 });

export async function POST(req) {
  const ip = clientIp(req.headers.get('x-forwarded-for'), Number(process.env.TRUST_PROXY_HOPS || 1));
  if (byIp.blocked(ip) || global.blocked('all')) {
    return Response.json({ error: 'Muitas tentativas. Aguarde alguns minutos.' }, { status: 429, headers: { 'Retry-After': '900' } });
  }
  if (!adminConfigured(process.env)) return FAIL();

  const { email, password, code } = await readJson(req, 2000);
  const last = (await query('select totp_last_step from admin_state where id = 1')).rows[0]?.totp_last_step;
  const r = await checkAdminLogin(
    { email: String(email || '').slice(0, 254), password: String(password || '').slice(0, 200), code: String(code || '').slice(0, 10) },
    process.env, { lastStep: last == null ? null : Number(last) });
  if (!r.ok) { byIp.record(ip); global.record('all'); return FAIL(); }

  // Grava o código usado (atômico): o mesmo código de 6 dígitos não entra duas vezes.
  const used = await query('update admin_state set totp_last_step = $1 where id = 1 and (totp_last_step is null or totp_last_step < $1)', [r.step]);
  if (!used.rowCount) { byIp.record(ip); return FAIL(); }
  byIp.clear(ip);
  await setAdminCookie(await signAdminToken());
  return Response.json({ ok: true });
}
