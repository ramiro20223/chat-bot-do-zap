import { query } from '@/lib/db.js';

// Para o "Health Check Path" do Render: /api/health. Não exige login e não expõe nada além de ok/não.
// O servidor responde 200 mesmo se o banco falhar (não reiniciar o app por soluço do banco); o campo "db" mostra a situação.
export async function GET() {
  let db = false;
  try {
    await Promise.race([query('select 1'), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 2000))]);
    db = true;
  } catch { /* db = false */ }
  return Response.json({ ok: true, db });
}
