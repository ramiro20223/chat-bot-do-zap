# ZapBot — atendente de WhatsApp com IA para qualquer tipo de empresa

Painel web onde cada empresa:
1. cria a conta e **conecta o WhatsApp lendo um QR Code** (como o WhatsApp Web);
2. responde um **questionário** (muda conforme o tipo: restaurante, farmácia, loja, assistência, salão…) com horários, serviços, pagamento, entrega etc.;
3. **cadastra produtos** (nome, categoria, descrição, indicações, características, preço, estoque), com importação em massa;
4. o bot passa a **responder sozinho**, entendendo a pergunta (Google Gemini, com plano gratuito) e consultando o catálogo — ex.: "preciso de algo para dor de cabeça" lista o que a farmácia tem, para que serve e o preço.

Também tem **chat de teste** no painel (sem enviar nada a ninguém), **histórico de conversas** e **transferência para humano**.

## Como rodar

Precisa de Node 20+ e um Postgres.

```bash
cp .env.example .env     # preencha DATABASE_URL, AUTH_SECRET e GEMINI_API_KEY
npm install
npm run dev              # http://localhost:3000  (cria as tabelas sozinho)
npm test                 # testes da lógica (horários, busca, Pix, pedidos, comprovantes, IA simulada)
```

Crie uma conta em `/login`, termine a **Configuração**, cadastre alguns **Produtos**, use **Testar bot** e só então conecte o WhatsApp.


## Modo vendas (pedido, negociação, Pix e comprovante)

Ative em **Configuração → "MODO VENDAS"** e preencha: WhatsApp do dono, tipo e chave Pix, nome do recebedor, desconto máximo e o que o bot deve perguntar antes de fechar.

**Como o atendimento funciona**
1. O cliente pede algo; o bot busca no catálogo e **pergunta os detalhes** necessários (quantidade, variações, retirada/entrega, endereço, nome…).
2. O bot **negocia só dentro do desconto máximo** que você definiu. O desconto e todos os valores são calculados pelo código: a IA não consegue dar mais desconto nem inventar preço.
3. Mostra o **resumo** do pedido e só gera o Pix depois de um "sim" claro do cliente.
4. O **código Pix "copia e cola"** (valor fixo, padrão do Banco Central) é enviado em mensagem separada.
5. O cliente manda o comprovante; o Gemini **lê a imagem** e o sistema confere valor, status (efetivado/agendado), favorecido, data e se o comprovante **já foi usado em outro pedido**.
6. O dono recebe no WhatsApp: pedido completo, **foto do comprovante**, o que bateu e o que não bateu.
7. O dono responde **`ok 12`** (confirma), **`recusar 12 motivo`** ou **`cancelar 12`**; o cliente é avisado. `pedidos` lista os pendentes. Também dá para fazer tudo na aba **Pedidos** do painel.

**Para quem o bot manda mensagem**: só para o número do dono (avisos) e para clientes que escreveram nas últimas 24 h (respostas e avisos de pedido). Não existe envio para outros números: isso é travado no código, no ponto único de envio (`sendRaw`), então até um erro futuro não consegue mandar mensagem a um desconhecido. Use o botão "Enviar mensagem de teste ao dono" na aba WhatsApp para conferir o número.

**O que o bot NÃO faz (de propósito)**: não confirma pagamento. Ele nunca diz ao cliente que o Pix caiu. Um print pode ser falso ou editado, e só o app do banco prova que o dinheiro entrou, então a confirmação é sempre do dono. Para confirmação automática de verdade seria preciso integrar um provedor de Pix com webhook (Mercado Pago, Efí, Asaas…).

## Reconhecimento

- Entende **áudios** e **fotos** dos clientes (o Gemini ouve e vê).
- Busca no catálogo tolera **plural, sinônimos** (ex.: "enxaqueca" encontra "dor de cabeça") e **erros de digitação**.
- Pergunta ao Google qual modelo Gemini está disponível para a sua chave (`GEMINI_MODEL=auto`).

## Hospedagem (importante)

O WhatsApp exige um **processo sempre ligado**. **Não funciona na Vercel/Netlify** (serverless). Use Railway, Render, Fly.io, um VPS ou qualquer lugar que rode Docker (`Dockerfile` incluso), com HTTPS.

