import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';

export const COOKIE = 'zap_session';
export const MAX_AGE = 60 * 60 * 24 * 30; // 30 dias

const secret = () => {
  const s = process.env.AUTH_SECRET;
  if (!s && process.env.NODE_ENV === 'production') throw new Error('AUTH_SECRET não configurada');
  return new TextEncoder().encode(s || 'dev-only-secret-change-me');
};

export const hashPassword = (pw) => bcrypt.hash(pw, 10);
export const checkPassword = (pw, hash) => bcrypt.compare(pw, hash);

export const signToken = (userId) =>
  new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(userId).setIssuedAt().setExpirationTime(`${MAX_AGE}s`).sign(secret());

export async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'] });
    return payload.sub ? { userId: payload.sub } : null;
  } catch {
    return null;
  }
}

// Limite simples de tentativas de login (por IP+email), em memória.
const attempts = new Map();
export function tooManyAttempts(key, max = 8, windowMs = 10 * 60_000) {
  const now = Date.now();
  const list = (attempts.get(key) || []).filter((t) => now - t < windowMs);
  attempts.set(key, list);
  return list.length >= max;
}
export const recordAttempt = (key) => attempts.set(key, [...(attempts.get(key) || []), Date.now()]);
