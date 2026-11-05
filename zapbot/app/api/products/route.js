import { query } from '@/lib/db.js';
import { currentBusiness, unauthorized, bad, readJson } from '@/lib/session.js';
import { cleanProduct } from '@/lib/product.js';

export async function GET() {
  const b = await currentBusiness();
  if (!b) return await unauthorized();
  const { rows } = await query('select id, name, category, description, indications, characteristics, price, in_stock, active from products where business_id = $1 order by name', [b.id]);
  return Response.json(rows);
}

export async function POST(req) {
  const b = await currentBusiness();
  if (!b) return await unauthorized();
  const r = cleanProduct(await readJson(req));
  if (r.error) return bad(r.error);
  const p = r.value;
  const { rows } = await query(
    `insert into products (business_id, name, category, description, indications, characteristics, price, in_stock, active, search_text)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
    [b.id, p.name, p.category, p.description, p.indications, p.characteristics, p.price, p.in_stock, p.active, p.search_text],
  );
  return Response.json({ id: rows[0].id });
}
