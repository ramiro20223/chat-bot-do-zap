// Sessões de WhatsApp por QR Code (como o WhatsApp Web), uma por empresa.
// ATENÇÃO: usa o Baileys, biblioteca NÃO oficial. É gratuita e funciona como "aparelho conectado",
// mas viola os termos do WhatsApp e o número pode ser banido (principalmente com envio em massa).
import crypto from 'node:crypto';
import pino from 'pino';
import QRCode from 'qrcode';
import makeWASocket, {
  DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, downloadMediaMessage,
} from '@whiskeysockets/baileys';
import { query } from './db.js';
import { usePgAuthState, clearAuth } from './wa-auth.js';
import { handleIncoming, pauseConversation } from './bot.js';
import { handleOwnerCommand } from './order-tools.js';
import { samePhone, withinReplyWindow, canSendTo } from './guard.js';
import { createLimiter } from './limits.js';
import { hasAccess, subscriptionRequired } from './subscription.js';

const logger = pino({ level: process.env.WA_LOG_LEVEL || 'silent' });
const DEBOUNCE_MS = 2500;            // junta mensagens seguidas do cliente numa única resposta
const TYPING_MAX_MS = Number(process.env.WA_TYPING_MAX_MS || 2500); // pausa "digitando…" (parece humano, mas custa tempo)
// Anti-flood: um cliente (ou robô) que manda mensagens demais é ignorado por um tempo. Protege a cota da IA e evita loops de bots.
const flood = createLimiter({ max: Number(process.env.WA_MAX_MSGS_PER_10MIN || 30), windowMs: 10 * 60_000 });
const MAX_TEXT = 2000;
const TAKEOVER_MIN = Number(process.env.WA_HUMAN_TAKEOVER_MINUTES || 30);

// Estado compartilhado entre o servidor e as rotas do Next (empacotados separadamente).
const store = (globalThis.__zapWa ??= { sessions: new Map() });
const sessions = store.sessions;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function newSession() {
  return { status: 'idle', qr: null, phone: null, sock: null, stopping: false, retries: 0,
    botSent: new Set(), pending: new Map(), chains: new Map(), noticeAt: new Map(), ownerCache: null,
    ownerJids: new Set(), lastInbound: new Map() };   // base da trava de destinatários (ver sendRaw)
}

export function getStatus(businessId) {
  const s = sessions.get(businessId);
  return s ? { status: s.status, qr: s.qr, phone: s.phone } : { status: 'idle', qr: null, phone: null };
}

const setEnabled = (businessId, on) => query('update businesses set wa_enabled = $2 where id = $1', [businessId, on]);

export async function connect(businessId) {
  let s = sessions.get(businessId);
  if (s && s.status !== 'idle') return getStatus(businessId);
  s = newSession();
  sessions.set(businessId, s);
  s.status = 'connecting';
  await open(businessId, s);
  return getStatus(businessId);
}

/** Desconecta e desvincula o aparelho (o usuário precisará ler o QR de novo). */
export async function disconnect(businessId) {
  const s = sessions.get(businessId);
  if (s) {
    s.stopping = true;
    try { await s.sock?.logout(); } catch { /* já desconectado */ }
    try { s.sock?.end(undefined); } catch { /* ignore */ }
    sessions.delete(businessId);
  }
  await clearAuth(businessId);
  await setEnabled(businessId, false);
}

/** Desligamento do servidor (deploy/reinício): fecha as conexões SEM desvincular o aparelho. Ao subir de novo, restoreSessions reconecta. */
export function shutdownAll() {
  for (const s of sessions.values()) {
    s.stopping = true;
    try { s.sock?.end(undefined); } catch { /* já fechado */ }
  }
}

/** Chamado na inicialização do servidor: reconecta as empresas que estavam conectadas. */
export async function restoreSessions() {
  const { rows } = await query('select b.id from businesses b join users u on u.id = b.user_id where b.wa_enabled and not u.blocked');
  for (const r of rows) {
    connect(r.id).catch((e) => console.error('[wa] falha ao restaurar', r.id, e.message));
    await sleep(1500);
  }
  if (rows.length) console.log(`[wa] restaurando ${rows.length} sessão(ões)`);
}

