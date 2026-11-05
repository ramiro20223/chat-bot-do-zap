// Quem o bot pode contatar (puro): o número do dono, ou clientes que escreveram nas últimas 24h.

/** Telefone BR -> DDD + 8 dígitos (ignora +55 e o 9º dígito), para comparar números de formatos diferentes. */
export function normalizeBR(raw) {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  if (d.length === 11 && d[2] === '9') d = d.slice(0, 2) + d.slice(3);
  return d;
}

export function samePhone(a, b) {
  const x = normalizeBR(a); const y = normalizeBR(b);
  return x.length === 10 && x === y;
}

/** O cliente escreveu há menos de `hours` horas? Só então o bot pode responder/avisar. */
export function withinReplyWindow(lastInboundAt, now = new Date(), hours = 24) {
  if (!lastInboundAt) return false;
  const t = new Date(lastInboundAt).getTime();
  return Number.isFinite(t) && now.getTime() - t <= hours * 3600_000;
}

/**
 * TRAVA DE DESTINATÁRIOS (aplicada em todo envio): só pode receber mensagem
 *  (1) o dono, ou (2) um cliente que escreveu para o bot nas últimas 24h.
 * Grupos, listas de transmissão e qualquer número desconhecido são sempre bloqueados.
 */
export function canSendTo({ jid, ownerJids, lastInbound, now = new Date(), hours = 24 }) {
  if (!jid || /@(g\.us|broadcast|newsletter)$/.test(jid)) return false;
  if (ownerJids?.has(jid)) return true;
  return withinReplyWindow(lastInbound?.get(jid), now, hours);
}
