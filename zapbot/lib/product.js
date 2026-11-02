// Validação de produtos vindos do painel (puro).
import { buildSearchText } from './text.js';

const FIELDS = ['name', 'category', 'description', 'indications', 'characteristics'];

/** "12,90" | "12.90" | "1.299,90" | 12.9 -> número; vazio -> null; inválido -> NaN */
export function parsePrice(v) {
  if (v === undefined || v === null) return null;
  const raw = String(v).trim().replace(/^R\$\s*/i, '');
  if (raw === '') return null;
  return Number(raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw);
}

/** Retorna { value } pronto para gravar ou { error }. */
export function cleanProduct(input = {}) {
  const p = {};
  for (const f of FIELDS) {
    const s = input[f] == null ? '' : String(input[f]).trim().slice(0, 2000);
    p[f] = s || null;
  }
  if (!p.name) return { error: 'O nome é obrigatório' };
  const price = parsePrice(input.price);
  if (Number.isNaN(price) || (price !== null && (price < 0 || price > 99999999))) return { error: `Preço inválido: ${input.price}` };
  return {
    value: { ...p, price, in_stock: input.in_stock !== false, active: input.active !== false, search_text: buildSearchText(p) },
  };
}

/** Importação em massa: linhas "nome;categoria;preço;descrição;indicações;características". */
export function parseBulk(text) {
  const out = []; const errors = [];
  String(text || '').split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const [name, category, price, description, indications, characteristics] = line.split(';').map((s) => s.trim());
    if (i === 0 && /^nome$/i.test(name)) return; // cabeçalho opcional
    const r = cleanProduct({ name, category, price, description, indications, characteristics });
    if (r.error) errors.push(`Linha ${i + 1}: ${r.error}`); else out.push(r.value);
  });
  return { items: out, errors };
}
