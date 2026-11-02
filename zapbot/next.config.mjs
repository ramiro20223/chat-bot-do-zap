/** @type {import('next').NextConfig} */
export default {
  poweredByHeader: false,
  // Pacotes com código nativo/ESM pesado ficam fora do bundle do Next.
  serverExternalPackages: ['@whiskeysockets/baileys', 'pg', 'pino', 'qrcode', 'bcryptjs'],
};