async function open(businessId, s) {
  const { state, saveCreds } = await usePgAuthState(businessId);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({}));

  const sock = makeWASocket({
    version,
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    logger,
    browser: ['ZapBot', 'Chrome', '1.0.0'],
    markOnlineOnConnect: false,   // o celular continua recebendo as notificações normalmente
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
  });
  s.sock = sock;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      s.status = 'qr';
      s.qr = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
    }
    if (connection === 'open') {
      s.status = 'connected'; s.qr = null; s.retries = 0;
      s.phone = (sock.user?.id || '').split(':')[0].split('@')[0] || null;
      await setEnabled(businessId, true);
      console.log(`[wa] ${businessId} conectado (${s.phone})`);
    }
    if (connection === 'close') {
      s.qr = null;
      if (s.stopping || s.sock !== sock) return;
      const code = lastDisconnect?.error?.output?.statusCode;
      console.log(`[wa] ${businessId} desconectado (código ${code})`);

      if (code === DisconnectReason.loggedOut) {             // desvinculado pelo celular
        sessions.delete(businessId);
        await clearAuth(businessId); await setEnabled(businessId, false);
        return;
      }
      if (code === DisconnectReason.timedOut && s.status === 'qr') { // ninguém leu o QR a tempo
        s.status = 'idle'; s.sock = null;
        return;
      }
      s.status = 'connecting';
      const delay = code === DisconnectReason.restartRequired ? 500 : Math.min(60_000, 2000 * 2 ** s.retries++);
      setTimeout(() => { if (!s.stopping && sessions.get(businessId) === s) open(businessId, s).catch((e) => console.error('[wa] reabrir:', e.message)); }, delay);
    }
  });

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const m of messages) onMessage(businessId, s, sock, m).catch((e) => console.error('[wa] mensagem:', e.message));
  });
}

// ---------- mensagens ----------

const WRAPPERS = ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'documentWithCaptionMessage'];

function unwrap(message) {
  let c = message;
  for (let i = 0; i < 3; i++) {
    const k = WRAPPERS.find((w) => c?.[w]?.message);
    if (!k) break;
    c = c[k].message;
  }
  return c;
}

export const extractText = (message) => {
  const c = unwrap(message) || {};
  return (c.conversation || c.extendedTextMessage?.text || c.imageMessage?.caption || c.videoMessage?.caption || '').trim();
};

const MAX_IMAGE = 6 * 1024 * 1024;
const MAX_AUDIO = 3 * 1024 * 1024;
const MAX_MEDIA_PER_BATCH = 4;

async function fetchMedia(m, sock, kind, mime, size, max) {
  if (size && Number(size) > max) return null;
  try {
    const buf = await downloadMediaMessage(m, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage });
    if (!buf || buf.length > max) return null;
    return { kind, mimeType: String(mime || '').split(';')[0] || (kind === 'image' ? 'image/jpeg' : 'audio/ogg'), data: buf.toString('base64') };
  } catch (e) {
    console.error(`[wa] não consegui baixar ${kind}:`, e.message);
    return null;
  }
}

// Empresa SÓ se a assinatura do dono estiver ativa. Vencida/bloqueada/pendente = o bot fica totalmente mudo (nem responde, nem avisa).
const businessOf = async (id) => {
  const { rows } = await query(
    'select b.*, u.subscription_until, u.blocked from businesses b join users u on u.id = b.user_id where b.id = $1', [id]);
  const row = rows[0];
  if (!row || !hasAccess(row, new Date(), subscriptionRequired(process.env))) return null;
  const { subscription_until: _s, blocked: _b, ...business } = row;
  return business;
};

/** Número de telefone de quem escreveu (chats novos usam @lid; quando o WhatsApp informa o telefone, usamos ele). */
const phoneJidOf = (m, jid) => (jid.endsWith('@lid') ? (m.key.senderPn || m.key.remoteJidAlt || null) : jid);
const isOwner = (business, phoneJid) =>
  !!phoneJid && !!business?.answers?.owner_phone && samePhone(business.answers.owner_phone, phoneJid.split('@')[0].split(':')[0]);

