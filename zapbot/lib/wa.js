// Sessões de WhatsApp por QR Code (como o WhatsApp Web), uma por empresa.
// ATENÇÃO: usa o Baileys, biblioteca NÃO oficial. É gratuita e funciona como "aparelho conectado",
// mas viola os termos do WhatsApp e o número pode ser banido (principalmente com envio em massa).
import crypto from 'node:crypto';
import pino from 'pino';
import QRCode from 'qrcode';
import makeWASocket, {
  DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore,
} from '@whiskeysockets/baileys';
import { query } from './db.js';
import { usePgAuthState, clearAuth } from './wa-auth.js';
import { handleIncoming, pauseConversation } from './bot.js';

const logger = pino({ level: process.env.WA_LOG_LEVEL || 'silent' });
const DEBOUNCE_MS = 2500;            // junta mensagens seguidas do cliente numa única resposta
const TAKEOVER_MIN = Number(process.env.WA_HUMAN_TAKEOVER_MINUTES || 30);

// Estado compartilhado entre o servidor e as rotas do Next (empacotados separadamente).
const store = (globalThis.__zapWa ??= { sessions: new Map() });
const sessions = store.sessions;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function newSession() {
  return { status: 'idle', qr: null, phone: null, sock: null, stopping: false, retries: 0,
    botSent: new Set(), pending: new Map(), chains: new Map(), noticeAt: new Map() };
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

/** Chamado na inicialização do servidor: reconecta as empresas que estavam conectadas. */
export async function restoreSessions() {
  const { rows } = await query('select id from businesses where wa_enabled');
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

async function onMessage(businessId, s, sock, m) {
  const jid = m.key.remoteJid;
  if (!jid || !m.message) return;
  if (jid.endsWith('@g.us') || jid.endsWith('@broadcast') || jid.endsWith('@newsletter')) return; // só conversas diretas

  if (m.key.fromMe) {
    if (s.botSent.has(m.key.id)) return;                       // foi o próprio bot
    await pauseConversation(businessId, jid, TAKEOVER_MIN);    // o dono respondeu manualmente: bot silencia
    return;
  }

  const text = extractText(m.message);
  const content = unwrap(m.message) || {};
  if (!text) {
    if (content.audioMessage && Date.now() - (s.noticeAt.get(jid) || 0) > 10 * 60_000) {
      s.noticeAt.set(jid, Date.now());
      await sendText(s, sock, jid, 'Ainda não consigo ouvir áudios por aqui 😅 Pode me escrever sua dúvida?');
    }
    return;
  }

  const p = s.pending.get(jid) || { texts: [], name: m.pushName, timer: null };
  p.texts.push(text); p.name = m.pushName || p.name;
  clearTimeout(p.timer);
  p.timer = setTimeout(() => {
    s.pending.delete(jid);
    const joined = p.texts.join('\n');
    const prev = s.chains.get(jid) || Promise.resolve();
    const next = prev.then(() => respond(businessId, s, sock, jid, p.name, joined))
      .catch((e) => console.error('[wa] atendimento:', e.message));
    s.chains.set(jid, next);
    next.finally(() => { if (s.chains.get(jid) === next) s.chains.delete(jid); });
  }, DEBOUNCE_MS);
  s.pending.set(jid, p);
}

async function respond(businessId, s, sock, jid, name, text) {
  const { rows } = await query('select * from businesses where id = $1', [businessId]);
  const business = rows[0];
  if (!business?.bot_enabled) return;
  await handleIncoming({ business, jid, name, text, send: (t) => sendText(s, sock, jid, t) });
}

/** Envia texto simulando digitação (menos robótico e menos suspeito). */
async function sendText(s, sock, jid, text) {
  const id = `3EB0${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
  s.botSent.add(id);
  if (s.botSent.size > 500) s.botSent.delete(s.botSent.values().next().value);
  try {
    await sock.sendPresenceUpdate('composing', jid);
    await sleep(Math.min(4000, 600 + text.length * 25) + Math.random() * 500);
    await sock.sendMessage(jid, { text }, { messageId: id });
  } finally {
    sock.sendPresenceUpdate('paused', jid).catch(() => {});
  }
}
