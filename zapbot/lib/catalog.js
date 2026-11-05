import { query } from './db.js';
import { tokenize, fuzzyScore } from './text.js';

/** Busca no catálogo da empresa: ranqueia por quantos termos batem; sem estoque vem depois. */
export async function searchProducts(businessId, text, limit = 6) {
  const tokens = tokenize(text);
  if (!tokens.length) return [];
  const { rows } = await query(
    `select id, name, category, description, indications, characteristics, price, in_stock from (
       select p.*, (select count(*) from unnest($2::text[]) t where p.search_text like '%' || t || '%') as score
       from products p where p.business_id = $1 and p.active
     ) x where score > 0 order by score desc, in_stock desc, name limit $3`,
    [businessId, tokens, limit],
  );
  if (rows.length) return rows;

  // Nada bateu exatamente: tenta tolerar erros de digitação ("dipirna", "calhs").
  const { rows: all } = await query(
    'select id, name, category, description, indications, characteristics, price, in_stock, search_text from products where business_id = $1 and active',
    [businessId],
  );
  return all
    .map((p) => ({ p, score: fuzzyScore(tokens, p.search_text) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || Number(b.p.in_stock) - Number(a.p.in_stock) || a.p.name.localeCompare(b.p.name))
    .slice(0, limit)
    .map(({ p: { search_text, ...rest } }) => rest);
}
