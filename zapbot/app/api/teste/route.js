import { query } from '@/lib/db.js';
import { currentBusiness, unauthorized, bad } from '@/lib/session.js';
import { handleIncoming } from '@/lib/bot.js';

export const dynamic = 'force-dynamic';

// Chat de teste do painel: usa exatamente o mesmo fluxo do WhatsApp, sem enviar nada a ninguém.
export async function POST(req) {
  const b = await currentBusiness();
  if (!b) return unauthorized();
  const { text, reset } = await req.json().catch(() => ({}));
  const jid = `teste:${b.id}`;
  if (reset) {
    await query('delete from conversations where business_id = $1 and jid = $2', [b.id, jid]);
    return Response.json({ ok: true });
  }
  const msg = String(text || '').trim().slice(0, 1000);
  if (!msg) return bad('Digite uma mensagem');
  let reply = '';
  await handleIncoming({ business: b, jid, name: 'Teste', text: msg, ignorePause: true, send: async (t) => { reply = t; } });
  return Response.json({ reply });
}
