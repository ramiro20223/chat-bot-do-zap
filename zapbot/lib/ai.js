// IA do atendente: Google Gemini (tem plano gratuito no Google AI Studio), chamado direto pela API REST.
import { buildSystemPrompt } from './prompt.js';
import { toChatMessages, brl } from './text.js';

const API = 'https://generativelanguage.googleapis.com/v1beta';
const ENDPOINT = (m) => `${API}/models/${encodeURIComponent(m)}:generateContent`;

// Modelo em uso. Vazio/"auto" = o bot descobre sozinho o Flash mais novo que a sua chave pode usar
// (os modelos do Google são aposentados com frequência; isso evita o erro 404 "modelo indisponível").
let activeModel = null;
export const resetModelCache = () => { activeModel = null; thinkingIdx = process.env.GEMINI_THINKING === 'default' ? THINKING_LADDER.length - 1 : 0; }; // usado nos testes
/** Limpa o valor do .env: tira aspas, crases, espaços, comentário (#) e o prefixo "models/". */
export function normalizeModelName(raw) {
  return String(raw || '').split('#')[0].replace(/["'`\s]/g, '').replace(/^models\//i, '');
}

const configuredModel = () => {
  const m = normalizeModelName(process.env.GEMINI_MODEL);
  if (!m || m.toLowerCase() === 'auto') return null;
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(m)) {
    console.error(`[ai] GEMINI_MODEL inválido (${JSON.stringify(process.env.GEMINI_MODEL)}); usando modo automático. Use só o nome, ex.: gemini-3.5-flash-lite`);
    return null;
  }
  return m;
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
  const res = await fetch(`${API}/models?pageSize=200`, {
    headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY }, signal: AbortSignal.timeout(15000),
  });
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

const SALES_DECLARATIONS = [
  {
    name: 'registrar_pedido',
    description: 'Registra ou atualiza o pedido do cliente e devolve o resumo com os valores calculados pelo sistema. Chame sempre que o pedido mudar.',
    parameters: {
      type: 'OBJECT',
      properties: {
        itens: { type: 'ARRAY', description: 'Itens do pedido', items: { type: 'OBJECT', properties: {
          produto_id: { type: 'STRING', description: 'produto_id retornado por buscar_produtos' },
          quantidade: { type: 'INTEGER' },
          observacao: { type: 'STRING', description: 'Variação/detalhe do item (tamanho, cor, sem cebola...)' },
        }, required: ['produto_id', 'quantidade'] } },
        entrega: { type: 'STRING', description: '"retirada" ou "entrega"' },
        endereco: { type: 'STRING', description: 'Endereço completo, se for entrega' },
        nome_cliente: { type: 'STRING' },
        detalhes: { type: 'STRING', description: 'Outras informações importantes do pedido (horário, recado, etc.)' },
        desconto_percentual: { type: 'NUMBER', description: 'Desconto combinado na negociação, em %. Use 0 se não houve.' },
      },
      required: ['itens'],
    },
  },
  {
    name: 'gerar_pix',
    description: 'Gera e envia o Pix do pedido. Só chame depois que o cliente confirmar o resumo com um "sim" claro.',
    parameters: { type: 'OBJECT', properties: { cliente_confirmou: { type: 'BOOLEAN', description: 'true somente se o cliente confirmou o resumo' } }, required: ['cliente_confirmou'] },
  },
  { name: 'cancelar_pedido', description: 'Cancela o pedido em andamento quando o cliente desistir.' },
];

const formatProduct = (p) => ({
  produto_id: p.id, nome: p.name, categoria: p.category, descricao: p.description, indicacoes: p.indications,
  caracteristicas: p.characteristics, preco: brl(p.price) ?? 'não informado', em_estoque: p.in_stock,
});

const TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS || 40000); // nunca deixa o cliente esperando para sempre

// Modelos Gemini novos "pensam" antes de responder, o que custa segundos. Tentamos o modo mais rápido que
// o modelo aceitar (do mais agressivo ao padrão) e lembramos qual funcionou. GEMINI_THINKING=default desliga isso.
const THINKING_LADDER = [{ thinkingBudget: 0 }, { thinkingLevel: 'minimal' }, { thinkingLevel: 'low' }, null];
let thinkingIdx = process.env.GEMINI_THINKING === 'default' ? THINKING_LADDER.length - 1 : 0;

const withThinking = (body) => {
  const t = THINKING_LADDER[thinkingIdx];
  return t ? { ...body, generationConfig: { ...body.generationConfig, thinkingConfig: t } } : body;
};