- Rode **uma única instância**. Duas instâncias com a mesma sessão derrubam uma à outra.
- A sessão do WhatsApp fica no Postgres: deploys e reinícios reconectam sozinhos, sem ler o QR de novo.
- Troque `AUTH_SECRET` por um valor próprio e secreto.

## Riscos que você precisa conhecer

- **Conexão por QR Code usa o Baileys, que não é oficial.** Viola os termos do WhatsApp: números podem ser **banidos**, principalmente com envio em massa ou muitas denúncias. O bot só **responde** a quem escreve primeiro e simula digitação, o que reduz, mas não elimina, o risco. Para clientes finais, avalie a **API oficial da Meta (Cloud API)**; a arquitetura separa a conexão (`lib/wa.js`) do atendimento (`lib/bot.js`), então dá para trocá-la depois.
- **Dados de clientes (LGPD):** as conversas ficam salvas no seu banco. Informe isso aos clientes e defina uma política de retenção.
- **Farmácia:** o bot só lista o que está no catálogo, lembra de procurar um farmacêutico e encaminha casos sensíveis para humano. Revise as respostas com o responsável técnico antes de usar de verdade.
- A IA pode errar. Mantenha o catálogo e o questionário atualizados, que são a "fonte de verdade" dela, e acompanhe a aba **Conversas**.

## Segurança

**O que o código já faz**
- **Segredos obrigatórios:** em produção o servidor se recusa a iniciar sem `AUTH_SECRET` (32+ caracteres) e `DATA_ENCRYPTION_KEY`. Não existe segredo padrão.
- **Sessão do WhatsApp criptografada** no banco (AES-256-GCM, amarrada à empresa): quem copiar o banco sem a chave não consegue usar o seu número.
- **Login:** senha com bcrypt (custo 12), mínimo de 10 caracteres, bloqueio de senhas comuns, tempo de resposta igual para e-mail existente ou não, três freios contra tentativa em massa, sessão de 7 dias que pode ser revogada (*Sair de todos*) e cookie `__Host-` em produção.
- **Cadastro fechado em produção**, só com código de convite (`REGISTRATION_CODE`).
- **Proteção web:** barreira contra CSRF (só aceita alterações vindas do próprio site), cabeçalhos de segurança (CSP, HSTS, anti-incorporação), respostas da API sem cache, limite de tamanho e validação das entradas, IDs validados.
- **Trava de destinatários:** o bot só envia mensagem ao número do dono e a clientes que escreveram nas últimas 24 h, imposto no ponto único de envio. Anti-flood por cliente.
- **Dinheiro:** valores, desconto e Pix calculados em código; o bot nunca confirma pagamento sozinho.
- **Repositório:** `.gitignore` bloqueia `.env`, chaves e arquivos de assinatura do APK; um scanner de segredos e os testes rodam a cada Pull Request; o Dependabot avisa de dependências com falha de segurança.

**APK: o que fica protegido e o que não fica**

O jeito certo de gerar o APK deste projeto é uma **casca** (Capacitor ou TWA) que abre o seu site `https://...`. Assim:

- ✅ **O código do servidor (bot, Pix, regras, banco) NÃO vai dentro do APK.** Ele fica no servidor, e ninguém com o app consegue ler nem alterar.
- ✅ **Nenhuma chave vai no app.** As chaves (`GEMINI_API_KEY`, banco, segredos) existem só no servidor.
- ⚠️ **O código das telas é público para quem tiver o app.** Todo APK é um arquivo ZIP, e as telas (HTML/JS) podem ser lidas por quem o abrir. Ofuscar só atrasa, não protege. Por isso nada sensível pode estar nas telas.
- 🔒 **A segurança de verdade está no servidor:** cada pedido é conferido lá (login, empresa dona do dado, limites). Alterar o app não dá poder nenhum.

Cuidados na hora de gerar o APK:
1. Aponte o app **só** para o seu domínio HTTPS (sem `http`), com `usesCleartextTraffic="false"`.
2. `android:allowBackup="false"` e **desligue a depuração** do WebView na versão de lançamento.
3. Ative a minificação (R8) na versão de lançamento.
4. **Guarde o arquivo de assinatura (`.keystore`) fora do Git**, com cópia segura. Quem o tiver pode publicar atualizações falsas do seu app. Prefira o *Play App Signing*.
5. Não coloque chave nenhuma no app, nem "escondida".

