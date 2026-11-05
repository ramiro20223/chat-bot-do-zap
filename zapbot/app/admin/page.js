'use client';
import { useState } from 'react';
import '../landing.css';

export default function AdminLogin() {
  const [f, setF] = useState({ email: '', password: '', code: '' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault(); setErr(''); setBusy(true);
    const res = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) }).catch(() => null);
    if (res?.ok) { window.location.href = '/admin/painel'; return; }
    setErr((await res?.json().catch(() => ({})))?.error || 'Sem conexão'); setBusy(false);
  }
  return (
    <main className="lp"><div className="lp-center">
      <header className="lp-top"><span className="lp-logo"><i aria-hidden="true" />Administração</span></header>
      <form className="lp-card" onSubmit={submit}>
        <h2>Acesso restrito</h2>
        <label htmlFor="e">E-mail</label><input id="e" type="email" required autoComplete="username" value={f.email} onChange={set('email')} />
        <label htmlFor="p">Senha</label><input id="p" type="password" required autoComplete="current-password" value={f.password} onChange={set('password')} />
        <label htmlFor="c">Código do autenticador (6 dígitos)</label><input id="c" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required autoComplete="one-time-code" value={f.code} onChange={set('code')} />
        {err && <div className="lp-err" role="alert">{err}</div>}
        <p><button className="lp-btn main" style={{ width: '100%' }} disabled={busy}>{busy ? 'Aguarde…' : 'Entrar'}</button></p>
      </form>
    </div></main>
  );
}
