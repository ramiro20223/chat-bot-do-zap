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
