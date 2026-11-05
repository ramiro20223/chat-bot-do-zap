import { isUuid } from '@/lib/web-security.js';
import { query } from '@/lib/db.js';
import { currentBusiness, unauthorized, bad, readJson } from '@/lib/session.js';
import { cleanProduct } from '@/lib/product.js';

export async function PUT(req, { params }) {
  const b = await currentBusiness();
  if (!b) return await unauthorized();
  const { id } = await params;
  if (!isUuid(id)) return Response.json({ error: 'Não encontrado' }, { status: 404 });
  const r = cleanProduct(await readJson(req));
  if (r.error) return bad(r.error);
  const p = r.value;
  const res = await query(
    `update products set name=$3, category=$4, description=$5, indications=$6, characteristics=$7, price=$8,
       in_stock=$9, active=$10, search_text=$11, updated_at=now() where id=$1 and business_id=$2`,
    [id, b.id, p.name, p.category, p.description, p.indications, p.characteristics, p.price, p.in_stock, p.active, p.search_text],
  );
  return res.rowCount ? Response.json({ ok: true }) : bad('Produto não encontrado', 404);
}

export async function DELETE(_req, { params }) {
  const b = await currentBusiness();
  if (!b) return await unauthorized();
  const { id } = await params;
  if (!isUuid(id)) return Response.json({ error: 'Não encontrado' }, { status: 404 });
  await query('delete from products where id = $1 and business_id = $2', [id, b.id]);
  return Response.json({ ok: true });
}
