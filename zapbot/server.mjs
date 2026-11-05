// Servidor único: Next.js (painel + API) e as conexões do WhatsApp no mesmo processo.
// O WhatsApp precisa de um processo sempre ligado — não funciona em hospedagem "serverless" (ex.: Vercel).
import { createServer } from 'node:http';
import next from 'next';

try { process.loadEnvFile('.env'); } catch { /* sem .env: usa variáveis do ambiente */ }

const dev = process.env.NODE_ENV !== 'production';
const port = Number(process.env.PORT || 3000);

// Em produção, segredo ausente/fraco = o servidor se recusa a subir (melhor parar do que rodar inseguro).
const { configProblems } = await import('./lib/config.js');
const { errors, warnings } = configProblems(process.env, !dev);
warnings.forEach((w) => console.warn(`[config] ⚠️  ${w}`));
if (errors.length) {
  errors.forEach((e) => console.error(`[config] ❌ ${e}`));
  console.error('[config] Corrija as variáveis acima e inicie de novo.');
  process.exit(1);
}

const app = next({ dev, hostname: '0.0.0.0', port });
const handle = app.getRequestHandler();

// Abre a porta JÁ: hospedagens como o Render derrubam o serviço se a porta demora a responder.
// Enquanto o Next prepara, quem chegar recebe um "iniciando" (503) e tenta de novo.
let ready = false;
createServer((req, res) => {
  if (ready) return handle(req, res);
  res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '5' });
  res.end('Iniciando, tente em alguns segundos.');
}).listen(port, '0.0.0.0', () => console.log(`> porta ${port} aberta (${dev ? 'desenvolvimento' : 'produção'}), preparando…`));

await app.prepare();

const { ensureSchema } = await import('./lib/db.js');
await ensureSchema();
console.log('[db] schema ok');

const { migrateAuthEncryption } = await import('./lib/wa-auth.js');
const migrated = await migrateAuthEncryption();
if (migrated) console.log(`[seg] ${migrated} registro(s) da sessão do WhatsApp foram criptografados`);

const { restoreSessions } = await import('./lib/wa.js');
restoreSessions().catch((e) => console.error('[wa] restore:', e.message));

ready = true;
console.log('> ZapBot pronto');
