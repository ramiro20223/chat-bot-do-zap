// Senhas dos clientes: bcrypt + "pimenta" (segredo do servidor). Puro, sem dependências.
// Se alguém copiar o banco SEM as variáveis de ambiente, não consegue nem tentar adivinhar as senhas offline.
import crypto from 'node:crypto';

export const PEPPERED = 'p1$';

/** HMAC-SHA256 da senha com a pimenta, em base64 (44 caracteres: cabe nos 72 bytes do bcrypt, sem truncar senhas longas). */
export const pepperInput = (password, pepper) =>
  crypto.createHmac('sha256', pepper).update(String(password), 'utf8').digest('base64');

export const isPeppered = (stored) => String(stored ?? '').startsWith(PEPPERED);
export const stripPepperPrefix = (stored) => String(stored).slice(PEPPERED.length);
