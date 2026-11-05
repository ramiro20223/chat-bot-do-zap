// Pix "copia e cola" (BR Code estático do Banco Central) — puro, sem dependências.
const strip = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const tlv = (id, value) => `${id}${String(value.length).padStart(2, '0')}${value}`;

/** CRC16/CCITT-FALSE exigido pelo BR Code. */
export function crc16(str) {
  let crc = 0xffff;
  for (const byte of Buffer.from(str, 'utf8')) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export const PIX_KEY_TYPES = ['CPF/CNPJ', 'Celular', 'E-mail', 'Chave aleatória'];

/** Normaliza a chave conforme o tipo. Retorna null se o formato for inválido. */
export function normalizePixKey(type, raw) {
  const v = String(raw ?? '').trim();
  if (type === 'CPF/CNPJ') { const d = v.replace(/\D/g, ''); return d.length === 11 || d.length === 14 ? d : null; }
  if (type === 'Celular') {
    let d = v.replace(/\D/g, '');
    if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
    return d.length === 10 || d.length === 11 ? `+55${d}` : null;
  }
  if (type === 'E-mail') return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? v.toLowerCase() : null;
  if (type === 'Chave aleatória') return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v.toLowerCase() : null;
  return null;
}

/** Lê a configuração de Pix das respostas do questionário. Retorna null se incompleta/inválida. */
export function getPixConfig(answers = {}) {
  const key = normalizePixKey(answers.pix_key_type, answers.pix_key);
  const name = String(answers.pix_name || '').trim();
  if (!key || !name) return null;
  return { key, name, city: String(answers.pix_city || '').trim() || 'BRASIL' };
}

/** Gera o código "copia e cola" com valor fixo (em centavos). */
export function buildPixPayload({ key, name, city, amountCents, txid }) {
  if (!key) throw new Error('Chave Pix ausente');
  if (key.length > 77) throw new Error('Chave Pix longa demais');
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error('Valor inválido');
  const clean = (s, max, fallback) => strip(s).toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim().slice(0, max) || fallback;
  const id = String(txid ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';
  const body = tlv('00', '01') + tlv('01', '11')
    + tlv('26', tlv('00', 'br.gov.bcb.pix') + tlv('01', key))
    + tlv('52', '0000') + tlv('53', '986') + tlv('54', (amountCents / 100).toFixed(2)) + tlv('58', 'BR')
    + tlv('59', clean(name, 25, 'RECEBEDOR')) + tlv('60', clean(city, 15, 'BRASIL'))
    + tlv('62', tlv('05', id)) + '6304';
  return body + crc16(body);
}

/** Lê os campos de primeiro nível (usado nos testes e para validar o CRC). */
export function parsePix(payload) {
  const fields = []; let i = 0;
  while (i + 4 <= payload.length) {
    const id = payload.slice(i, i + 2); const len = Number(payload.slice(i + 2, i + 4));
    fields.push({ id, value: payload.slice(i + 4, i + 4 + len) });
    i += 4 + len;
  }
  const crcOk = payload.length > 4 && crc16(payload.slice(0, -4)) === payload.slice(-4);
  return { fields, crcOk, get: (id) => fields.find((f) => f.id === id)?.value };
}
