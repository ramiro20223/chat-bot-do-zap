const dev = process.env.NODE_ENV !== 'production';

// Política de conteúdo: a página só carrega e fala com o próprio site. Bloqueia incorporação em outros sites (clickjacking),
// plugins e envio de dados a domínios externos caso alguém consiga injetar código.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`, // 'unsafe-inline' é exigido pelos scripts do Next; sem nonce
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${dev ? ' ws: wss:' : ''}`,
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  ...(dev ? [] : ['upgrade-insecure-requests']),
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
];

/** @type {import('next').NextConfig} */
export default {
  poweredByHeader: false,
  productionBrowserSourceMaps: false, // não publica o código-fonte original junto com o site
  // Pacotes com código nativo/ESM pesado ficam fora do bundle do Next.
  serverExternalPackages: ['@whiskeysockets/baileys', 'pg', 'pino', 'qrcode', 'bcryptjs'],
  async headers() {
    return [
      { source: '/(.*)', headers: securityHeaders },
      { source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }] },
    ];
  },
};