const post = async (model, body) => {
  const t0 = Date.now();
  try {
    for (;;) {
      const res = await fetch(ENDPOINT(model), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify(withThinking(body)),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      // 400 citando "thinking": este modelo não aceita esse modo. Recua um degrau e repete.
      if (res.status === 400 && thinkingIdx < THINKING_LADDER.length - 1 && /think/i.test(await res.clone().text())) {
        thinkingIdx++;
        console.log(`[ai] ${model} não aceita esse modo de raciocínio; tentando outro`);
        continue;
      }
      console.log(`[ai] ${model} -> HTTP ${res.status} em ${Date.now() - t0}ms`);
      return res;
    }
  } catch (e) {
    console.error(`[ai] ${model} falhou após ${Date.now() - t0}ms: ${e.name === 'TimeoutError' ? `sem resposta em ${TIMEOUT_MS / 1000}s (rede/firewall ou Google lento)` : e.message}`);
    throw e;
  }
};

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

export async function callGemini(body) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const model = activeModel || configuredModel() || (activeModel = (await listFlashModels())[0]);
    if (!model) throw new Error('Nenhum modelo Gemini encontrado para esta chave');
    if (!callGemini.logged) { callGemini.logged = true; console.log(`[ai] modelo em uso: "${model}"`); }
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
 * @param {{business: object, history: Array, text: string, now?: Date, search?: Function,
 *          media?: Array<{kind: string, mimeType: string, data: string}>, sales?: object|null}} p
 * `media`: imagens/áudios do cliente (base64), entendidos pelo próprio Gemini.
 * `sales`: ferramentas de venda (registrar_pedido, gerar_pix, cancelar_pedido), quando o modo vendas está ligado.
 * @returns {Promise<{ text: string, handoff: boolean, handoffReason?: string, extraMessages: string[], ownerNotices: string[] }>}
 */
export async function generateReply({ business, history, text, now = new Date(), search, media = [], sales = null }) {
  const extraMessages = []; const ownerNotices = [];
  let handoff = false; let handoffReason;
  const out = (t, h = handoff, why = handoffReason) => ({
    text: t || (extraMessages.length ? 'Segue o Pix do seu pedido 👇' : FALLBACK), handoff: h, handoffReason: why, extraMessages, ownerNotices,
  });

  if (!process.env.GEMINI_API_KEY) {
    console.error('[ai] GEMINI_API_KEY não configurada');
    return out(FALLBACK, true, 'IA não configurada');
  }
  const searchProducts = search || (await import('./catalog.js')).searchProducts; // import tardio: não exige banco nos testes

  const contents = toChatMessages(history, text || '(mídia)').map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  for (const m of media) contents.at(-1).parts.push({ inlineData: { mimeType: m.mimeType, data: m.data } }); // última mensagem é sempre do cliente

  // Pré-busca: já consulta o catálogo com a mensagem do cliente e entrega o resultado junto com o prompt.
  // Assim perguntas sobre produtos são respondidas numa única chamada à IA (a ferramenta continua disponível).
  let systemText = buildSystemPrompt(business, now);
  try {
    const pre = text ? await searchProducts(business.id, text) : [];
    if (pre.length) {
      systemText += '\n\nITENS DO CATÁLOGO POSSIVELMENTE RELACIONADOS À ÚLTIMA MENSAGEM DO CLIENTE (já buscados; use se fizerem sentido, '
        + 'sem inventar nada além disto; para outros termos use buscar_produtos):\n' + JSON.stringify(pre.map(formatProduct));
    }
  } catch (e) { console.error('[ai] pré-busca falhou (segue sem ela):', e.message); }
  const system = { parts: [{ text: systemText }] };
  const tools = [{ functionDeclarations: [...TOOLS[0].functionDeclarations, ...(sales ? SALES_DECLARATIONS : [])] }];

  try {
    for (let step = 0; step < 6; step++) {
      const data = await callGemini({
        systemInstruction: system, contents, tools,
        generationConfig: { maxOutputTokens: 2048, temperature: 0.4 },
      });
      const cand = data.candidates?.[0];
      const content = cand?.content;
      const parts = content?.parts || [];
      if (!parts.length || (cand?.finishReason && !['STOP', 'MAX_TOKENS'].includes(cand.finishReason))) {
        console.error(`[ai] resposta vazia/bloqueada: finishReason=${cand?.finishReason} promptFeedback=${JSON.stringify(data.promptFeedback || {})}`);
      }
      const calls = parts.filter((p) => p.functionCall);

      if (!calls.length) {
        return out(parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('').trim());
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
        } else if (sales && typeof sales[c.name] === 'function') {
          try {
            const r = await sales[c.name](c.args || {});
            result = r.response;
            extraMessages.push(...(r.send || [])); ownerNotices.push(...(r.notifyOwner || []));
          } catch (e) {
            console.error(`[ai] ferramenta ${c.name} falhou:`, e.message);
            result = { ok: false, erro: 'Falha interna. Peça desculpas e use chamar_atendente_humano.' };
          }
        } else {
          result = { erro: 'Ferramenta desconhecida.' };
        }
        responses.push({ functionResponse: { name: c.name, response: result } });
      }
      contents.push({ role: 'user', parts: responses });
    }
  } catch (e) {
    console.error('[ai] erro:', e?.message || e);
    return out(FALLBACK, true, 'erro na IA');
  }
  return out(FALLBACK, true, 'loop de ferramentas');
}
