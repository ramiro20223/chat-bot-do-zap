# App (APK) do ZapBot

Casca fina em Expo que abre o seu site. Nada de segredo ou regra de negócio fica no APK; a assinatura é conferida no servidor.

## Gerar o APK (no seu computador)
```bash
cd apk
npm install
npx expo install --fix                  # alinha as versões com o Expo atual
npm install -g eas-cli
eas login                               # sua conta em expo.dev (grátis)
eas init                                # cria o projeto na sua conta
# coloque o endereço do seu site (https) no build:
eas env:create --name EXPO_PUBLIC_APP_URL --value https://SEU-SITE.com --environment preview --visibility plaintext
eas build -p android --profile preview  # ao terminar, mostra o link para baixar o .apk
```
Antes disso o site precisa estar no ar com HTTPS (veja o README principal).
O arquivo de assinatura (keystore) fica guardado no Expo; nunca coloque no Git.
Para a Play Store use `--profile production` (gera .aab).
