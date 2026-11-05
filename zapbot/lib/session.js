import { cookies } from 'next/headers';
import { COOKIE, MAX_AGE, verifyToken } from './auth.js';
import { cookieSecure } from './web-security.js';
import { query } from './db.js';
import { hasAccess, subscriptionRequired, statusOf } from './subscription.js';

async function sessionUser() {
  const token = (await cookies()).get(COOKIE)?.value;
  const s = token && (await verifyToken(token));
  if (!s) return null;
  const { rows } = await query(
    'select id, email, account_code, subscription_until, blocked, token_version from users where id = $1', [s.userId]);
  const u = rows[0];
  return u && Number(u.token_version) === s.tv ? u : null;   // sessão revogada = null
}

/** Conta do usuário logado (mesmo sem assinatura ativa) + situação da assinatura. */
export async function currentAccount() {
  const u = await sessionUser();
  if (!u) return null;
  const { token_version: _tv, ...user } = u;
  return { ...user, status: statusOf(user) };
}

/** Empresa do usuário logado, somente se a assinatura estiver ativa (ou null). */
export async function currentBusiness() {
  const u = await sessionUser();
  if (!u || !hasAccess(u, new Date(), subscriptionRequired(process.env))) return null;
  const { rows } = await query('select * from businesses where user_id = $1', [u.id]);
  return rows[0] || null;
}

const cookieOpts = () => ({ httpOnly: true, sameSite: 'lax', path: '/', secure: cookieSecure(process.env) });

export async function setSessionCookie(token) {
  (await cookies()).set(COOKIE, token, { ...cookieOpts(), maxAge: MAX_AGE });
}

export async function clearSessionCookie() {
  (await cookies()).set(COOKIE, '', { ...cookieOpts(), maxAge: 0 });
}

/**
 * Lê o corpo JSON com teto de tamanho. Corpo inválido ou grande demais vira {} (as rotas respondem 400).
 */
export async function readJson(req, maxBytes = 100_000) {
  if (Number(req.headers.get('content-length') || 0) > maxBytes) return {};
  try {
    const text = await req.text();
    if (text.length > maxBytes) return {};
    const v = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/** Sem sessão: 401 (vai para o login). Com sessão mas sem assinatura ativa: 402 (vai para a tela da assinatura). */
export async function unauthorized() {
  const acc = await currentAccount().catch(() => null);
  if (acc) return Response.json({ error: 'Assinatura inativa. Ative para usar o painel.', subscription: acc.status }, { status: 402 });
  return Response.json({ error: 'Faça login para continuar' }, { status: 401 });
}
export const bad = (msg, status = 400) => Response.json({ error: msg }, { status });