async function onMessage(businessId, s, sock, m) {
  const jid = m.key.remoteJid;
  if (!jid || !m.message) return;
  if (jid.endsWith('@g.us') || jid.endsWith('@broadcast') || jid.endsWith('@newsletter')) return; // só conversas diretas

  if (m.key.fromMe) {
    if (s.botSent.has(m.key.id)) return;                       // foi o próprio bot
    await pauseConversation(businessId, jid, TAKEOVER_MIN);    // o dono respondeu manualmente: bot silencia
    return;
  }

  const business = await businessOf(businessId);
  if (!business) return;
  const text = extractText(m.message).slice(0, MAX_TEXT);

  // Mensagem do dono: comandos (pedidos, ok 12, recusar 12 motivo...), nunca atendimento de cliente.
  if (isOwner(business, phoneJidOf(m, jid))) {
    s.ownerJids.add(jid);
    if (text) {
      const reply = await handleOwnerCommand({ business, text, notifyCustomer: (cj, t) => sendToCustomer(businessId, cj, t) });
      await sendRaw(s, sock, jid, { text: reply });
    }
    return;
  }
  if (jid.endsWith('@lid') && !phoneJidOf(m, jid) && business.answers?.owner_phone && !s.warnedLid) {
    s.warnedLid = true;
    console.warn('[wa] chat @lid sem telefone visível: se o dono não for reconhecido, os comandos dele não funcionarão por este chat.');
  }

  s.lastInbound.set(jid, Date.now());   // este cliente escreveu agora: o bot pode responder a ele (janela de 24h)
  if (!flood.allow(`${businessId}|${jid}`)) {
    if (Date.now() - (s.noticeAt.get(`flood:${jid}`) || 0) > 10 * 60_000) {
      s.noticeAt.set(`flood:${jid}`, Date.now());
      console.warn(`[wa] FLOOD: ${jid} passou de ${process.env.WA_MAX_MSGS_PER_10MIN || 30} mensagens em 10 min; ignorando por um tempo`);
    }
    return;
  }

  const content = unwrap(m.message) || {};
  const media = [];
  if (content.imageMessage) {
    const x = await fetchMedia(m, sock, 'image', content.imageMessage.mimetype, content.imageMessage.fileLength, MAX_IMAGE);
    if (x) media.push(x);
  }
  if (content.audioMessage) {
    const x = await fetchMedia(m, sock, 'audio', content.audioMessage.mimetype, content.audioMessage.fileLength, MAX_AUDIO);
    if (x) media.push(x);
    else if (Date.now() - (s.noticeAt.get(jid) || 0) > 10 * 60_000) {
      s.noticeAt.set(jid, Date.now());
      await sendText(s, sock, jid, 'Não consegui ouvir esse áudio 😅 Pode me escrever sua dúvida?');
    }
  }
  if (!text && !media.length) return;

  const p = s.pending.get(jid) || { texts: [], media: [], name: m.pushName, timer: null };
  if (text) p.texts.push(text);
  p.media.push(...media); p.media = p.media.slice(-MAX_MEDIA_PER_BATCH);
  p.name = m.pushName || p.name;
  clearTimeout(p.timer);
  p.timer = setTimeout(() => {
    s.pending.delete(jid);
    const prev = s.chains.get(jid) || Promise.resolve();
    const next = prev.then(() => respond(businessId, s, sock, jid, p.name, p.texts.join('\n').slice(0, 4000), p.media))
      .catch((e) => console.error('[wa] atendimento:', e.message));
    s.chains.set(jid, next);
    next.finally(() => { if (s.chains.get(jid) === next) s.chains.delete(jid); });
  }, DEBOUNCE_MS);
  s.pending.set(jid, p);
}

async function respond(businessId, s, sock, jid, name, text, media) {
  const business = await businessOf(businessId);
  if (!business?.bot_enabled) return;
  await handleIncoming({
    business, jid, name, text, media,
    send: (t) => sendText(s, sock, jid, t),
    notifyOwner: (t, image) => notifyOwner(business, s, sock, t, image),
  });
}

// ---------- envio ----------
// TRAVA DE DESTINATÁRIOS: o bot só envia mensagem para (1) o número do dono (notifyOwner / teste) e
// (2) clientes que escreveram nas últimas 24h (respostas e avisos de pedido). Não existe envio para outros números.

