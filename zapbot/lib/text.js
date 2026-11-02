// Utilitários de texto (puros).
const STOP = new Set(('de da do das dos para pra por com sem um uma uns umas o a os as e ou que qual quais quero queria preciso '
  + 'precisava tem tenho voces vcs voce algo alguma algum ter ai la aqui meu minha seu sua no na nos nas em ao aos se me '
  + 'gostaria saber favor boa bom dia tarde noite oi ola').split(' '));

export const stripAccents = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');

export const normalize = (s) => stripAccents(s).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

/** Palavras-chave de busca: sem acento, sem palavras vazias, únicas. */
export function tokenize(query) {
  const out = [];
  for (const t of normalize(query).split(' ')) {
    if (t.length < 3 || STOP.has(t) || out.includes(t)) continue;
    out.push(t);
  }
  return out.slice(0, 12);
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
