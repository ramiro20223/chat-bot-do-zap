import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { sessionCookieName } from './web-security.js';
import { pepperInput, isPeppered, stripPepperPrefix, PEPPERED } from './password.js';

export const COOKIE = sessionCookieName(process.env);
export const MAX_AGE = 60 * 60 * 24 * 7; // 7 dias
const ISS = 'zapbot'; const AUD = 'zapbot-panel';

const secret = () => {
  const s = process.env.AUTH_SECRET;
  if (process.env.NODE_ENV === 'production') {
    if (!s || s.length < 32) throw new Error('AUTH_SECRET ausente ou curta (mínimo 32 caracteres)');
    return new TextEncoder().encode(s);
  }
  return new TextEncoder().encode(s || 'dev-only-secret-change-me');   // só em desenvolvimento
};

// Senha do cliente: HMAC com a "pimenta" (segredo só do servidor) + bcrypt custo 12. Quem roubar o banco não consegue nem testar senhas.
const pepper = () => process.env.PASSWORD_PEPPER || null;

export async function hashPassword(pw) {
  const p = pepper();
  return p ? PEPPERED + (await bcrypt.hash(pepperInput(pw, p), 12)) : bcrypt.hash(pw, 12);
}

export async function checkPassword(pw, hash) {
  if (isPeppered(hash)) {
    const p = pepper();
    return p ? bcrypt.compare(pepperInput(pw, p), stripPepperPrefix(hash)) : false;
  }
  return bcrypt.compare(pw, hash);   // contas antigas, sem pimenta
}

/** Conta antiga (sem pimenta) e pimenta já configurada: no próximo login correto a senha é regravada com pimenta. */
export const needsRehash = (hash) => !isPeppered(hash) && Boolean(pepper());

// Gasta o mesmo tempo de uma conferência real quando o e-mail não existe (não dá para descobrir e-mails cadastrados pelo tempo da resposta).
let dummy;
export async function burnPasswordCheck(pw) {
  dummy ??= bcrypt.hashSync(crypto.randomBytes(12).toString('hex'), 12);
  await bcrypt.compare(String(pw ?? ''), dummy);
}

/** `tv` = versão das sessões do usuário. "Sair de todos os aparelhos" aumenta a versão e invalida todos os logins antigos. */
export const signToken = (userId, tv = 0) =>
  new SignJWT({ tv }).setProtectedHeader({ alg: 'HS256' }).setSubject(userId).setIssuer(ISS).setAudience(AUD)
    .setIssuedAt().setExpirationTime(`${MAX_AGE}s`).sign(secret());

export async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'], issuer: ISS, audience: AUD });
    return payload.sub ? { userId: payload.sub, tv: Number(payload.tv ?? 0) } : null;
  } catch {
    return null;
  }
}

export function safeEqual(a, b) {
  const h = (x) => crypto.createHash('sha256').update(String(x ?? '')).digest();
  return crypto.timingSafeEqual(h(a), h(b));
}
