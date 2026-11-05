import test from 'node:test';
import assert from 'node:assert/strict';
import { generateReply, rankFlashModels, resetModelCache, normalizeModelName } from '../lib/ai.js';

const business = { id: 'b1', name: 'Farmácia Teste', type: 'farmacia', answers: {} };
const reply = (parts) => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { role: 'model', parts } }] }) });

function withFetch(responses, fn) {
  const calls = []; const orig = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return responses.shift(); };
  process.env.GEMINI_API_KEY = 'chave-de-teste'; process.env.GEMINI_MODEL = 'gemini-teste-flash'; resetModelCache();
  return fn(calls).finally(() => { globalThis.fetch = orig; delete process.env.GEMINI_MODEL; resetModelCache(); });
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
  assert.deepEqual(searched, [['b1', 'preciso de algo para dor de cabeça'], ['b1', 'dor de cabeça']]); // pré-busca + ferramenta
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-teste-flash:generateContent/);
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

const M = (name, methods = ['generateContent']) => ({ name: `models/${name}`, supportedGenerationMethods: methods });

test('rankFlashModels: escolhe o Flash estável mais novo (compara 2.5 < 3.8 < 10)', () => {
  const ids = rankFlashModels([
    M('gemini-2.5-flash'), M('gemini-3.8-flash'), M('gemini-3.8-flash-lite'), M('gemini-3.8-flash-image'),
    M('gemini-3.8-pro'), M('gemini-10-flash'), M('embedding-001', ['embedContent']), M('gemini-9-flash', ['embedContent']),
    M('gemini-flash-latest'),
  ]);
  assert.deepEqual(ids, ['gemini-10-flash', 'gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-flash-latest']);
});

test('Gemini: modelo aposentado (404) -> descobre outro e continua funcionando', async () => {
  process.env.GEMINI_API_KEY = 'k'; process.env.GEMINI_MODEL = 'gemini-2.5-flash'; resetModelCache();
  const urls = []; const orig = globalThis.fetch;
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    if (String(url).includes('/models?pageSize')) return { ok: true, status: 200, json: async () => ({ models: [M('gemini-2.5-flash'), M('gemini-3.8-flash')] }) };
    if (String(url).includes('gemini-2.5-flash:')) return { ok: false, status: 404, text: async () => 'no longer available' };
    return reply([{ text: 'Olá! Como posso ajudar?' }]);
  };
  try {
    const r = await generateReply({ business, history: [], text: 'oi', search: async () => [] });
    assert.equal(r.text, 'Olá! Como posso ajudar?');
    assert.equal(r.handoff, false);
    assert.ok(urls.some((u) => u.includes('gemini-3.8-flash:generateContent')));
    // próxima mensagem já usa o modelo novo direto, sem novo 404
    urls.length = 0;
    await generateReply({ business, history: [], text: 'oi', search: async () => [] });
    assert.equal(urls.length, 1);
    assert.match(urls[0], /gemini-3\.8-flash:generateContent/);
  } finally { globalThis.fetch = orig; delete process.env.GEMINI_MODEL; resetModelCache(); }
});

test('Gemini: modo auto (sem GEMINI_MODEL) descobre o modelo na primeira mensagem', async () => {
  process.env.GEMINI_API_KEY = 'k'; delete process.env.GEMINI_MODEL; resetModelCache();
  const urls = []; const orig = globalThis.fetch;
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    if (String(url).includes('/models?pageSize')) return { ok: true, status: 200, json: async () => ({ models: [M('gemini-2.5-flash'), M('gemini-3.8-flash')] }) };
    return reply([{ text: 'ok' }]);
  };
  try {
    const r = await generateReply({ business, history: [], text: 'oi', search: async () => [] });
    assert.equal(r.text, 'ok');
    assert.match(urls.at(-1), /gemini-3\.8-flash:generateContent/);
  } finally { globalThis.fetch = orig; resetModelCache(); }
});

test('Gemini: pré-busca entrega o catálogo no prompt e responde em UMA chamada', () => withFetch([
  reply([{ text: 'Temos Dipirona por R$ 8,90.' }]),
], async (calls) => {
  const search = async () => [{ name: 'Dipirona 500mg', price: 8.9, in_stock: true, indications: 'Dor de cabeça' }];
  const r = await generateReply({ business, history: [], text: 'dor de cabeça', search });
  assert.equal(r.text, 'Temos Dipirona por R$ 8,90.');
  assert.equal(calls.length, 1);
  assert.match(calls[0].body.systemInstruction.parts[0].text, /Dipirona 500mg/);
}));

test('Gemini: raciocínio rápido é pedido e, se o modelo recusar (400), recua e funciona', async () => {
  process.env.GEMINI_API_KEY = 'k'; process.env.GEMINI_MODEL = 'm'; resetModelCache();
  const sent = []; const orig = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const cfg = JSON.parse(init.body).generationConfig;
    sent.push(cfg.thinkingConfig || null);
    if (cfg.thinkingConfig && 'thinkingBudget' in cfg.thinkingConfig) {
      return { ok: false, status: 400, clone() { return this; }, text: async () => 'Budget 0 is invalid. This model only works in thinking mode.' };
    }
    return reply([{ text: 'ok' }]);
  };
  try {
    const r = await generateReply({ business, history: [], text: 'oi', search: async () => [] });
    assert.equal(r.text, 'ok');
    assert.deepEqual(sent, [{ thinkingBudget: 0 }, { thinkingLevel: 'minimal' }]);
    sent.length = 0;
    await generateReply({ business, history: [], text: 'oi', search: async () => [] });
    assert.deepEqual(sent, [{ thinkingLevel: 'minimal' }]); // lembrou o que funciona
  } finally { globalThis.fetch = orig; delete process.env.GEMINI_MODEL; resetModelCache(); }
});

