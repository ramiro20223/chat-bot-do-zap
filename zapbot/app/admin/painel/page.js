'use client';
import { useEffect, useState, useCallback } from 'react';
import '../../landing.css';

const LABEL = { pending: 'Aguardando', active: 'Ativa', expired: 'Vencida', blocked: 'Bloqueada' };
const fmt = (d) => (d ? new Date(d).toLocaleDateString('pt-BR') : '—');

export default function AdminPainel() {
  const [users, setUsers] = useState([]); const [q, setQ] = useState(''); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(''); const [temp, setTemp] = useState(null); const [copied, setCopied] = useState(false);

  const load = useCallback(async (term) => {
    const res = await fetch(`/api/admin/users?q=${encodeURIComponent(term ?? '')}`, { cache: 'no-store' });
    if (res.status === 401) { window.location.href = '/admin'; return; }
    setUsers((await res.json()).users || []);
  }, []);
  useEffect(() => { load(''); }, [load]);

  async function act(u, action, days) {
    const texts = { activate: `Liberar ${u.email} por ${days || 30} dias?`, extend: `Somar ${days || 30} dias para ${u.email}?`, revoke: `Remover a assinatura de ${u.email}?`, block: `BLOQUEAR ${u.email}?`, unblock: `Desbloquear ${u.email}?`, reset_password: `Gerar uma NOVA senha provisória para ${u.email}? A senha atual deixa de funcionar e ele é desconectado.` };
    if (!window.confirm(texts[action])) return;
    setBusy(u.id); setMsg('');
    const res = await fetch('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: u.id, action, days }) });
    const data = await res.json().catch(() => ({}));
    setBusy('');
    if (!res.ok) { setMsg(data.error || 'Erro'); return; }
    if (data.tempPassword) { setTemp({ email: u.email, pw: data.tempPassword }); setCopied(false); setMsg('Pronto ✓'); return; }
    setUsers((list) => list.map((x) => (x.id === u.id ? data.user : x))); setMsg('Pronto ✓');
  }
  async function logout() { await fetch('/api/admin/logout', { method: 'POST' }); window.location.href = '/admin'; }

  return (
    <main className="lp"><div className="lp-wrap" style={{ paddingBottom: 60 }}>
      <header className="lp-top"><span className="lp-logo"><i aria-hidden="true" />Clientes</span><button className="lp-link" style={{ background: 'none', border: 0, cursor: 'pointer', font: 'inherit' }} onClick={logout}>Sair</button></header>
      <form onSubmit={(e) => { e.preventDefault(); load(q); }} style={{ display: 'flex', gap: 8 }}>
        <input aria-label="Buscar" placeholder="Buscar por ID (ZB-…), empresa ou e-mail" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="lp-btn main" style={{ minHeight: 50 }}>Buscar</button>
      </form>
      {temp && (
        <div className="lp-card" role="alertdialog" aria-label="Senha provisória" style={{ borderColor: '#ffc53d' }}>
          <b>Senha provisória de {temp.email}</b>
          <div className="lp-id" style={{ fontSize: '1.6rem', letterSpacing: '.04em' }}>{temp.pw}</div>
          <p className="lp-dim" style={{ margin: '0 0 12px' }}>Aparece só agora: copie e mande para o cliente. Ele troca em Painel → Minha conta.</p>
          <button className="lp-btn main" onClick={async () => { try { await navigator.clipboard.writeText(temp.pw); setCopied(true); } catch {} }}>{copied ? 'Copiada ✓' : 'Copiar senha'}</button>{' '}
          <button className="lp-btn ghost" onClick={() => setTemp(null)}>Fechar</button>
        </div>
      )}
      {msg && <div className={msg.startsWith('Pronto') ? 'lp-ok' : 'lp-err'} role="status">{msg}</div>}
      <div className="lp-card lp-scroll" style={{ padding: 12 }}>
        <table className="lp-table">
          <thead><tr><th>ID</th><th>Empresa</th><th>E-mail</th><th>Situação</th><th>Vence</th><th>Ações</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td><b>{u.accountCode}</b></td><td>{u.company || '—'}</td><td>{u.email}</td>
                <td><span className={`lp-chip ${u.status}`}>{LABEL[u.status]}</span></td><td>{fmt(u.until)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {!u.blocked && <button className="lp-mini go" disabled={busy === u.id} onClick={() => act(u, u.status === 'active' ? 'extend' : 'activate', 30)}>{u.status === 'active' ? '+30 dias' : 'Liberar 30 dias'}</button>}
                  {!u.blocked && u.until && <button className="lp-mini" disabled={busy === u.id} onClick={() => act(u, 'revoke')}>Remover</button>}
                  <button className="lp-mini" disabled={busy === u.id} onClick={() => act(u, 'reset_password')}>Nova senha</button>
                  <button className={`lp-mini ${u.blocked ? '' : 'bad'}`} disabled={busy === u.id} onClick={() => act(u, u.blocked ? 'unblock' : 'block')}>{u.blocked ? 'Desbloquear' : 'Bloquear'}</button>
                </td>
              </tr>
            ))}
            {!users.length && <tr><td colSpan={6} className="lp-dim">Nenhum cliente encontrado.</td></tr>}
          </tbody>
        </table>
      </div>
    </div></main>
  );
}
