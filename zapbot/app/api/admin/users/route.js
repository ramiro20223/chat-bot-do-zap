import { query } from '@/lib/db.js';
import { isAdmin } from '@/lib/admin-session.js';
import { readJson } from '@/lib/session.js';
import { hashPassword } from '@/lib/auth.js';
import { generateTempPassword } from '@/lib/password.js';
import { statusOf, extendUntil, normalizeCode, PLAN_DAYS } from '@/lib/subscription.js';

const deny = () => Response.json({ error: 'Não autorizado' }, { status: 401 });
const safe = (u) => ({ company: u.company || null, id: u.id, email: u.email, accountCode: u.account_code, until: u.subscription_until, blocked: u.blocked, status: statusOf(u), createdAt: u.created_at });

export async function GET(req) {
  if (!(await isAdmin())) return deny();
  const q = String(new URL(req.url).searchParams.get('q') || '').trim().slice(0, 100);
  const code = normalizeCode(q);
  const { rows } = await query(
    `select u.id, u.email, u.account_code, u.subscription_until, u.blocked, u.created_at, b.name as company
     from users u left join businesses b on b.user_id = u.id
     where ($1 = '' or u.email ilike '%' || $1 || '%' or b.name ilike '%' || $1 || '%' or u.account_code = $2)
     order by (u.subscription_until is null and not u.blocked) desc, u.created_at desc limit 200`,
    [q.replace(/[%_\\]/g, ''), code || '']);
  return Response.json({ users: rows.map(safe) });
}

// Ações: activate/extend (+30 dias ou "days"), revoke (zera a assinatura), block/unblock.
export async function POST(req) {
  if (!(await isAdmin())) return deny();
  const { id, action, days, note } = await readJson(req, 2000);
  const u = (await query('select id, subscription_until, blocked from users where id = $1', [String(id || '')]).catch(() => ({ rows: [] }))).rows[0];
  if (!u) return Response.json({ error: 'Cliente não encontrado' }, { status: 404 });

  const n = Math.min(Math.max(Math.trunc(Number(days)) || PLAN_DAYS, 1), 366);
  let sql; let params; let d = null;
  switch (action) {
    case 'activate': case 'extend':
      sql = 'update users set subscription_until = $2 where id = $1'; params = [u.id, extendUntil(u.subscription_until, new Date(), n)]; d = n; break;
    case 'revoke': sql = 'update users set subscription_until = null where id = $1'; params = [u.id]; break;
    case 'block': sql = 'update users set blocked = true, token_version = token_version + 1 where id = $1'; params = [u.id]; break;   // derruba as sessões
    case 'unblock': sql = 'update users set blocked = false where id = $1'; params = [u.id]; break;
    case 'reset_password': {
      // Senha provisória: aparece UMA vez para você mandar ao cliente. Derruba as sessões abertas dele.
      const temp = generateTempPassword();
      await query('update users set password_hash = $2, token_version = token_version + 1 where id = $1', [u.id, await hashPassword(temp)]);
      await query('insert into subscription_events (user_id, action) values ($1, $2)', [u.id, 'reset_password']);
      return Response.json({ tempPassword: temp });
    }
    default: return Response.json({ error: 'Ação inválida' }, { status: 400 });
  }
  await query(sql, params);
  await query('insert into subscription_events (user_id, action, days, note) values ($1, $2, $3, $4)', [u.id, action, d, String(note || '').slice(0, 200) || null]);
  const out = (await query('select u.id, u.email, u.account_code, u.subscription_until, u.blocked, u.created_at, b.name as company from users u left join businesses b on b.user_id = u.id where u.id = $1', [u.id])).rows[0];
  return Response.json({ user: safe(out) });
}
