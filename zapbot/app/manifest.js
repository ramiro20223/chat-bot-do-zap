export default function manifest() {
  return {
    name: 'ZapBot', short_name: 'ZapBot', description: 'Atendente de WhatsApp com IA para a sua empresa',
    start_url: '/', scope: '/', display: 'standalone', orientation: 'portrait',
    background_color: '#0b1026', theme_color: '#0b1026', lang: 'pt-BR',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
