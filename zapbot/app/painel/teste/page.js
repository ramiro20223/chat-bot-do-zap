'use client';
import { useState, useRef, useEffect } from 'react';
import { api } from '@/components/api';

export default function Teste() {
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const end = useRef(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs, busy]);

  async function send(e) {
    e.preventDefault();
    const t = text.trim(); if (!t || busy) return;
    setText(''); setErr(''); setBusy(true); setMsgs((m) => [...m, { d: 'in', t }]);
    try { const r = await api('/api/teste', { method: 'POST', body: { text: t } }); setMsgs((m) => [...m, { d: 'out', t: r.reply }]); }
    catch (x) { setErr(x.message); }
    setBusy(false);
  }
  async function reset() { await api('/api/teste', { method: 'POST', body: { reset: true } }); setMsgs([]); setErr(''); }

  return (
    <>
      <h1>Testar o bot</h1>
      <p className="muted">Converse como se fosse um cliente. Usa a mesma IA, configuração e catálogo do WhatsApp, sem enviar nada a ninguém.</p>
      <div className="card">
        <div className="chat" aria-live="polite">
          {msgs.length === 0 && <p className="muted">Experimente: “Que horas vocês fecham?” ou “Preciso de algo para dor de cabeça”.</p>}
          {msgs.map((m, i) => <div key={i} className={`bubble ${m.d}`}>{m.t}</div>)}
          {busy && <div className="bubble out muted">digitando…</div>}
          <div ref={end} />
        </div>
        {err && <div className="alert err" role="alert">{err}</div>}
        <form onSubmit={send} className="row" style={{ marginTop: 12, flexWrap: 'nowrap' }}>
          <input aria-label="Mensagem" value={text} onChange={(e) => setText(e.target.value)} placeholder="Digite uma mensagem" maxLength={1000} />
          <button className="primary" style={{ flex: '0 0 auto' }} disabled={busy || !text.trim()}>Enviar</button>
          <button type="button" style={{ flex: '0 0 auto' }} onClick={reset}>Limpar</button>
        </form>
      </div>
    </>
  );
}
