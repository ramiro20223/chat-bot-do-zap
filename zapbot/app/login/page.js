'use client';
import { useState } from 'react';
import { api } from '@/components/api';

export default function Login() {
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ email: '', password: '', businessName: '', inviteCode: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      await api(mode === 'login' ? '/api/auth/login' : '/api/auth/register', { method: 'POST', body: f });
      window.location.href = '/painel';
    } catch (x) { setErr(x.message); setBusy(false); }
  }

  return (
    <div className="login">
      <h1>ZapBot</h1>
      <p className="muted">Atendimento automático no WhatsApp para a sua empresa.</p>
      <form className="card" onSubmit={submit}>
        <h2>{mode === 'login' ? 'Entrar' : 'Criar conta'}</h2>
        {mode === 'register' && (<><label htmlFor="bn">Nome da empresa</label><input id="bn" required value={f.businessName} onChange={set('businessName')} /></>)}
        {mode === 'register' && (<><label htmlFor="ic">Código de convite <span className="muted small">(se o administrador te passou um)</span></label><input id="ic" autoComplete="off" value={f.inviteCode} onChange={set('inviteCode')} /></>)}
        <label htmlFor="em">E-mail</label><input id="em" type="email" required autoComplete="email" value={f.email} onChange={set('email')} />
        <label htmlFor="pw">Senha {mode === 'register' && <span className="muted small">(mínimo 10 caracteres)</span>}</label>
        <input id="pw" type="password" required minLength={mode === 'register' ? 10 : 1} maxLength={72} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={f.password} onChange={set('password')} />
        {err && <div className="alert err" role="alert">{err}</div>}
        <p><button className="primary" disabled={busy}>{busy ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar conta'}</button></p>
        <button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setErr(''); }}>
          {mode === 'login' ? 'Ainda não tenho conta' : 'Já tenho conta'}
        </button>
      </form>
    </div>
  );
}
