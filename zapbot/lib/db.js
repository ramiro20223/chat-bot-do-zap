import fs from 'node:fs';
import pg from 'pg';

// O pool fica em globalThis: o servidor (server.mjs) e as rotas do Next são empacotados
// separadamente e precisam compartilhar a mesma conexão.
const g = globalThis;

export function pool() {
  if (!g.__zapPool) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada');
    const ssl = process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined;
    g.__zapPool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl, max: 10 });
    g.__zapPool.on('error', (e) => console.error('[db] erro no pool:', e.message));
  }
  return g.__zapPool;
}

export const query = (text, params) => pool().query(text, params);

export async function ensureSchema() {
  const sql = fs.readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
  await query(sql);
}
