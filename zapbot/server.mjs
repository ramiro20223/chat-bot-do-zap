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

await app.prepare();

const { ensureSchema } = await import('./lib/db.js');
await ensureSchema();
console.log('[db] schema ok');

const { migrateAuthEncryption } = await import('./lib/wa-auth.js');
const migrated = await migrateAuthEncryption();
if (migrated) console.log(`[seg] ${migrated} registro(s) da sessão do WhatsApp foram criptografados`);

const { restoreSessions } = await import('./lib/wa.js');
restoreSessions().catch((e) => console.error('[wa] restore:', e.message));

createServer((req, res) => handle(req, res)).listen(port, () => {
  console.log(`> ZapBot em http://localhost:${port} (${dev ? 'desenvolvimento' : 'produção'})`);
});