test('normalizeModelName limpa aspas, crases, espaços, comentário e prefixo', () => {
  for (const raw of ['gemini-3.5-flash-lite', ' "gemini-3.5-flash-lite" ', '`gemini-3.5-flash-lite`', "'gemini-3.5-flash-lite'",
    'models/gemini-3.5-flash-lite', 'gemini-3.5-flash-lite  # rápido', 'gemini-3.5-flash-lite\r']) {
    assert.equal(normalizeModelName(raw), 'gemini-3.5-flash-lite', JSON.stringify(raw));
  }
  assert.equal(normalizeModelName(undefined), '');
});

test('Gemini: GEMINI_MODEL com aspas/crases chega limpo na URL', async () => {
  process.env.GEMINI_API_KEY = 'k'; process.env.GEMINI_MODEL = '`"gemini-3.5-flash-lite"`'; resetModelCache();
  const urls = []; const orig = globalThis.fetch;
  globalThis.fetch = async (url) => { urls.push(String(url)); return reply([{ text: 'ok' }]); };
  try {
    await generateReply({ business, history: [], text: 'oi', search: async () => [] });
    assert.match(urls[0], /\/models\/gemini-3\.5-flash-lite:generateContent$/);
  } finally { globalThis.fetch = orig; delete process.env.GEMINI_MODEL; resetModelCache(); }
});

test('Vendas: registrar_pedido -> gerar_pix; Pix e aviso do dono saem do código, não da IA', () => withFetch([
  reply([{ functionCall: { name: 'registrar_pedido', args: { itens: [{ produto_id: 'p1', quantidade: 2 }], entrega: 'retirada', desconto_percentual: 99 } } }]),
  reply([{ functionCall: { name: 'gerar_pix', args: { cliente_confirmou: true } } }]),
  reply([{ text: 'Pronto! Te mandei o Pix. Depois é só enviar o comprovante 😉' }]),
], async (calls) => {
  const seen = [];
  const sales = {
    async registrar_pedido(a) { seen.push(['registrar', a]); return { response: { ok: true, pedido_num: 7, total: 'R$ 91,61' } }; },
    async gerar_pix(a) { seen.push(['pix', a]); return { response: { ok: true }, send: ['Pix do pedido #7', '000201...6304ABCD'], notifyOwner: ['Novo pedido #7'] }; },
  };
  const biz = { ...business, answers: { sales_mode: true } };
  const r = await generateReply({ business: biz, history: [], text: 'sim, pode gerar', search: async () => [], sales });
  assert.equal(r.text, 'Pronto! Te mandei o Pix. Depois é só enviar o comprovante 😉');
  assert.deepEqual(r.extraMessages, ['Pix do pedido #7', '000201...6304ABCD']);
  assert.deepEqual(r.ownerNotices, ['Novo pedido #7']);
  assert.deepEqual(seen.map((s) => s[0]), ['registrar', 'pix']);
  const names = calls[0].body.tools[0].functionDeclarations.map((d) => d.name);
  assert.deepEqual(names, ['buscar_produtos', 'chamar_atendente_humano', 'registrar_pedido', 'gerar_pix', 'cancelar_pedido']);
  assert.match(calls[0].body.systemInstruction.parts[0].text, /MODO VENDAS/);
  assert.match(calls[0].body.systemInstruction.parts[0].text, /Pix da empresa ainda não está configurado/); // sem chave Pix nas respostas
}));

test('Vendas: sem modo vendas a IA nem recebe as ferramentas de pedido', () => withFetch([reply([{ text: 'ok' }])], async (calls) => {
  await generateReply({ business, history: [], text: 'oi', search: async () => [] });
  assert.deepEqual(calls[0].body.tools[0].functionDeclarations.map((d) => d.name), ['buscar_produtos', 'chamar_atendente_humano']);
  assert.doesNotMatch(calls[0].body.systemInstruction.parts[0].text, /MODO VENDAS/);
}));

test('Vendas: falha numa ferramenta não derruba o atendimento', () => withFetch([
  reply([{ functionCall: { name: 'gerar_pix', args: { cliente_confirmou: true } } }]),
  reply([{ text: 'Desculpe, vou chamar um atendente.' }]),
], async () => {
  const sales = { async gerar_pix() { throw new Error('banco fora do ar'); } };
  const r = await generateReply({ business, history: [], text: 'sim', search: async () => [], sales });
  assert.match(r.text, /atendente/);
}));

test('Mídia: imagem e áudio do cliente vão como inlineData na última mensagem', () => withFetch([reply([{ text: 'Vi a foto!' }])], async (calls) => {
  const media = [{ kind: 'image', mimeType: 'image/jpeg', data: 'AAAA' }, { kind: 'audio', mimeType: 'audio/ogg', data: 'BBBB' }];
  await generateReply({ business, history: [{ direction: 'out', body: 'Olá' }], text: '', media, search: async () => [] });
  const last = calls[0].body.contents.at(-1);
  assert.equal(last.role, 'user');
  assert.deepEqual(last.parts.slice(1).map((p) => p.inlineData.mimeType), ['image/jpeg', 'audio/ogg']);
  assert.equal(calls[0].body.contents.length, 1); // 'Olá' do bot no começo é descartado (histórico começa em user)
}));
