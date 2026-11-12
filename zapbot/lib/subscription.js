// Assinatura e ID da conta (puro, sem dependências além do crypto do Node).
import crypto from 'node:crypto';

export const PRICE_CENTS = 9999;           // R$ 99,99 por mês
export const PLAN_DAYS = 30;
export const PRICE_LABEL = 'R$ 99,99';

// Sem 0, O, 1, I e L: o cliente vai ditar/copiar o ID, então nada de caracteres que se confundem.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_RE = /^ZB-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

export function generateAccountCode() {
  let s = '';
  for (let i = 0; i < 6; i++) s += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return `ZB-${s}`;
}

/** Aceita "zb-abc234", "ZB ABC234" ou só "ABC234". Retorna o ID no formato oficial ou null. */
export function normalizeCode(input) {
  const raw = String(input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const body = raw.startsWith('ZB') ? raw.slice(2) : raw;
  const code = `ZB-${body}`;
  return CODE_RE.test(code) ? code : null;
}

/** blocked > active > expired > pending */
export function statusOf(user, now = new Date()) {
  if (user?.blocked) return 'blocked';
  if (!user?.subscription_until) return 'pending';
  return new Date(user.subscription_until).getTime() > now.getTime() ? 'active' : 'expired';
}

/** Renovar soma 30 dias ao que sobrou (não perde os dias restantes); vencida/nova conta soma a partir de agora. */
export function extendUntil(currentUntil, now = new Date(), days = PLAN_DAYS) {
  const cur = currentUntil ? new Date(currentUntil).getTime() : 0;
  const base = Math.max(now.getTime(), Number.isFinite(cur) ? cur : 0);
  return new Date(base + days * 86_400_000);
}

export const subscriptionRequired = (env) => env.SUBSCRIPTION_REQUIRED !== 'false';

/** Pode usar o painel e o bot? (SUBSCRIPTION_REQUIRED=false libera tudo, para testes locais.) */
export function hasAccess(user, now = new Date(), required = true) {
  return !required || statusOf(user, now) === 'active';
}

/** Link do WhatsApp do dono com a mensagem já escrita. Número inválido -> null (o botão fica desativado). */
export function whatsappLink(number, { code }) {
  let d = String(number ?? '').replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (d.length < 12 || d.length > 14) return null;
  const text = `Olá! Acabei de criar minha conta no ZapBot. Meu ID é ${code}. Quero ativar a assinatura de ${PRICE_LABEL} por mês.`;
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}

export const WARN_DAYS = 5;   // avisa o cliente (e destaca no admin) quando faltam 5 dias ou menos

/** Dias que faltam (arredonda para cima: "vence hoje à noite" = 1). null = nunca ativou; 0 = vencida. */
export function daysLeft(until, now = new Date()) {
  if (!until) return null;
  const ms = new Date(until).getTime() - now.getTime();
  if (!Number.isFinite(ms)) return null;
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
}

/** Números do painel admin. Receita = assinaturas ativas x preço (estimativa mensal, não é caixa). */
export function summarize(users, now = new Date()) {
  const out = { total: 0, active: 0, pending: 0, expired: 0, blocked: 0, expiringSoon: 0, monthlyCents: 0 };
  for (const u of users) {
    out.total++;
    const st = statusOf(u, now);
    out[st]++;
    if (st === 'active') {
      out.monthlyCents += PRICE_CENTS;
      if (daysLeft(u.subscription_until, now) <= WARN_DAYS) out.expiringSoon++;
    }
  }
  return out;
}
