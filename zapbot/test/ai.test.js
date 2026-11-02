import test from 'node:test';
import assert from 'node:assert/strict';
import { generateReply } from '../lib/ai.js';

const business = { id: 'b1', name: 'Farmácia Teste', type: 'farmacia', answers: {} };
const reply = (parts) => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { role: 'model', parts } }] }) });

function withFetch(responses, fn) {
  const calls = []; const orig = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return responses.shift(); };
  process.env.GEMINI_API_KEY = 'chave-de-teste';
  return fn(calls).finally(() => { globalThis.fetch = orig; });
}

test('Gemini: busca no catálogo e responde com o resultado', () => withFetch([
  reply([{ functionCall: { name: 'buscar_produtos', args: { consulta: 'dor de cabeça' } } }]),
  reply([{ text: 'Temos a *Dipirona 500mg*, R$ 8,90.' }]),
], async (calls) => {
  const searched = [];
  const search = async (id, q) => { searched.push([id, q]); return [{ name: 'Dipirona 500mg', price: 8.9, in_stock: true, indications: 'Dor de cabeça' }]; };
  const history = [{ direction: 'out', body: 'Olá!' }, { direction: 'in', body: 'oi' }, { direction: 'out', body: 'Como posso ajudar?' }];
  const r = await generateReply({ business, history, text: 'preciso de algo para dor de cabeça', search });

  assert.equal(r.text, 'Temos a *Dipirona 500mg*, R$ 8,90.');
  assert.equal(r.handoff, false);
  assert.deepEqual(searched, [['b1', 'dor de cabeça']]);
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-2\.5-flash:generateContent/);
  assert.equal(calls[0].init.headers['x-goog-api-key'], 'chave-de-teste');
  assert.deepEqual(calls[0].body.contents.map((c) => c.role), ['user', 'model', 'user']); // começa em user, assistant vira model
  assert.match(calls[0].body.systemInstruction.parts[0].text, /Farmácia Teste/);
  const back = calls[1].body.contents.at(-1);
  assert.equal(back.role, 'user');
  assert.equal(back.parts[0].functionResponse.name, 'buscar_produtos');
  assert.equal(back.parts[0].functionResponse.response.itens[0].nome, 'Dipirona 500mg');
}));

test('Gemini: atendente humano pausa o bot', () => withFetch([
  reply([{ functionCall: { name: 'chamar_atendente_humano', args: { motivo: 'reclamação' } } }]),
  reply([{ text: 'Vou chamar uma pessoa para você.' }]),
], async () => {
  const r = await generateReply({ business, history: [], text: 'quero reclamar', search: async () => [] });
  assert.equal(r.handoff, true);
  assert.equal(r.handoffReason, 'reclamação');
}));

test('Gemini: erro da API vira mensagem segura + atendente humano', () => withFetch([
  { ok: false, status: 400, text: async () => 'bad request' },
], async () => {
  const r = await generateReply({ business, history: [], text: 'oi', search: async () => [] });
  assert.equal(r.handoff, true);
  assert.match(r.text, /Desculpe/);
}));

test('Gemini: sem chave configurada não chama a API', async () => {
  const saved = process.env.GEMINI_API_KEY; delete process.env.GEMINI_API_KEY;
  let called = false; const orig = globalThis.fetch; globalThis.fetch = async () => { called = true; };
  const r = await generateReply({ business, history: [], text: 'oi' });
  globalThis.fetch = orig; if (saved) process.env.GEMINI_API_KEY = saved;
  assert.equal(called, false);
  assert.equal(r.handoff, true);
});
