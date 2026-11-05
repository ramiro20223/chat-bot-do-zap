import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { encrypt, decrypt, parseKey, isEncrypted } from '../lib/crypto.js';
import { configProblems } from '../lib/config.js';

const KEY = crypto.randomBytes(32);

test('crypto: ida e volta, e o texto cifrado não revela o conteúdo', () => {
  const secret = '{"noiseKey":"abc","registrationId":123}';
  const c = encrypt(secret, KEY, 'emp1:creds');
  assert.ok(isEncrypted(c));
  assert.ok(!c.includes('noiseKey'));
  assert.equal(decrypt(c, KEY, 'emp1:creds'), secret);
  assert.notEqual(encrypt(secret, KEY, 'a'), encrypt(secret, KEY, 'a'), 'IV aleatório: nunca repete');
});

test('crypto: adulteração, chave errada e troca de linha são detectadas', () => {
  const c = encrypt('segredo', KEY, 'emp1:creds');
  const buf = Buffer.from(c.slice(7), 'base64'); buf[buf.length - 1] ^= 1;
  assert.throws(() => decrypt('enc:v1:' + buf.toString('base64'), KEY, 'emp1:creds'));
  assert.throws(() => decrypt(c, crypto.randomBytes(32), 'emp1:creds'));
  assert.throws(() => decrypt(c, KEY, 'emp2:creds'), /auth|Unsupported/i);   // aad diferente = linha movida
  assert.throws(() => decrypt(c, null), /DATA_ENCRYPTION_KEY/);
  assert.throws(() => decrypt('enc:v1:AAAA', KEY));
});

test('crypto: valor antigo em texto puro continua legível (migração)', () => {
  assert.equal(decrypt('{"a":1}', KEY, 'x'), '{"a":1}');
  assert.equal(decrypt('{"a":1}', null, 'x'), '{"a":1}');
});

test('crypto: parseKey só aceita 64 caracteres hexadecimais', () => {
  assert.equal(parseKey(crypto.randomBytes(32).toString('hex')).length, 32);
  for (const bad of ['', 'abc', 'z'.repeat(64), crypto.randomBytes(31).toString('hex'), undefined]) assert.equal(parseKey(bad), null);
});

test('config: produção exige segredos fortes e distintos', () => {
  const hex = crypto.randomBytes(32).toString('hex');
  const ok = { AUTH_SECRET: crypto.randomBytes(32).toString('hex'), DATA_ENCRYPTION_KEY: hex, DATABASE_URL: 'postgres://u:p@db.exemplo.com/x', DATABASE_SSL: 'true', GEMINI_API_KEY: 'k',
    PASSWORD_PEPPER: crypto.randomBytes(32).toString('hex'), ADMIN_EMAIL: 'dono@loja.com', ADMIN_PASSWORD_HASH: 'scrypt$32768$8$1$AAAA$BBBB', ADMIN_TOTP_SECRET: 'JBSWY3DPEHPK3PXP', ADMIN_WHATSAPP: '(11) 98888-7777' };
  assert.deepEqual(configProblems(ok, true), { errors: [], warnings: [] });
  assert.equal(configProblems({ ...ok, AUTH_SECRET: 'curta' }, true).errors.length, 1);
  assert.equal(configProblems({ ...ok, AUTH_SECRET: undefined }, true).errors.length, 1);
  assert.equal(configProblems({ ...ok, DATA_ENCRYPTION_KEY: 'nope' }, true).errors.length, 1);
  assert.equal(configProblems({ ...ok, AUTH_SECRET: hex }, true).errors.length, 1);
  assert.equal(configProblems({ ...ok, DATABASE_URL: undefined }, true).errors.length, 1);
  // assinatura: pimenta e conta de administrador são obrigatórias em produção
  assert.equal(configProblems({ ...ok, PASSWORD_PEPPER: undefined }, true).errors.length, 1);
  assert.equal(configProblems({ ...ok, PASSWORD_PEPPER: ok.AUTH_SECRET }, true).errors.length, 1);
  assert.equal(configProblems({ ...ok, ADMIN_PASSWORD_HASH: 'minhasenha123' }, true).errors.length, 1);   // senha em texto puro não passa
  assert.equal(configProblems({ ...ok, ADMIN_TOTP_SECRET: undefined }, true).errors.length, 1);
  assert.equal(configProblems({ ...ok, ADMIN_WHATSAPP: '123' }, true).errors.length, 1);
  assert.equal(configProblems({ ...ok, ADMIN_EMAIL: undefined, ADMIN_PASSWORD_HASH: undefined, ADMIN_TOTP_SECRET: undefined, ADMIN_WHATSAPP: undefined, SUBSCRIPTION_REQUIRED: 'false' }, true).errors.length, 0);
  assert.match(configProblems({ ...ok, DATABASE_SSL: 'false' }, true).warnings.join(), /DATABASE_SSL/);
  assert.match(configProblems({ ...ok, COOKIE_SECURE: 'false' }, true).warnings.join(), /COOKIE_SECURE/);
});

test('config: desenvolvimento só avisa, nunca bloqueia', () => {
  const r = configProblems({}, false);
  assert.equal(r.errors.length, 0);
  assert.ok(r.warnings.length >= 2);
});
