'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { api } from '@/components/api';

const LINKS = [
  ['/painel', 'WhatsApp'], ['/painel/configuracao', 'Configuração'], ['/painel/produtos', 'Produtos'], ['/painel/pedidos', 'Pedidos'],
  ['/painel/teste', 'Testar bot'], ['/painel/conversas', 'Conversas'], ['/painel/conta', 'Minha conta'],
];

const LOCK = {
  pending: ['Efetue o pagamento para ter o acesso', 'Sua assinatura ainda não foi ativada.'],
  expired: ['Efetue o pagamento para renovar o acesso', 'Sua assinatura venceu.'],
  blocked: ['Acesso suspenso', 'Fale comigo no WhatsApp para resolver.'],
};

// Tela translúcida com cadeado por cima do painel quando a assinatura não está ativa. Libera sozinha quando o administrador ativar.
function Lock() {
  const [acc, setAcc] = useState(null);
  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/account', { cache: 'no-store' });
      if (r.status === 401) { window.location.href = '/login'; return; }
      const d = await r.json();
      setAcc((prev) => { if (prev && prev.status !== 'active' && d.status === 'active') window.location.reload(); return d; });
    } catch { /* tenta de novo no próximo ciclo */ }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 8000); const on = () => load(); window.addEventListener('zap:locked', on); return () => { clearInterval(t); window.removeEventListener('zap:locked', on); }; }, [load]);
  if (acc?.status === 'active' && acc.daysLeft != null && acc.daysLeft <= (acc.warnDays ?? 5)) {
    const d = acc.daysLeft;
    return (
      <div className="renew" role="status">
        <span>{d <= 1 ? 'Sua assinatura vence hoje ou amanhã.' : `Sua assinatura vence em ${d} dias.`} Renove para o bot não parar.</span>
        {acc.whatsapp && <a href={acc.whatsapp} target="_blank" rel="noopener noreferrer">Renovar no WhatsApp</a>}
      </div>
    );
  }
  if (!acc || acc.status === 'active') return null;
  const [title, sub] = LOCK[acc.status] || LOCK.pending;
  return (
    <div className="lock" role="alertdialog" aria-modal="true" aria-labelledby="lock-t">
      <div className="lock-card">
        <div className="lock-icon" aria-hidden="true">🔒</div>
        <h2 id="lock-t">{title}</h2>
        <p className="muted" style={{ margin: 0 }}>{sub} Assinatura de {acc.price} por mês.</p>
        <div className="id" aria-label={`Seu ID é ${acc.accountCode}`}>{acc.accountCode}</div>
        {acc.whatsapp
          ? <a className="wa" href={acc.whatsapp} target="_blank" rel="noopener noreferrer">Falar no WhatsApp e pagar</a>
          : <p className="alert err">WhatsApp do administrador não configurado.</p>}
        <p className="muted small" style={{ marginBottom: 0 }}>Depois que eu confirmar o pagamento, esta tela some sozinha.</p>
        <p><button onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); window.location.href = '/login'; }}>Sair</button></p>
      </div>
    </div>
  );
}

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
      <Lock />
      <main className="wrap">{children}</main>
    </>
  );
}