async function sendRaw(s, sock, jid, content) {
  if (!canSendTo({ jid, ownerJids: s.ownerJids, lastInbound: s.lastInbound })) {
    console.warn(`[wa] ENVIO BLOQUEADO para ${jid}: não é o dono nem um cliente que escreveu nas últimas 24h`);
    throw new Error('Envio bloqueado: destinatário não permitido');
  }
  const id = `3EB0${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
  s.botSent.add(id);
  if (s.botSent.size > 500) s.botSent.delete(s.botSent.values().next().value);
  return sock.sendMessage(jid, content, { messageId: id });
}

/** Envia texto ao cliente simulando digitação (menos robótico e menos suspeito). */
async function sendText(s, sock, jid, text) {
  try {
    await sock.sendPresenceUpdate('composing', jid);
    await sleep(Math.min(TYPING_MAX_MS, 500 + text.length * 15) + Math.random() * 400);
    await sendRaw(s, sock, jid, { text });
  } finally {
    sock.sendPresenceUpdate('paused', jid).catch(() => {});
  }
}

/** JID do dono (resolvido pelo WhatsApp, que cuida do 9º dígito dos números BR). */
async function ownerJidOf(business, s, sock) {
  const phone = String(business.answers?.owner_phone || '').trim();
  if (!phone) return null;
  if (s.ownerCache?.phone === phone) { s.ownerJids.add(s.ownerCache.jid); return s.ownerCache.jid; }
  let digits = phone.replace(/\D/g, '');
  if (digits.length <= 11) digits = `55${digits}`;
  let jid = `${digits}@s.whatsapp.net`;
  try {
    const r = await sock.onWhatsApp(digits);
    if (r?.[0]?.exists === false) return null;       // número sem WhatsApp
    if (r?.[0]?.jid) jid = r[0].jid;
  } catch { /* usa o jid montado */ }
  s.ownerCache = { phone, jid };
  s.ownerJids.add(jid);
  return jid;
}

async function notifyOwner(business, s, sock, text, image) {
  const jid = await ownerJidOf(business, s, sock);
  if (!jid) { console.warn('[wa] aviso ao dono não enviado: número do dono ausente ou sem WhatsApp'); return false; }
  await sendRaw(s, sock, jid, { text });
  if (image) await sendRaw(s, sock, jid, { image: Buffer.from(image.data, 'base64'), caption: image.caption });
  return true;
}

/** Mensagem de teste ao dono (botão do painel) para conferir se o número está certo. */
export async function sendTestToOwner(businessId) {
  const s = sessions.get(businessId);
  if (!s?.sock || s.status !== 'connected') return { sent: false, reason: 'WhatsApp desconectado' };
  const business = await businessOf(businessId);
  if (!business) return { sent: false, reason: 'assinatura inativa' };
  try {
    const ok = await notifyOwner(business, s, s.sock, `✅ Teste do ZapBot: este número receberá os pedidos e comprovantes de *${business.name}*.\nResponda *ajuda* para ver os comandos.`);
    return ok ? { sent: true } : { sent: false, reason: 'número do dono ausente ou sem WhatsApp' };
  } catch (e) { return { sent: false, reason: e.message }; }
}

/** Avisa um cliente (ex.: pagamento confirmado). Só se ele escreveu nas últimas 24h. */
export async function sendToCustomer(businessId, jid, text) {
  const s = sessions.get(businessId);
  if (!s?.sock || s.status !== 'connected') return { sent: false, reason: 'WhatsApp desconectado' };
  const { rows } = await query(
    `select max(m.created_at) as last_in from messages m join conversations c on c.id = m.conversation_id
     where c.business_id = $1 and c.jid = $2 and m.direction = 'in'`, [businessId, jid]);
  if (!withinReplyWindow(rows[0]?.last_in)) return { sent: false, reason: 'o cliente não escreve há mais de 24h' };
  s.lastInbound.set(jid, new Date(rows[0].last_in).getTime());
  try { await sendText(s, s.sock, jid, text); return { sent: true }; } catch (e) { return { sent: false, reason: e.message }; }
}
