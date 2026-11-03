import { query } from '@/lib/db.js';
import { currentBusiness, unauthorized, bad } from '@/lib/session.js';
import { handleIncoming } from '@/lib/bot.js';

export const dynamic = 'force-dynamic';
const MAX_B64 = 6 * 1024 * 1024 * 1.4;

// Chat de teste do painel: usa exatamente o mesmo fluxo do WhatsApp, sem enviar nada a ninguém.
// Devolve também o que o DONO receberia (pedido novo, comprovante, pedido de atendimento).
export async function POST(req) {
  const b = await currentBusiness();
  if (!b) return unauthorized();
  const { text, reset, image } = await req.json().catch(() => ({}));
  const jid = `teste:${b.id}`;
  if (reset) {
    await query('delete from conversations where business_id = $1 and jid = $2', [b.id, jid]);
    return Response.json({ ok: true });
  }
  const msg = String(text || '').trim().slice(0, 1000);
  const media = [];
  if (image?.data) {
    if (!/^image\/(jpeg|png|webp)$/.test(image.mimeType || '') || image.data.length > MAX_B64) return bad('Imagem inválida ou grande demais (máx. 6 MB, JPG/PNG/WEBP)');
    media.push({ kind: 'image', mimeType: image.mimeType, data: image.data });
  }
  if (!msg && !media.length) return bad('Digite uma mensagem');

  const messages = []; const ownerNotices = [];
  await handleIncoming({
    business: b, jid, name: 'Cliente de teste', text: msg, media, ignorePause: true,
    send: async (t) => { messages.push(t); },
    notifyOwner: async (t, img) => { ownerNotices.push(img ? `${t}\n\n[📎 imagem do comprovante anexada]` : t); },
  });
  return Response.json({ messages, ownerNotices });
}
