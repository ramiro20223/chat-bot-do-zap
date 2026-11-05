// Sessão do ADMINISTRADOR: separada da dos clientes (outro cookie, outra audiência, 2 h de validade).
// Segue o padrão do auth.js: segredo AUTH_SECRET, mas o token de cliente NUNCA vale como token de admin (e vice-versa).
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { cookieSecure } from './web-security.js';

export const ADMIN_COOKIE = cookieSecure(process.env) ? '__Host-zap_admin' : 'zap_admin';
export const ADMIN_MAX_AGE = 60 * 60 * 2;
const ISS = 'zapbot'; const AUD = 'zapbot-admin';

const secret = () => {
  const s = process.env.AUTH_SECRET;
  if (process.env.NODE_ENV === 'production') {
    if (!s || s.length < 32) throw new Error('AUTH_SECRET ausente ou curta');
    return new TextEncoder().encode(s);
  }
  return new TextEncoder().encode(s || 'dev-only-secret-change-me');
};

export const signAdminToken = () =>
  new SignJWT({ role: 'admin' }).setProtectedHeader({ alg: 'HS256' }).setSubject('admin').setIssuer(ISS).setAudience(AUD)
    .setIssuedAt().setExpirationTime(`${ADMIN_MAX_AGE}s`).sign(secret());

export async function verifyAdminToken(token) {
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'], issuer: ISS, audience: AUD });
    return payload.role === 'admin';
  } catch { return false; }
}

export async function isAdmin() {
  const t = (await cookies()).get(ADMIN_COOKIE)?.value;
  return Boolean(t) && (await verifyAdminToken(t));
}

const opts = () => ({ httpOnly: true, sameSite: 'strict', path: '/', secure: cookieSecure(process.env) });
export async function setAdminCookie(token) { (await cookies()).set(ADMIN_COOKIE, token, { ...opts(), maxAge: ADMIN_MAX_AGE }); }
export async function clearAdminCookie() { (await cookies()).set(ADMIN_COOKIE, '', { ...opts(), maxAge: 0 }); }
