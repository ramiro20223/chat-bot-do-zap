import { cookies } from 'next/headers';
import { COOKIE, MAX_AGE, verifyToken } from './auth.js';
import { query } from './db.js';

/** Empresa do usuário logado (ou null). */
export async function currentBusiness() {
  const token = (await cookies()).get(COOKIE)?.value;
  const s = token && (await verifyToken(token));
  if (!s) return null;
  const { rows } = await query('select * from businesses where user_id = $1', [s.userId]);
  return rows[0] || null;
}

export async function setSessionCookie(token) {
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: MAX_AGE,
    secure: process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false',
  });
}

export const clearSessionCookie = async () => (await cookies()).delete(COOKIE);

export const unauthorized = () => Response.json({ error: 'Faça login para continuar' }, { status: 401 });
export const bad = (msg, status = 400) => Response.json({ error: msg }, { status });
