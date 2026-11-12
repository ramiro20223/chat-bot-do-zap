# Colocar o ZapBot no ar (Render + Supabase)

O ZapBot precisa de um servidor **sempre ligado** (o WhatsApp fica conectado dentro dele). Não funciona na Vercel nem em plano gratuito que "dorme".

## 1. Banco (Supabase)
1. No projeto Supabase, clique em **Connect** e escolha **Session pooler**.
2. Copie o endereço (`postgres://postgres.xxxx:SENHA@...pooler.supabase.com:5432/postgres`) e troque a senha. Use senha só com letras e números.
3. Não use "Direct connection" (IPv6, o Render não alcança) nem "Transaction pooler" (porta 6543).
4. As tabelas são criadas sozinhas na primeira subida, já com a proteção de linhas (RLS) ligada: a API pública do Supabase não enxerga nada.

## 2. Chaves e conta de administrador (no seu computador)
```bash
git clone https://github.com/SEU-USUARIO/chat-bot-do-zap && cd chat-bot-do-zap/zapbot
npm install
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # rode 3 vezes: AUTH_SECRET, DATA_ENCRYPTION_KEY, PASSWORD_PEPPER
npm run admin:setup                                                       # gera ADMIN_EMAIL, ADMIN_PASSWORD_HASH, ADMIN_TOTP_SECRET
```
Guarde `DATA_ENCRYPTION_KEY` e `PASSWORD_PEPPER` em local seguro: perder qualquer uma trava o acesso aos dados. Nada disso vai para o GitHub.

## 3. Render
**New + → Web Service** → repositório → branch `main`:

| Campo | Valor |
|---|---|
| Language | **Node** (não Docker) |
| Root Directory | `zapbot` |
| Build Command | `npm install && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |
| Plano | pago (Starter): o Free dorme e derruba o WhatsApp |
| Instâncias | **1** (não escale: o WhatsApp só pode estar conectado em um lugar) |

Variáveis de ambiente: `DATABASE_URL`, `DATABASE_SSL=true`, `AUTH_SECRET`, `DATA_ENCRYPTION_KEY`, `PASSWORD_PEPPER`, `GEMINI_API_KEY`, `ALLOW_REGISTRATION=true`, `TRUST_PROXY_HOPS=1`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `ADMIN_TOTP_SECRET`, `ADMIN_WHATSAPP` (só dígitos com 55 + DDD).
Opcionais: `HANDOFF_PAUSE_MINUTES` (padrão 60: quanto tempo o bot fica quieto depois de chamar um humano) e `WA_HUMAN_TAKEOVER_MINUTES` (padrão 30: quando você responde pelo celular).

## 4. Conferir
- Logs: `[db] schema ok` e `ZapBot pronto`.
- `https://SEU-SITE.onrender.com/api/health` → `{"ok":true,"db":true}`.
- `/admin`: entre com e-mail, senha e código do autenticador.
- Crie uma conta de teste em `/`, veja o ID, libere em `/admin` e confira que o painel destrava.

## Erros comuns
| Log | Causa |
|---|---|
| `open Dockerfile: no such file` | serviço criado como Docker: apague e recrie como **Node** |
| `Could not read package.json` | Root Directory vazio: use `zapbot` |
| `[config] ❌ ...` | variável obrigatória faltando (o log diz qual) |
| `ENETUNREACH` / não conecta no banco | endereço "Direct connection": use o **Session pooler** |
