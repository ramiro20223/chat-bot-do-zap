import test from 'node:test';
import assert from 'node:assert/strict';
import { csrfOk, clientIp, passwordProblem, registrationPolicy, isUuid, sessionCookieName, cookieSecure } from '../lib/web-security.js';
import { createLimiter } from '../lib/limits.js';

test('csrf: GET sempre passa; POST só do próprio site', () => {
  const base = { host: 'app.exemplo.com' };
  assert.equal(csrfOk({ ...base, method: 'GET', origin: 'https://mal.com' }), true);
  assert.equal(csrfOk({ ...base, method: 'POST', origin: 'https://app.exemplo.com' }), true);
  assert.equal(csrfOk({ ...base, method: 'POST', origin: 'https://mal.com' }), false);
  assert.equal(csrfOk({ ...base, method: 'DELETE', origin: 'null' }), false);
  assert.equal(csrfOk({ ...base, method: 'PUT', origin: 'lixo' }), false);
  assert.equal(csrfOk({ host: 'localhost:3000', method: 'POST', origin: 'http://localhost:3000' }), true);
  assert.equal(csrfOk({ host: 'interno:3000', forwardedHost: 'app.exemplo.com', method: 'POST', origin: 'https://app.exemplo.com' }), true);
});

test('csrf: sem Origin usa Sec-Fetch-Site; sem nenhum (ferramentas fora do navegador) passa', () => {
  const base = { host: 'a.com', method: 'POST' };
  assert.equal(csrfOk({ ...base, secFetchSite: 'cross-site' }), false);
  assert.equal(csrfOk({ ...base, secFetchSite: 'same-site' }), false);
  assert.equal(csrfOk({ ...base, secFetchSite: 'same-origin' }), true);
  assert.equal(csrfOk({ ...base }), true);
});

test('clientIp: não confia no primeiro item de X-Forwarded-For (forjável)', () => {
  assert.equal(clientIp('1.1.1.1, 9.9.9.9'), '9.9.9.9');           // atacante forjou 1.1.1.1; o proxy acrescentou o real
  assert.equal(clientIp('9.9.9.9'), '9.9.9.9');
  assert.equal(clientIp('6.6.6.6, 1.1.1.1, 9.9.9.9', 2), '1.1.1.1');
  assert.equal(clientIp('', 1), 'local');
  assert.equal(clientIp(null), 'local');
});

test('senha: política', () => {
  assert.match(passwordProblem('curta1'), /10 caracteres/);
  assert.match(passwordProblem('1234567890'), /comum/);
  assert.match(passwordProblem('aaaaaaaaaaaa'), /comum/);
  assert.match(passwordProblem('9876543210123'), /letras/);
  assert.match(passwordProblem('joaosilva2024x', 'joaosilva@gmail.com'), /e-mail/);
  assert.match(passwordProblem('x'.repeat(80)), /72/);
  assert.match(passwordProblem(undefined), /10/);
  assert.equal(passwordProblem('Cavalo-Azul-77!', 'joao@gmail.com'), null);
});

test('cadastro: convite, aberto ou fechado', () => {
  assert.deepEqual(registrationPolicy({ NODE_ENV: 'production' }), { open: false, code: null });
  assert.deepEqual(registrationPolicy({ NODE_ENV: 'production', ALLOW_REGISTRATION: 'true' }), { open: true, code: null });
  assert.deepEqual(registrationPolicy({ NODE_ENV: 'production', REGISTRATION_CODE: ' convite-secreto ' }), { open: true, code: 'convite-secreto' });
  assert.equal(registrationPolicy({ NODE_ENV: 'production', REGISTRATION_CODE: 'curto' }).open, false); // código fraco é ignorado
  assert.equal(registrationPolicy({ NODE_ENV: 'development' }).open, true);
});

test('cookie: prefixo __Host- só em produção com HTTPS', () => {
  assert.equal(sessionCookieName({ NODE_ENV: 'production' }), '__Host-zap_session');
  assert.equal(sessionCookieName({ NODE_ENV: 'production', COOKIE_SECURE: 'false' }), 'zap_session');
  assert.equal(sessionCookieName({ NODE_ENV: 'development' }), 'zap_session');
  assert.equal(cookieSecure({ NODE_ENV: 'production' }), true);
});

test('uuid', () => {
  assert.equal(isUuid('3f6afbba-b07a-476d-a0f3-4aa1f9c9ee4e'), true);
  for (const x of ['', 'abc', "1' or '1'='1", undefined, '3f6afbba-b07a-476d-a0f3-4aa1f9c9ee4e0']) assert.equal(isUuid(x), false);
});

test('limitador: bloqueia depois do máximo e libera passada a janela', () => {
  const l = createLimiter({ max: 3, windowMs: 1000 });
  assert.equal(l.blocked('k', 0), false);
  l.record('k', 0); l.record('k', 100); l.record('k', 200);
  assert.equal(l.blocked('k', 300), true);
  assert.equal(l.blocked('outro', 300), false);
  assert.equal(l.blocked('k', 1100), false);           // as duas primeiras já saíram da janela
  l.clear('k'); assert.equal(l.blocked('k', 300), false);
});

test('limitador: allow() para flood de mensagens e limpeza de chaves antigas', () => {
  const l = createLimiter({ max: 2, windowMs: 1000, maxKeys: 3 });
  assert.equal(l.allow('c', 0), true); assert.equal(l.allow('c', 1), true); assert.equal(l.allow('c', 2), false);
  for (let i = 0; i < 10; i++) l.allow(`x${i}`, 5000 + i);   // muitas chaves: as antigas são podadas
  assert.ok(l.size <= 10);
});

import { sanitizeHours, DEFAULT_HOURS } from '../lib/hours.js';

test('horários: aceita o padrão e rejeita lixo, horas inválidas e dias faltando', () => {
  assert.deepEqual(sanitizeHours(DEFAULT_HOURS).mon, { closed: false, open: '09:00', close: '18:00' });
  assert.equal(sanitizeHours({ ...DEFAULT_HOURS, mon: { closed: false, open: '25:00', close: '18:00' } }), null);
  assert.equal(sanitizeHours({ ...DEFAULT_HOURS, mon: { closed: false, open: '', close: '18:00' } }), null);
  assert.equal(sanitizeHours({ ...DEFAULT_HOURS, tue: undefined }), null);
  assert.equal(sanitizeHours('x'), null);
  assert.equal(sanitizeHours(null), null);
  assert.equal(sanitizeHours([]), null);
  const { mon, ...semSegunda } = DEFAULT_HOURS; assert.equal(sanitizeHours(semSegunda), null);
  const extra = sanitizeHours({ ...DEFAULT_HOURS, evil: { x: 1 }, mon: { closed: false, open: '08:00', close: '12:00', script: '<b>' } });
  assert.deepEqual(Object.keys(extra).sort(), ['fri', 'mon', 'sat', 'sun', 'thu', 'tue', 'wed']);   // chaves extras são descartadas
  assert.deepEqual(extra.mon, { closed: false, open: '08:00', close: '12:00' });
  assert.equal(sanitizeHours({ ...DEFAULT_HOURS, sun: { closed: true } }).sun.closed, true);
});
