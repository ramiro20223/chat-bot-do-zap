import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { generateAccountCode, normalizeCode, statusOf, extendUntil, hasAccess, whatsappLink, subscriptionRequired, PRICE_CENTS } from '../lib/subscription.js';
import { base32Encode, base32Decode, totpAt, verifyTotp, generateTotpSecret, otpauthUri } from '../lib/totp.js';
import { hashAdminPassword, verifyAdminPassword, checkAdminLogin, adminConfigured } from '../lib/admin-auth.js';
import { pepperInput, isPeppered, stripPepperPrefix } from '../lib/password.js';

const FAST = { N: 1024, r: 8, p: 1 };   // custo baixo só nos testes

test('assinatura: preço é R$ 99,99', () => assert.equal(PRICE_CENTS, 9999));

test('ID da conta: formato, alfabeto sem confusão e sem repetição fácil', () => {
  const seen = new Set();
  for (let i = 0; i < 300; i++) {
    const c = generateAccountCode();
    assert.match(c, /^ZB-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    assert.doesNotMatch(c.slice(3), /[01OIL]/);
    seen.add(c);
  }
  assert.ok(seen.size > 295);
});

test('ID da conta: normaliza o que o cliente digita', () => {
  assert.equal(normalizeCode('zb-abc234'), 'ZB-ABC234');
  assert.equal(normalizeCode(' ZB abc 234 '), 'ZB-ABC234');
  assert.equal(normalizeCode('abc234'), 'ZB-ABC234');
  for (const bad of ['', 'ZB-ABC', 'ZB-ABC2345', 'ZB-ABCOO1', "ZB-'; DROP", null, undefined]) assert.equal(normalizeCode(bad), null, String(bad));
});

test('status: pendente, ativa, vencida, bloqueada (bloqueio vence tudo)', () => {
  const now = new Date('2026-11-05T12:00:00Z');
  assert.equal(statusOf({}, now), 'pending');
  assert.equal(statusOf({ subscription_until: '2026-12-01T00:00:00Z' }, now), 'active');
  assert.equal(statusOf({ subscription_until: '2026-11-05T12:00:00Z' }, now), 'expired');   // vence no instante exato
  assert.equal(statusOf({ subscription_until: '2026-10-01T00:00:00Z' }, now), 'expired');
  assert.equal(statusOf({ subscription_until: '2027-01-01T00:00:00Z', blocked: true }, now), 'blocked');
});

test('renovação: soma 30 dias ao que sobrou; vencida soma a partir de agora', () => {
  const now = new Date('2026-11-05T12:00:00Z');
  assert.equal(extendUntil(null, now).toISOString(), '2026-12-05T12:00:00.000Z');
  assert.equal(extendUntil('2026-10-01T00:00:00Z', now).toISOString(), '2026-12-05T12:00:00.000Z');   // vencida: não "volta no tempo"
  assert.equal(extendUntil('2026-11-20T12:00:00Z', now).toISOString(), '2026-12-20T12:00:00.000Z');   // 15 dias sobrando + 30
  assert.equal(extendUntil(null, now, 60).toISOString(), '2027-01-04T12:00:00.000Z');
});

test('acesso: só assinatura ativa; SUBSCRIPTION_REQUIRED=false libera para teste local', () => {
  const now = new Date('2026-11-05T12:00:00Z');
  assert.equal(hasAccess({ subscription_until: '2026-12-01T00:00:00Z' }, now), true);
  assert.equal(hasAccess({}, now), false);
  assert.equal(hasAccess({ subscription_until: '2026-12-01T00:00:00Z', blocked: true }, now), false);
  assert.equal(hasAccess({}, now, false), true);
  assert.equal(subscriptionRequired({}), true);
  assert.equal(subscriptionRequired({ SUBSCRIPTION_REQUIRED: 'false' }), false);
});

test('WhatsApp: link com o ID na mensagem; número inválido desativa o botão', () => {
  const link = whatsappLink('(11) 98888-7777', { code: 'ZB-ABC234' });
  assert.match(link, /^https:\/\/wa\.me\/5511988887777\?text=/);
  assert.match(decodeURIComponent(link.split('text=')[1]), /ZB-ABC234/);
  assert.match(decodeURIComponent(link.split('text=')[1]), /R\$ 99,99/);
  assert.match(whatsappLink('+55 11 98888-7777', { code: 'ZB-ABC234' }), /wa\.me\/5511988887777/);
  for (const bad of ['', '123', undefined, 'abc']) assert.equal(whatsappLink(bad, { code: 'ZB-ABC234' }), null);
});

test('TOTP: vetores oficiais da RFC 6238 (SHA-1)', () => {
  const secret = base32Encode(Buffer.from('12345678901234567890'));
  assert.equal(secret, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  assert.equal(totpAt(secret, 59_000), '287082');
  assert.equal(totpAt(secret, 1111111109_000), '081804');
  assert.equal(totpAt(secret, 1234567890_000), '005924');
  assert.equal(totpAt(secret, 59_000, { digits: 8 }), '94287082');
});

test('TOTP: base32 ida e volta, janela de ±30 s e rejeição de lixo', () => {
  const s = generateTotpSecret();
  assert.deepEqual(base32Decode(s), base32Decode(s.toLowerCase().replace(/(.{4})/g, '$1 ')));
  assert.equal(base32Decode(base32Encode(Buffer.from([1, 2, 3, 250, 251]))).toString('hex'), '010203fafb');
  const t = 1_700_000_000_000;
  const code = totpAt(s, t);
  assert.notEqual(verifyTotp(s, code, { now: t }), null);
  assert.notEqual(verifyTotp(s, code, { now: t + 30_000 }), null);        // 1 janela depois ainda vale
  assert.equal(verifyTotp(s, code, { now: t + 95_000 }), null);           // 3 janelas depois, não
  for (const bad of ['', '12345', '1234567', 'abcdef', null, undefined]) assert.equal(verifyTotp(s, bad, { now: t }), null);
  assert.throws(() => base32Decode('1!!'), /base32/);
  assert.match(otpauthUri({ secret: s, account: 'eu@x.com', issuer: 'ZapBot' }), /^otpauth:\/\/totp\/ZapBot:eu%40x\.com\?secret=/);
});

test('admin: senha com scrypt (salt aleatório, verificação certa/errada, formato inválido)', async () => {
  const h = await hashAdminPassword('Cavalo-Azul-77!', FAST);
  assert.match(h, /^scrypt\$1024\$8\$1\$/);
  assert.ok(!h.includes('Cavalo'));
  assert.notEqual(h, await hashAdminPassword('Cavalo-Azul-77!', FAST));
  assert.equal(await verifyAdminPassword('Cavalo-Azul-77!', h), true);
  assert.equal(await verifyAdminPassword('cavalo-azul-77!', h), false);
  for (const bad of ['', 'x', 'bcrypt$1$2$3$4$5', undefined, 'scrypt$99999999$8$1$AA$AA']) assert.equal(await verifyAdminPassword('a', bad), false);
});

test('admin: login exige e-mail + senha + código; o mesmo código não vale duas vezes', async () => {
  const secret = generateTotpSecret();
  const env = { ADMIN_EMAIL: 'Dono@Loja.com', ADMIN_PASSWORD_HASH: await hashAdminPassword('Cavalo-Azul-77!', FAST), ADMIN_TOTP_SECRET: secret };
  const now = 1_700_000_000_000; const code = totpAt(secret, now);
  assert.equal(adminConfigured(env), true);
  assert.equal(adminConfigured({}), false);

  const ok = await checkAdminLogin({ email: 'dono@loja.com', password: 'Cavalo-Azul-77!', code }, env, { now });
  assert.equal(ok.ok, true);
  assert.equal((await checkAdminLogin({ email: 'dono@loja.com', password: 'errada', code }, env, { now })).ok, false);
  assert.equal((await checkAdminLogin({ email: 'outro@loja.com', password: 'Cavalo-Azul-77!', code }, env, { now })).ok, false);
  assert.equal((await checkAdminLogin({ email: 'dono@loja.com', password: 'Cavalo-Azul-77!', code: '000000' }, env, { now })).ok, false);
  assert.equal((await checkAdminLogin({ email: 'dono@loja.com', password: 'Cavalo-Azul-77!', code }, env, { now, lastStep: ok.step })).ok, false); // reuso
  assert.equal((await checkAdminLogin({ email: 'dono@loja.com', password: 'Cavalo-Azul-77!', code: totpAt(secret, now + 30_000) }, env, { now, lastStep: ok.step })).ok, true); // código seguinte
  assert.equal((await checkAdminLogin({ email: 'x', password: 'y', code }, {}, { now })).ok, false);   // admin não configurado
});

test('senha dos clientes: pimenta muda o resultado e cabe no bcrypt', () => {
  const a = pepperInput('minha senha', 'pimenta-1'.repeat(4));
  assert.equal(a, pepperInput('minha senha', 'pimenta-1'.repeat(4)));
  assert.notEqual(a, pepperInput('minha senha', 'pimenta-2'.repeat(4)));
  assert.notEqual(a, pepperInput('minha senhA', 'pimenta-1'.repeat(4)));
  assert.ok(Buffer.byteLength(a) <= 72);
  assert.equal(pepperInput('x'.repeat(500), 'k').length, 44);   // senha enorme: continua 44 caracteres
  assert.equal(isPeppered('p1$$2b$12$abc'), true);
  assert.equal(isPeppered('$2b$12$abc'), false);
  assert.equal(stripPepperPrefix('p1$$2b$12$abc'), '$2b$12$abc');
});

import { generateTempPassword } from '../lib/password.js';
import { passwordProblem } from '../lib/web-security.js';
test('senha provisória: forte, legível, passa na política e nunca repete', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const p = generateTempPassword();
    assert.match(p, /^[A-HJ-NP-Za-km-z2-9]{14}$/);
    assert.match(p, /[A-Z]/); assert.match(p, /[a-z]/); assert.match(p, /\d/);
    assert.equal(passwordProblem(p, 'cliente@x.com'), null);
    seen.add(p);
  }
  assert.equal(seen.size, 200);
});
