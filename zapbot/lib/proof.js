// Conferência do comprovante de Pix (puro). IMPORTANTE: "ok" aqui significa "consistente com o pedido",
// NÃO "dinheiro recebido". Quem confirma o pagamento é o dono, olhando o app do banco.
import { toCents, fmtCents } from './order-logic.js';
import { normalize } from './text.js';

export const PROMPT_EXTRACT = `Você analisa imagens de comprovantes de transferência Pix de bancos brasileiros.
Responda SOMENTE com um JSON, sem texto extra, com estes campos:
{"is_receipt": boolean (a imagem é um comprovante de pagamento/transferência?),
 "amount": number|null (valor em reais, ex.: 12.5),
 "date": "YYYY-MM-DD HH:MM"|null,
 "recipient_name": string|null (quem RECEBEU),
 "recipient_key": string|null,
 "payer_name": string|null,
 "e2e_id": string|null (ID da transação / código que começa com E, 32 caracteres),
 "status": "efetivado"|"agendado"|"pendente"|"desconhecido",
 "looks_edited": boolean (sinais de edição ou montagem: fontes diferentes, texto sobreposto, alinhamento estranho)}
Se não for um comprovante, use is_receipt=false e os demais campos null. Nunca invente valores que não aparecem.`;

const words = (s) => normalize(s).split(' ').filter((w) => w.length >= 3);
export const namesOverlap = (a, b) => { const wb = new Set(words(b)); return words(a).some((w) => wb.has(w)); };

const parseBrDate = (s) => {
  const m = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?/.exec(String(s ?? ''));
  if (!m) return null;
  const d = new Date(`${m[1]}T${m[2] || '12:00'}:00-03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * @param {{extracted: object, order: {total_cents: number, created_at?: Date|string}, business: {answers?: object}, duplicate?: boolean}} p
 * @returns {{verdict: 'ok'|'revisar'|'nao_comprovante'|'ilegivel', problems: string[], warnings: string[], amountCents?: number}}
 */
export function evaluateProof({ extracted, order, business, duplicate = false }) {
  const x = extracted || {};
  const problems = []; const warnings = [];
  if (!x.is_receipt) return { verdict: 'nao_comprovante', problems: ['nao_comprovante'], warnings };
  const amountCents = toCents(x.amount);
  if (amountCents === null || amountCents <= 0) return { verdict: 'ilegivel', problems: ['valor_ilegivel'], warnings };

  if (amountCents !== order.total_cents) problems.push('valor_diferente');
  if (/agend|pend/i.test(String(x.status || ''))) problems.push('nao_efetivado');
  if (duplicate) problems.push('duplicado');

  const expected = business?.answers?.pix_name;
  if (!x.recipient_name) warnings.push('favorecido_nao_lido');
  else if (expected && !namesOverlap(expected, x.recipient_name)) warnings.push('favorecido_diferente');
  if (x.looks_edited) warnings.push('possivel_edicao');
  const paidAt = parseBrDate(x.date); const created = order.created_at ? new Date(order.created_at) : null;
  if (paidAt && created && paidAt.getTime() < created.getTime() - 24 * 3600_000) warnings.push('data_anterior_ao_pedido');

  return { verdict: problems.length ? 'revisar' : 'ok', problems, warnings, amountCents };
}

const LABELS = {
  valor_diferente: 'valor diferente do pedido', nao_efetivado: 'pagamento agendado/pendente (não efetivado)',
  duplicado: 'comprovante já usado em outro pedido', favorecido_nao_lido: 'favorecido não identificado',
  favorecido_diferente: 'favorecido diferente do cadastrado', possivel_edicao: 'sinais de imagem editada',
  data_anterior_ao_pedido: 'data anterior ao pedido',
};
export const describeFindings = (ev, order) => {
  const lines = [];
  lines.push(ev.problems.length ? '' : `✅ Valor confere (${fmtCents(order.total_cents)})`);
  for (const p of ev.problems) lines.push(`❌ ${LABELS[p] || p}`);
  for (const w of ev.warnings) lines.push(`⚠️ ${LABELS[w] || w}`);
  return lines.filter(Boolean).join('\n');
};
