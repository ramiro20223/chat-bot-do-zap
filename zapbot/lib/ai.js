// IA do atendente: Google Gemini (tem plano gratuito no Google AI Studio), chamado direto pela API REST.
import { buildSystemPrompt } from './prompt.js';
import { toChatMessages, brl } from './text.js';

const API = 'https://generativelanguage.googleapis.com/v1beta';
const ENDPOINT = (m) => `${API}/models/${encodeURIComponent(m)}:generateContent`;

// Modelo em uso. Vazio/"auto" = o bot descobre sozinho o Flash mais novo que a sua chave pode usar
// (os modelos do Google são aposentados com frequência; isso evita o erro 404 "modelo indisponível").
let activeModel = null;
export const resetModelCache = () => { activeModel = null; }; // usado nos testes
const configuredModel = () => {
  const m = (process.env.GEMINI_MODEL || '').trim();
  return m && m.toLowerCase() !== 'auto' ? m : null;
};

const verParts = (v) => v.split('.').map(Number);
const cmpVersion = (a, b) => {
  const x = verParts(a); const y = verParts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  return 0;
};

/** Da lista de modelos do Google, devolve os "Flash" estáveis (gemini-N-flash) do mais novo ao mais antigo. */
export function rankFlashModels(models) {
  const ok = [];
  for (const m of models || []) {
    const id = String(m.name || '').replace(/^models\//, '');
    if (!m.supportedGenerationMethods?.includes('generateContent')) continue;
    const mt = /^gemini-(\d+(?:\.\d+)*)-flash$/.exec(id);
    if (mt) ok.push({ id, v: mt[1] });
  }
  ok.sort((a, b) => cmpVersion(b.v, a.v));
  const ids = ok.map((x) => x.id);
  if ((models || []).some((m) => m.name === 'models/gemini-flash-latest')) ids.push('gemini-flash-latest'); // alias, último recurso
  return ids;
}

async function listFlashModels() {
  const res = await fetch(`${API}/models?pageSize=200`, { headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY } });
  if (!res.ok) throw new Error(`Gemini ListModels HTTP ${res.status}`);
  return rankFlashModels((await res.json()).models);
}
const FALLBACK = 'Desculpe, tive um problema para responder agora. Vou pedir para um atendente falar com você em breve.';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TOOLS = [{
  functionDeclarations: [
    {
      name: 'buscar_produtos',
      description: 'Busca no catálogo da empresa produtos, itens do cardápio ou serviços. Use sempre que o cliente perguntar '
        + 'o que a empresa tem, para que serve algo, características ou preço. Passe palavras-chave e sinônimos.',
      parameters: {
        type: 'OBJECT',
        properties: { consulta: { type: 'STRING', description: 'Palavras-chave. Ex.: "dor de cabeça enxaqueca analgésico"' } },
        required: ['consulta'],
      },
    },
    {
      name: 'chamar_atendente_humano',
      description: 'Transfere a conversa para uma pessoa da empresa; o bot pausa nesta conversa.',
      parameters: {
        type: 'OBJECT',
        properties: { motivo: { type: 'STRING', description: 'Resumo curto do que o cliente precisa' } },
        required: ['motivo'],
      },
    },
  ],
}];

const formatProduct = (p) => ({
  nome: p.name, categoria: p.category, descricao: p.description, indicacoes: p.indications,
  caracteristicas: p.characteristics, preco: brl(p.price) ?? 'não informado', em_estoque: p.in_stock,
});

const post = (model, body) => fetch(ENDPOINT(model), {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
  body: JSON.stringify(body),
});

/** Modelo indisponível (404): procura outro Flash liberado para a chave e guarda o que funcionar. */
async function findWorkingModel(body, failed) {
  const candidates = (await listFlashModels()).filter((m) => m !== failed);
  for (const model of candidates) {
    const res = await post(model, body);
    if (res.ok) { activeModel = model; console.log(`[ai] modelo ${failed} indisponível; usando ${model}`); return res.json(); }
    if (res.status !== 404) break; // outro tipo de erro (chave, cota...): não adianta trocar de modelo
  }
  throw new Error(`Nenhum modelo Gemini disponível para esta chave (tentado: ${failed}). Veja os modelos em aistudio.google.com e defina GEMINI_MODEL.`);
}

async function callGemini(body) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const model = activeModel || configuredModel() || (activeModel = (await listFlashModels())[0]);
    if (!model) throw new Error('Nenhum modelo Gemini encontrado para esta chave');
    const res = await post(model, body);
    if (res.ok) return res.json();
    if (res.status === 404) return findWorkingModel(body, model);
    // 429 = limite do plano gratuito; 5xx = instabilidade. Tenta de novo com pausa.
    if ((res.status === 429 || res.status >= 500) && attempt < 2) { await sleep(1500 * (attempt + 1)); continue; }
    throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  throw new Error('Gemini indisponível');
}

/**
 * Gera a resposta do atendente.
 * @param {{business: object, history: Array, text: string, now?: Date, search?: Function}} p
 * @returns {Promise<{ text: string, handoff: boolean, handoffReason?: string }>}
 */
export async function generateReply({ business, history, text, now = new Date(), search }) {
  if (!process.env.GEMINI_API_KEY) {
    console.error('[ai] GEMINI_API_KEY não configurada');
    return { text: FALLBACK, handoff: true, handoffReason: 'IA não configurada' };
  }
  const searchProducts = search || (await import('./catalog.js')).searchProducts; // import tardio: não exige banco nos testes

  const contents = toChatMessages(history, text).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  const system = { parts: [{ text: buildSystemPrompt(business, now) }] };
  let handoff = false; let handoffReason;

  try {
    for (let step = 0; step < 5; step++) {
      const data = await callGemini({
        systemInstruction: system, contents, tools: TOOLS,
        generationConfig: { maxOutputTokens: 800, temperature: 0.4 },
      });
      const content = data.candidates?.[0]?.content;
      const parts = content?.parts || [];
      const calls = parts.filter((p) => p.functionCall);

      if (!calls.length) {
        const out = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('').trim();
        return { text: out || FALLBACK, handoff, handoffReason };
      }

      contents.push(content); // devolve a resposta do modelo inteira (preserva assinaturas de raciocínio)
      const responses = [];
      for (const { functionCall: c } of calls) {
        let result;
        if (c.name === 'buscar_produtos') {
          const found = await searchProducts(business.id, String(c.args?.consulta || ''));
          result = found.length
            ? { itens: found.map(formatProduct) }
            : { itens: [], aviso: 'Nenhum item do catálogo corresponde. Não invente itens; tente outros termos ou diga que não encontrou.' };
        } else if (c.name === 'chamar_atendente_humano') {
          handoff = true; handoffReason = String(c.args?.motivo || '');
          result = { ok: true, aviso: 'Atendente humano acionado. Avise o cliente que uma pessoa vai continuar o atendimento.' };
        } else {
          result = { erro: 'Ferramenta desconhecida.' };
        }
        responses.push({ functionResponse: { name: c.name, response: result } });
      }
      contents.push({ role: 'user', parts: responses });
    }
  } catch (e) {
    console.error('[ai] erro:', e?.message || e);
    return { text: FALLBACK, handoff: true, handoffReason: 'erro na IA' };
  }
  return { text: FALLBACK, handoff: true, handoffReason: 'loop de ferramentas' };
}
