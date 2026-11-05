'use client';
import { useEffect, useState, useCallback } from 'react';
import '../landing.css';

const TEXT = {
  pending: ['Conta criada!', 'Falta ativar a assinatura. Toque no botão: seu ID já vai junto na mensagem para o meu WhatsApp. A gente conversa, você paga e eu libero.'],
  expired: ['Sua assinatura venceu', 'Para renovar, chame no WhatsApp pelo botão abaixo. Assim que o pagamento for confirmado eu libero de novo.'],
  blocked: ['Acesso suspenso', 'Esta conta está suspensa. Fale comigo pelo WhatsApp para resolver.'],
};

export default function Assinatura() {
  const [acc, setAcc] = useState(null);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/account', { cache: 'no-store' });
      if (res.status === 401) { window.location.href = '/login'; return; }
      const data = await res.json();
      if (data.status === 'active') { window.location.href = '/painel'; return; }
      setAcc(data); setErr('');
    } catch { setErr('Sem conexão. Tentando de novo…'); }
  }, []);

  // Confere sozinho a cada 8 s: quando eu liberar, a tela abre o painel sem você fazer nada.
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]);

  async function copy() {
    try { await navigator.clipboard.writeText(acc.accountCode); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* o ID também é selecionável com um toque */ }
  }
  async function logout() { await fetch('/api/auth/logout', { method: 'POST' }); window.location.href = '/login'; }

  const [title, body] = TEXT[acc?.status] || TEXT.pending;
  return (
    <main className="lp">
      <div className="lp-center">
        <header className="lp-top"><span className="lp-logo"><i aria-hidden="true" />ZapBot</span><button className="lp-link" style={{ background: 'none', border: 0, cursor: 'pointer', font: 'inherit' }} onClick={logout}>Sair</button></header>
        {err && <div className="lp-err" role="alert">{err}</div>}
        {!acc && !err && <p className="lp-dim">Carregando…</p>}
        {acc && (
          <div className="lp-card">
            <span className={`lp-chip ${acc.status}`}>{acc.status === 'pending' ? 'Aguardando ativação' : acc.status === 'expired' ? 'Vencida' : 'Suspensa'}</span>
            <h2 style={{ marginTop: 14 }}>{title}</h2>
            <p className="lp-dim">{body}</p>
            <div className="lp-dim" style={{ fontSize: '.85rem', marginTop: 18 }}>Seu ID</div>
            <div className="lp-id" aria-label={`Seu ID é ${acc.accountCode}`}>{acc.accountCode}</div>
            <button className="lp-btn ghost" style={{ width: '100%', marginBottom: 12 }} onClick={copy}>{copied ? 'ID copiado ✓' : 'Copiar ID'}</button>
            {acc.whatsapp
              ? <a className="lp-btn wa" style={{ width: '100%' }} href={acc.whatsapp} target="_blank" rel="noopener noreferrer">Falar no WhatsApp e ativar</a>
              : <div className="lp-err">O WhatsApp do administrador ainda não foi configurado. Avise quem te passou o link.</div>}
            <p className="lp-dim" style={{ fontSize: '.85rem', marginTop: 16 }}>Assinatura de {acc.price} por mês. Esta tela abre o painel sozinha assim que a liberação for feita.</p>
          </div>
        )}
      </div>
    </main>
  );
}
