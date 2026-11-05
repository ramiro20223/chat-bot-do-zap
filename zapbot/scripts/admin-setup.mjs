// Cria as credenciais do ADMINISTRADOR (só você). Uso: npm run admin:setup
// Gera o hash da senha (scrypt) e o segredo do 2FA; mostra as linhas para colar nas variáveis de ambiente do servidor.
// A senha digitada NUNCA é gravada em arquivo. Nada disto vai para o Git.
import readline from 'node:readline';
import { hashAdminPassword } from '../lib/admin-auth.js';
import { generateTotpSecret, otpauthUri } from '../lib/totp.js';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
const lines = rl[Symbol.asyncIterator]();
let muted = false;
const write = rl._writeToOutput?.bind(rl);
rl._writeToOutput = (str) => { if (!muted || /[\r\n]/.test(str)) write?.(str); };
async function ask(q, hidden = false) {
  process.stdout.write(q);
  muted = hidden;
  const { value } = await lines.next();
  muted = false;
  if (hidden && process.stdin.isTTY) process.stdout.write('\n');
  return value ?? '';
}

const email = (await ask('E-mail do administrador: ')).trim().toLowerCase();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { console.error('E-mail inválido.'); process.exit(1); }
const pw = await ask('Senha do administrador (mínimo 14 caracteres): ', true);
if (pw.length < 14) { console.error('Senha curta demais: use pelo menos 14 caracteres (uma frase longa é melhor).'); process.exit(1); }
if (pw !== await ask('Repita a senha: ', true)) { console.error('As senhas não conferem.'); process.exit(1); }

const secret = generateTotpSecret();
const hash = await hashAdminPassword(pw);
rl.close();
console.log(`
Cole estas linhas nas variáveis de ambiente do servidor (Railway/Render/.env):

ADMIN_EMAIL=${email}
ADMIN_PASSWORD_HASH=${hash}
ADMIN_TOTP_SECRET=${secret}

2FA: no Google Authenticator / Authy escolha "Inserir chave de configuração" e digite:
  ${secret}
(ou abra este endereço no leitor: ${otpauthUri({ secret, account: email, issuer: 'ZapBot Admin' })})

Também defina ADMIN_WHATSAPP com o SEU número com DDD (para onde o cliente é enviado).
Guarde o segredo do 2FA em local seguro: sem ele e sem a senha ninguém entra no painel admin.
`);
