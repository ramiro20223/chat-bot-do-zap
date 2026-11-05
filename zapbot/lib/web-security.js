// Regras de segurança web puras (sem dependências), usadas também pelo middleware.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s) => UUID.test(String(s ?? ''));

/** Em produção o cookie usa o prefixo __Host-: só vale com HTTPS, no domínio exato e sem ser sobrescrito por subdomínios. */
export const cookieSecure = (env) => env.NODE_ENV === 'production' && env.COOKIE_SECURE !== 'false';
export const sessionCookieName = (env) => (cookieSecure(env) ? '__Host-zap_session' : 'zap_session');

/** CSRF: pedidos que alteram dados só valem se vierem do próprio site. */
export function csrfOk({ method, origin, host, forwardedHost, secFetchSite }) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(String(method || '').toUpperCase())) return true;
  if (origin) {
    let h;
    try { h = new URL(origin).host; } catch { return false; }   // "null" e lixo são recusados
    return h === host || (!!forwardedHost && h === forwardedHost);
  }
  if (secFetchSite) return secFetchSite === 'same-origin' || secFetchSite === 'none';
  return true; // fora do navegador não há cookie "automático", então não há CSRF
}

/** IP do cliente atrás de proxy: o primeiro item de X-Forwarded-For é forjável; contamos `hops` proxies de confiança a partir do fim. */
export function clientIp(xForwardedFor, hops = 1) {
  const parts = String(xForwardedFor || '').split(',').map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts[Math.max(0, parts.length - Math.max(1, hops))] : 'local';
}

const COMMON = new Set(['1234567890', '12345678910', 'senha12345', 'password123', 'qwertyuiop', 'abcdefghij', '0123456789', 'senhasenha', 'mudar12345', 'brasil1234']);

/** Mensagem de erro se a senha for fraca; null se estiver boa. bcrypt só lê 72 bytes, por isso o teto. */
export function passwordProblem(pw, email = '') {
  if (typeof pw !== 'string' || pw.length < 10) return 'A senha precisa ter pelo menos 10 caracteres';
  if (Buffer.byteLength(pw) > 72) return 'A senha pode ter no máximo 72 caracteres';
  const low = pw.toLowerCase();
  if (COMMON.has(low) || /^(.)\1+$/.test(pw)) return 'Essa senha é muito comum. Escolha outra';
  if (/^\d+$/.test(pw)) return 'Use também letras na senha';
  const local = String(email).split('@')[0].toLowerCase();
  if (local.length >= 4 && low.includes(local)) return 'Não use o seu e-mail dentro da senha';
  return null;
}

/** Quem pode criar conta: com código de convite, aberto, ou fechado (padrão em produção). */
export function registrationPolicy(env) {
  const code = String(env.REGISTRATION_CODE || '').trim();
  if (code.length >= 8) return { open: true, code };
  if (env.ALLOW_REGISTRATION === 'true') return { open: true, code: null };
  return { open: env.NODE_ENV !== 'production', code: null };
}
