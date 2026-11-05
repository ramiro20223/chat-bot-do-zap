import './globals.css';
import A11y, { A11Y_BOOT } from '@/components/A11y';

export const viewport = { themeColor: '#0b1026', width: 'device-width', initialScale: 1 };
export const metadata = {
  icons: { apple: '/icons/apple-touch-icon.png' },
  title: 'ZapBot — Atendente de WhatsApp', description: 'Atendimento automático no WhatsApp para a sua empresa',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: A11Y_BOOT }} /></head>
      <body>{children}<A11y /></body>
    </html>
  );
}
