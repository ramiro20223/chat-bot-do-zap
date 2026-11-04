import { cookies } from 'next/headers';
import { COOKIE, MAX_AGE, verifyToken } from './auth.js';
import { cookieSecure } from './web-security.js';
import { query } from './db.js';

/** Empresa do usuário logado (ou null). Também confere se a sessão não foi revogada. */
export async function currentBusiness() {
  const token = (await cookies()).get(COOKIE)?.value;
  const s = token && (await verifyToken(token));
  if (!s) return null;
  const { rows } = await query(
    'select b.*, u.token_version from businesses b join users u on u.id = b.user_id where u.id = $1', [s.userId]);
  const row = rows[0];
  if (!row || Number(row.token_version) !== s.tv) return null;
  const { token_version: _tv, ...business } = row;
  return business;
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

export const unauthorized = () => Response.json({ error: 'Faça login para continuar' }, { status: 401 });
export const bad = (msg, status = 400) => Response.json({ error: msg }, { status });
