import './globals.css';

export const viewport = { themeColor: '#0b1026', width: 'device-width', initialScale: 1 };
export const metadata = {
  icons: { apple: '/icons/apple-touch-icon.png' }, title: 'ZapBot — Atendente de WhatsApp', description: 'Atendimento automático no WhatsApp para a sua empresa' };

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
