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
