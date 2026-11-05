// Utilitários de texto (puros).
const STOP = new Set(('de da do das dos para pra por com sem um uma uns umas o a os as e ou que qual quais quero queria preciso '
  + 'precisava tem tenho voces vcs voce algo alguma algum ter ai la aqui meu minha seu sua no na nos nas em ao aos se me '
  + 'gostaria saber favor boa bom dia tarde noite oi ola').split(' '));

export const stripAccents = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');

export const normalize = (s) => stripAccents(s).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

/** Singular aproximado: calhas->calha, dores->dor, pães->pao, animais->animal, papéis->papel. */
export function stem(t) {
  if (t.length <= 3) return t;
  if (t.endsWith('oes') || t.endsWith('aes')) return `${t.slice(0, -3)}ao`;
  if (t.endsWith('ais')) return `${t.slice(0, -3)}al`;
  if (t.endsWith('eis')) return `${t.slice(0, -3)}el`;
  if (t.endsWith('ores')) return t.slice(0, -2); // dores->dor, motores->motor
  if (t.length > 5 && (t.endsWith('res') || t.endsWith('zes') || t.endsWith('nes'))) return t.slice(0, -2);
  if (t.endsWith('s') && !t.endsWith('ss')) return t.slice(0, -1);
  return t;
}

// Sinônimos/gírias comuns: o cliente fala de um jeito e o cadastro usa outro.
const SYN = {
  remedio: ['medicamento'], medicamento: ['remedio'], cefaleia: ['dor', 'cabeca'], enxaqueca: ['dor', 'cabeca'],
  analgesico: ['dor'], antitermico: ['febre'], celular: ['telefone', 'smartphone'], telefone: ['celular'],
  smartphone: ['celular'], laptop: ['notebook'], computador: ['notebook'], pc: ['computador'],
  conserto: ['reparo', 'manutencao'], consertar: ['reparo', 'conserto'], reparo: ['conserto'], arrumar: ['reparo', 'conserto'],
  display: ['tela'], tela: ['display'], visor: ['tela'], lanche: ['hamburguer'], refri: ['refrigerante'], refrigerante: ['refri'],
  sobremesa: ['doce'], doce: ['sobremesa'], barato: ['promocao'], entregar: ['entrega'], delivery: ['entrega'],
  cabelo: ['corte'], barba: ['barbearia'], unha: ['manicure'], racao: ['pet'], vacina: ['vacinacao'],
};

/** Palavras-chave de busca: sem acento, sem palavras vazias, no singular, com sinônimos. Únicas. */
export function tokenize(query) {
  const out = [];
  const add = (t) => { if (t.length >= 2 && !out.includes(t)) out.push(t); };
  for (const raw of normalize(query).split(' ')) {
    if (raw.length < 3 || STOP.has(raw)) continue;
    const t = stem(raw);
    add(t);
    for (const syn of SYN[t] || SYN[raw] || []) add(syn);
  }
  return out.slice(0, 16);
}

/** Distância de edição (com corte): devolve max+1 se passar do limite. */
export function editDistance(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let min = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < min) min = cur[j];
    }
    if (min > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Quantos termos da busca "quase batem" (erro de digitação) com palavras do texto do produto. */
export function fuzzyScore(tokens, searchText) {
  const words = [...new Set(String(searchText).split(' ').filter(Boolean))];
  let score = 0;
  for (const t of tokens) {
    if (t.length < 4) continue;
    const max = t.length >= 8 ? 2 : 1;
    if (words.some((w) => editDistance(t, w, max) <= max || editDistance(t, stem(w), max) <= max)) score++;
  }
  return score;
}

/** Texto usado na busca do catálogo (guardado em products.search_text). */
export function buildSearchText(p) {
  return normalize([p.name, p.category, p.description, p.indications, p.characteristics].filter(Boolean).join(' '));
}

export const brl = (n) => (n === null || n === undefined || n === ''
  ? null
  : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

/**
 * Converte o histórico do banco para o formato de chat (user/assistant):
 * começa com "user", alterna papéis (junta mensagens seguidas do mesmo lado).
 */
export function toChatMessages(history, newText) {
  const raw = [...history.map((h) => ({ role: h.direction === 'in' ? 'user' : 'assistant', text: h.body })),
    { role: 'user', text: newText }];
  const merged = [];
  for (const m of raw) {
    if (!m.text) continue;
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) last.content += `\n${m.text}`;
    else merged.push({ role: m.role, content: m.text });
  }
  while (merged.length && merged[0].role !== 'user') merged.shift();
  return merged;
}
