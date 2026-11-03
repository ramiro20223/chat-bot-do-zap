import test from 'node:test';
import assert from 'node:assert/strict';
import { canSendTo } from '../lib/guard.js';

const NOW = new Date('2026-11-03T12:00:00Z');
const hoursAgo = (h) => NOW.getTime() - h * 3600_000;
const owner = '5511999990000@s.whatsapp.net';
const cliente = '5511988887777@s.whatsapp.net';
const base = { ownerJids: new Set([owner]), lastInbound: new Map([[cliente, hoursAgo(2)]]), now: NOW };

test('trava: dono e cliente recente podem receber', () => {
  assert.equal(canSendTo({ ...base, jid: owner }), true);
  assert.equal(canSendTo({ ...base, jid: cliente }), true);
});

test('trava: número desconhecido NUNCA recebe (o bot não puxa assunto)', () => {
  assert.equal(canSendTo({ ...base, jid: '5511977776666@s.whatsapp.net' }), false);
  assert.equal(canSendTo({ ...base, jid: '' }), false);
  assert.equal(canSendTo({ ...base, jid: undefined }), false);
});

test('trava: cliente que escreveu há mais de 24h deixa de poder receber', () => {
  const velho = { ...base, lastInbound: new Map([[cliente, hoursAgo(25)]]) };
  assert.equal(canSendTo({ ...velho, jid: cliente }), false);
  assert.equal(canSendTo({ ...velho, jid: owner }), true); // o dono continua permitido
});

test('trava: grupos, listas de transmissão e canais são sempre bloqueados, mesmo "recentes"', () => {
  for (const jid of ['120363000000000000@g.us', 'status@broadcast', '1203@newsletter']) {
    const b = { ownerJids: new Set([jid]), lastInbound: new Map([[jid, hoursAgo(1)]]), now: NOW };
    assert.equal(canSendTo({ ...b, jid }), false, jid);
  }
});

test('trava: sem dono configurado e sem conversas, ninguém recebe', () => {
  assert.equal(canSendTo({ jid: cliente, ownerJids: new Set(), lastInbound: new Map(), now: NOW }), false);
  assert.equal(canSendTo({ jid: cliente }), false);
});
