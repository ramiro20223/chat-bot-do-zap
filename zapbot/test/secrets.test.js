import test from 'node:test';
import assert from 'node:assert/strict';
import { findSecrets } from '../scripts/check-secrets.mjs';

const rules = (file, text) => findSecrets(file, text).map((h) => h.rule);

test('scanner: acha chaves de verdade', () => {
  assert.deepEqual(rules('a.js', `const k = "${'AIza' + 'B'.repeat(35)}"`), ['Chave de API do Google']);
  assert.deepEqual(rules('a.pem', `-----BEGIN ${'RSA '}PRIVATE KEY-----`), ['Chave privada']);
  assert.deepEqual(rules('a.txt', 'ghp_' + 'a'.repeat(36)), ['Token do GitHub']);
  assert.deepEqual(rules('.env', 'DATABASE_URL=postgres://admin:Sup3rS3gredo@db.exemplo.com:5432/x'), ['Senha em URL de banco']);
  assert.deepEqual(rules('.env', 'AUTH_SECRET=' + 'f'.repeat(40)), ['Segredo atribuído no código']);
  assert.equal(findSecrets('x.md', 'ok\nGEMINI_API_KEY=' + 'z'.repeat(20))[0].line, 2);
});

test('scanner: não acusa exemplos, variáveis vazias nem o próprio código', () => {
  assert.deepEqual(rules('.env.example', 'DATABASE_URL=postgres://usuario:senha@localhost:5432/zapbot'), []);
  assert.deepEqual(rules('.env.example', 'GEMINI_API_KEY=\nAUTH_SECRET=\nDATA_ENCRYPTION_KEY='), []);
  assert.deepEqual(rules('lib/x.js', 'const s = process.env.AUTH_SECRET;'), []);
  assert.deepEqual(rules('zapbot/package-lock.json', 'AIza' + 'B'.repeat(35)), []);
  assert.deepEqual(rules('zapbot/test/x.test.js', 'AIza' + 'B'.repeat(35)), []);
});
