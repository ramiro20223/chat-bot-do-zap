// Código de 6 dígitos do app autenticador (TOTP, RFC 6238) — puro, sem dependências.
import crypto from 'node:crypto';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf) {
  let bits = 0; let value = 0; let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str) {
  const clean = String(str ?? '').toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0; let value = 0; const out = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error('Segredo base32 inválido');
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export const generateTotpSecret = () => base32Encode(crypto.randomBytes(20));

function hotp(key, counter, digits) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', key).update(buf).digest();
  const off = h[h.length - 1] & 0xf;
  const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

export const totpAt = (secretB32, timeMs, { step = 30, digits = 6 } = {}) =>
  hotp(base32Decode(secretB32), Math.floor(timeMs / 1000 / step), digits);

/**
 * Confere o código aceitando 1 janela de 30 s para cada lado (relógio levemente diferente).
 * Devolve o número da janela usada (para impedir reuso do mesmo código) ou null.
 */
export function verifyTotp(secretB32, code, { now = Date.now(), window = 1, step = 30, digits = 6 } = {}) {
  const c = String(code ?? '').replace(/\s/g, '');
  if (!/^\d+$/.test(c) || c.length !== digits) return null;
  const key = base32Decode(secretB32);
  const counter = Math.floor(now / 1000 / step);
  let hit = null;
  for (let w = -window; w <= window; w++) {      // percorre todas as janelas (sem sair no primeiro acerto)
    const expected = hotp(key, counter + w, digits);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(c)) && hit === null) hit = counter + w;
  }
  return hit;
}

export const otpauthUri = ({ secret, account, issuer }) =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
