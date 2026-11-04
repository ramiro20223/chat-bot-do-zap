'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { api } from '@/components/api';

const LINKS = [
  ['/painel', 'WhatsApp'], ['/painel/configuracao', 'Configuração'], ['/painel/produtos', 'Produtos'], ['/painel/pedidos', 'Pedidos'],
  ['/painel/teste', 'Testar bot'], ['/painel/conversas', 'Conversas'],
];

export default function PainelLayout({ children }) {
  const path = usePathname();
  async function sairTodos() {
    if (!confirm('Encerrar o login em TODOS os aparelhos (inclusive este)?')) return;
    await api('/api/auth/logout-all', { method: 'POST' }); window.location.href = '/login';
  }
  async function sair() { await api('/api/auth/logout', { method: 'POST' }); window.location.href = '/login'; }
  return (
    <>
      <nav className="nav"><div className="wrap">
        <strong>ZapBot</strong>
        {LINKS.map(([href, label]) => <Link key={href} href={href} className={path === href ? 'on' : ''}>{label}</Link>)}
        <button onClick={sair}>Sair</button>
        <button onClick={sairTodos} title="Encerra o login em todos os aparelhos">Sair de todos</button>
      </div></nav>
      <main className="wrap">{children}</main>
    </>
  );
}
