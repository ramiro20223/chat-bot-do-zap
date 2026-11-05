'use client';
import { useState } from 'react';
import { api } from '@/components/api';

export default function Conta() {
  const [f, setF] = useState({ current: '', next: '' });
  const [msg, setMsg] = useState(null); const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault(); setMsg(null); setBusy(true);
    try { await api('/api/account/password', { method: 'POST', body: f }); setMsg({ ok: true, t: 'Senha alterada. Os outros aparelhos foram desconectados.' }); setF({ current: '', next: '' }); }
    catch (x) { setMsg({ ok: false, t: x.message }); }
    setBusy(false);
  }
  return (
    <form className="card" onSubmit={submit} style={{ maxWidth: 440 }}>
      <h2>Trocar senha</h2>
      <p className="muted small">Se o administrador te passou uma senha provisória, troque por uma sua aqui.</p>
      <label htmlFor="c">Senha atual</label><input id="c" type="password" required autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} />
      <label htmlFor="n">Nova senha <span className="muted small">(mínimo 10 caracteres)</span></label><input id="n" type="password" required minLength={10} maxLength={72} autoComplete="new-password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} />
      {msg && <div className={`alert ${msg.ok ? 'ok' : 'err'}`} role="status">{msg.t}</div>}
      <p><button className="primary" disabled={busy}>{busy ? 'Aguarde…' : 'Trocar senha'}</button></p>
    </form>
  );
}
