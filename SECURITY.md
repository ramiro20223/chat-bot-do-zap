# Segurança

## Reportar um problema
Não abra um Issue público. Fale diretamente com o dono do repositório.

## Checklist antes de colocar no ar
- [ ] `AUTH_SECRET` e `DATA_ENCRYPTION_KEY` **diferentes**, geradas com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. O servidor **não sobe** em produção sem elas.
- [ ] `DATABASE_SSL=true` e banco **sem acesso público** (só o servidor consegue conectar).
- [ ] Site com **HTTPS** (o login só funciona seguro assim).
- [ ] `REGISTRATION_CODE` definido (código de convite). Sem isso o cadastro fica **fechado** em produção.
- [ ] **Autenticação em dois fatores (2FA)** ligada no GitHub, na hospedagem, no banco e na conta do Google AI Studio.
- [ ] Repositório **privado**. Nenhum `.env` no Git (o CI e o `.gitignore` ajudam, mas confira).
- [ ] Backups do banco ligados e **restauração testada**.
- [ ] Plano **pago** da API do Gemini (o gratuito usa o conteúdo das conversas para melhorar produtos do Google).
- [ ] Rode **uma única cópia** do servidor.
- [ ] Se uma chave vazar: troque na hora (a antiga já deve ser considerada pública) e use *Sair de todos os aparelhos*.

## O que o código já faz
Veja a seção "Segurança" do `zapbot/README.md`.

## Assinatura e administrador

- **Senhas dos clientes:** HMAC-SHA256 com `PASSWORD_PEPPER` (só no servidor) + bcrypt custo 12. Um banco vazado não permite nem testar senhas sem a pimenta. Guarde cópia da pimenta: perdê-la = todos precisam redefinir a senha.
- **Administrador:** existe só nas variáveis de ambiente (nunca no banco nem no cadastro público): e-mail, hash **scrypt** da senha e segredo **TOTP**. O login exige os três, confere sempre os três, limita 5 tentativas/15 min por IP e 30/h no total, e cada código de 6 dígitos só vale uma vez.
- **Sessão do admin:** cookie próprio `__Host-zap_admin`, `SameSite=Strict`, 2 h, audiência diferente da do cliente (token de cliente nunca abre o admin).
- **Sem assinatura = sem acesso:** a API responde 402, o bot não responde nem notifica. Bloquear derruba as sessões do cliente na hora.
- **Limite honesto:** o app é só uma "janela" para o site; quem libera o acesso é o servidor. Mesmo com o APK em mãos, ninguém ativa a própria conta sem a sua liberação.
