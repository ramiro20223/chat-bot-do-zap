// Credenciais do ADMIN (você). Ficam só nas variáveis de ambiente do servidor: não existe cadastro de admin pelo app,
// então ninguém consegue criar nem "promover" uma conta de administrador. Senha com scrypt + código do app autenticador.
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { verifyTotp } from './totp.js';

const scrypt = promisify(crypto.scrypt);
const DEFAULT = { N: 2 ** 15, r: 8, p: 1 };
const maxmem = (N, r) => 128 * N * r * 2 + 1024 * 1024;

/** Formato: scrypt$N$r$p$salt(base64)$hash(base64) */
export async function hashAdminPassword(password, { N, r, p } = DEFAULT) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(String(password), salt, 64, { N, r, p, maxmem: maxmem(N, r) });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyAdminPassword(password, stored) {
  const [alg, N, r, p, saltB64, hashB64] = String(stored ?? '').split('$');
  if (alg !== 'scrypt' || !saltB64 || !hashB64) return false;
  const params = { N: Number(N), r: Number(r), p: Number(p) };
  if (![params.N, params.r, params.p].every(Number.isInteger) || params.N > 2 ** 20) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const got = await scrypt(String(password), Buffer.from(saltB64, 'base64'), expected.length, { ...params, maxmem: maxmem(params.N, params.r) });
  return got.length === expected.length && crypto.timingSafeEqual(got, expected);
}

export const adminConfigured = (env) => !!(env.ADMIN_EMAIL && env.ADMIN_PASSWORD_HASH && env.ADMIN_TOTP_SECRET);

const sha = (s) => crypto.createHash('sha256').update(String(s ?? '').trim().toLowerCase()).digest();
let dummyHash;

/**
 * Confere e-mail, senha e código. Faz SEMPRE as três conferências (mesmo tempo para qualquer erro) e devolve só ok/não.
 * `lastStep` = última janela de código já usada com sucesso: o mesmo código não vale duas vezes.
 */
export async function checkAdminLogin({ email, password, code }, env, { now = Date.now(), lastStep = null } = {}) {
  if (!adminConfigured(env)) return { ok: false };
  const emailOk = crypto.timingSafeEqual(sha(email), sha(env.ADMIN_EMAIL));
  dummyHash ??= await hashAdminPassword(crypto.randomBytes(8).toString('hex'), { N: 2 ** 15, r: 8, p: 1 });
  const passOk = await verifyAdminPassword(password, emailOk ? env.ADMIN_PASSWORD_HASH : dummyHash);
  let step = null;
  try { step = verifyTotp(env.ADMIN_TOTP_SECRET, code, { now }); } catch { step = null; }
  const fresh = step !== null && (lastStep === null || step > lastStep);
  return emailOk && passOk && fresh ? { ok: true, step } : { ok: false };
}
