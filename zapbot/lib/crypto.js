// Criptografia em repouso (AES-256-GCM) para dados sensíveis no banco, como a sessão do WhatsApp.
// Quem copiar o banco SEM a chave (que fica só nas variáveis de ambiente do servidor) não consegue usar a sessão.
import crypto from 'node:crypto';

const PREFIX = 'enc:v1:';

export const isEncrypted = (s) => typeof s === 'string' && s.startsWith(PREFIX);

/** 64 caracteres hexadecimais -> chave de 32 bytes; qualquer outra coisa -> null. */
export function parseKey(hex) {
  const h = String(hex ?? '').trim();
  return /^[0-9a-fA-F]{64}$/.test(h) ? Buffer.from(h, 'hex') : null;
}

/** `aad` amarra o texto cifrado ao seu dono (ex.: "empresa:chave"): trocar linhas de lugar no banco faz a leitura falhar. */
export function encrypt(plain, key, aad = '') {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return PREFIX + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}

/** Valores antigos, sem prefixo, são devolvidos como estão (migração suave). Valor adulterado ou chave errada: lança erro. */
export function decrypt(blob, key, aad = '') {
  if (!isEncrypted(blob)) return blob;
  if (!key) throw new Error('Dado criptografado, mas DATA_ENCRYPTION_KEY não está configurada');
  const buf = Buffer.from(blob.slice(PREFIX.length), 'base64');
  if (buf.length < 29) throw new Error('Dado criptografado corrompido');
  const d = crypto.createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
}

let cached;
/** Chave do ambiente. Em produção ela é obrigatória (o servidor nem sobe sem ela). Em desenvolvimento pode faltar. */
export function dataKey() {
  if (cached !== undefined) return cached;
  const key = parseKey(process.env.DATA_ENCRYPTION_KEY);
  if (!key && process.env.NODE_ENV === 'production') throw new Error('DATA_ENCRYPTION_KEY ausente ou inválida');
  cached = key;
  return key;
}
export const resetDataKeyCache = () => { cached = undefined; };
