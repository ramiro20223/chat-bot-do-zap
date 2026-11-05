import { query } from '@/lib/db.js';
import { checkPassword, hashPassword, signToken } from '@/lib/auth.js';
import { passwordProblem } from '@/lib/web-security.js';
import { createLimiter } from '@/lib/limits.js';
import { currentAccount, readJson, setSessionCookie, bad } from '@/lib/session.js';

const tries = createLimiter({ max: 5, windowMs: 10 * 60_000 });

// O cliente troca a própria senha (útil depois que você mandar uma provisória). Funciona mesmo sem assinatura ativa.
export async function POST(req) {
  const a = await currentAccount();
  if (!a) return Response.json({ error: 'Faça login para continuar' }, { status: 401 });
  if (tries.blocked(a.id)) return Response.json({ error: 'Muitas tentativas. Aguarde alguns minutos.' }, { status: 429 });

  const { current, next } = await readJson(req, 2000);
  const row = (await query('select password_hash from users where id = $1', [a.id])).rows[0];
  if (!row || !(await checkPassword(String(current || '').slice(0, 200), row.password_hash))) { tries.record(a.id); return bad('Senha atual incorreta', 401); }
  const weak = passwordProblem(next, a.email);
  if (weak) return bad(weak);

  const u = (await query('update users set password_hash = $2, token_version = token_version + 1 where id = $1 returning token_version', [a.id, await hashPassword(next)])).rows[0];
  await setSessionCookie(await signToken(a.id, Number(u.token_version)));   // este aparelho continua logado; os outros caem
  tries.clear(a.id);
  return Response.json({ ok: true });
}
