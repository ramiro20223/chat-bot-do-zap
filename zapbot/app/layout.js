import './globals.css';

export const metadata = { title: 'ZapBot — Atendente de WhatsApp', description: 'Atendimento automático no WhatsApp para a sua empresa' };

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
