'use client';
import { useState, useEffect } from 'react';
import '../landing.css';
import { api } from '@/components/api';

export default function Login() {
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ email: '', password: '', businessName: '', inviteCode: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (new URLSearchParams(window.location.search).get('modo') === 'cadastro') setMode('register'); }, []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      await api(mode === 'login' ? '/api/auth/login' : '/api/auth/register', { method: 'POST', body: f });
      // Conta nova vê o ID para ativar; quem já tem conta entra no painel (se a assinatura estiver inativa, aparece o cadeado).
      window.location.href = mode === 'register' ? '/assinatura' : '/painel';
    } catch (x) { setErr(x.message); setBusy(false); }
  }

  return (
    <main className="lp">
      <div className="lp-center">
        <header className="lp-top"><a className="lp-logo" href="/"><i aria-hidden="true" />ZapBot</a></header>
        <form className="lp-card" onSubmit={submit}>
          <h2>{mode === 'login' ? 'Entrar' : 'Criar conta'}</h2>
          <p className="lp-dim" style={{ margin: 0 }}>{mode === 'login' ? 'Bom te ver de novo.' : 'Ao criar, você recebe o seu ID para ativar a assinatura.'}</p>
          {mode === 'register' && (<><label htmlFor="bn">Nome da empresa <span className="lp-dim">(opcional)</span></label><input id="bn" value={f.businessName} onChange={set('businessName')} /></>)}
          <label htmlFor="em">E-mail</label><input id="em" type="email" required autoComplete="email" value={f.email} onChange={set('email')} />
          <label htmlFor="pw">Senha {mode === 'register' && <span className="lp-dim">(mínimo 10 caracteres)</span>}</label>
          <input id="pw" type="password" required minLength={mode === 'register' ? 10 : 1} maxLength={72} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={f.password} onChange={set('password')} />
          {mode === 'register' && (<><label htmlFor="ic">Código de convite <span className="lp-dim">(só se você recebeu um)</span></label><input id="ic" autoComplete="off" value={f.inviteCode} onChange={set('inviteCode')} /></>)}
          {err && <div className="lp-err" role="alert">{err}</div>}
          <p><button className="lp-btn main" style={{ width: '100%' }} disabled={busy}>{busy ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar conta'}</button></p>
          <button type="button" className="lp-btn ghost" style={{ width: '100%' }} onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setErr(''); }}>
            {mode === 'login' ? 'Ainda não tenho conta' : 'Já tenho conta'}
          </button>
        </form>
      </div>
    </main>
  );
}