**O que nenhum código resolve (é com você):** 2FA nas contas (GitHub, hospedagem, banco, Google), banco sem acesso público, backups testados, plano pago do Gemini e uma política de privacidade (LGPD). Veja o `SECURITY.md`.

## Estrutura

```
server.mjs           servidor: Next.js + conexões do WhatsApp no mesmo processo
db/schema.sql        tabelas (users, businesses, products, conversations, messages, wa_auth)
lib/templates.js     questionários por tipo de empresa e rótulos dos produtos
lib/prompt.js        monta as instruções do atendente com os dados da empresa
lib/ai.js            Gemini com ferramentas: buscar_produtos, chamar_atendente_humano, registrar_pedido, gerar_pix, cancelar_pedido
lib/pix.js           Pix copia e cola (BR Code + CRC16)
lib/order-logic.js   pedido, desconto limitado, comandos do dono
lib/order-tools.js   ferramentas de venda + ações do dono
lib/proof.js         conferência do comprovante (valor, duplicado, status...)
lib/catalog.js       busca no catálogo (ranking por termos, sem acento)
lib/wa.js            sessões do WhatsApp (QR, reconexão, fila, simulação de digitação)
lib/bot.js           fluxo de uma mensagem: salva, consulta IA, responde, pausa
app/                 painel (login, conexão, configuração, produtos, teste, conversas) e API
```

## Próximos passos sugeridos

Envio de imagens dos produtos, entendimento de áudio (transcrição), múltiplos números por empresa, planos/cobrança, e a integração com a API oficial da Meta.


## Assinatura (R$ 99,99/mês), ID da conta e liberação pelo administrador

**Fluxo do cliente (no app/APK):**
1. Abre o app → tela animada explicando o ZapBot e a assinatura de R$ 99,99/mês.
2. Toca em **Criar minha conta** (e-mail + senha). A conta nasce **sem acesso** e ganha um **ID** (ex.: `ZB-7K2M9Q`).
3. Na tela do ID, toca em **Falar no WhatsApp e ativar**: abre o seu WhatsApp (`ADMIN_WHATSAPP`) com o ID já escrito.
4. Vocês conversam, ele paga, você libera. A tela dele confere sozinha a cada 8 s e abre o painel assim que você liberar.

**Você (administrador):** entre em `https://SEU-SITE/admin` com e-mail + senha + código do autenticador (2FA). Busque o cliente pelo ID ou e-mail e use **Liberar 30 dias**, **+30 dias** (soma ao que sobrou), **Remover** ou **Bloquear**. Tudo fica registrado em `subscription_events`.

**Configurar:**
```bash
npm run admin:setup        # pede e-mail e senha (mín. 14 caracteres) e gera o 2FA; cole as 3 linhas no servidor
```
Depois defina também `PASSWORD_PEPPER`, `ADMIN_WHATSAPP` e `ALLOW_REGISTRATION=true` (veja `.env.example`). Para testar no seu computador sem assinatura: `SUBSCRIPTION_REQUIRED=false`.

**Regras:** sem assinatura ativa (pendente, vencida ou bloqueada) o painel responde "assinatura inativa" **e o bot fica mudo** (não responde clientes nem avisa o dono). Contas criadas antes deste recurso viram "aguardando" até você liberar.

**Senhas e segredos:** senha do cliente = HMAC com a pimenta (`PASSWORD_PEPPER`) + bcrypt custo 12 (contas antigas são regravadas assim no próximo login). Senha do admin = scrypt; o 2FA é TOTP (RFC 6238) e o mesmo código não vale duas vezes. Nenhuma senha é guardada em texto puro, nem no banco nem nos logs.

**Cadeado e senhas (painel admin):** cliente sem assinatura ativa vê o painel normal por trás de uma tela translúcida com cadeado ("Efetue o pagamento para ter o acesso") e o botão do seu WhatsApp; ao você ativar, a tela some sozinha. Em `/admin` o botão **Nova senha** gera uma senha provisória (aparece uma única vez) que você manda ao cliente; ele troca em Painel → Minha conta. Existe um único administrador, definido só por variáveis de ambiente; o e-mail dele não pode ser cadastrado como cliente.

**Acessibilidade (todas as telas):** botão ♿ com tema automático/claro/escuro, tamanho da letra (4 níveis), alto contraste e reduzir animações. A escolha fica salva no aparelho.
