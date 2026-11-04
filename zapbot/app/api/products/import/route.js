import { pool } from '@/lib/db.js';
import { currentBusiness, unauthorized, bad, readJson } from '@/lib/session.js';
import { parseBulk } from '@/lib/product.js';

export async function POST(req) {
  const b = await currentBusiness();
  if (!b) return unauthorized();
  const { text } = await readJson(req, 2_000_000);
  const { items, errors } = parseBulk(text);
  if (!items.length) return bad(errors[0] || 'Nenhum produto encontrado no texto');
  if (items.length > 2000) return bad('Importe no máximo 2000 produtos por vez');

  const client = await pool().connect();
  try {
    await client.query('begin');
    for (const p of items) {
      await client.query(
        `insert into products (business_id, name, category, description, indications, characteristics, price, in_stock, active, search_text)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [b.id, p.name, p.category, p.description, p.indications, p.characteristics, p.price, p.in_stock, p.active, p.search_text],
      );
    }
    await client.query('commit');
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
  return Response.json({ imported: items.length, errors });
}
