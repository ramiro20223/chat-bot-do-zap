'use client';
import { useState, useRef, useEffect } from 'react';
import { api } from '@/components/api';

const toBase64 = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1]);
  r.onerror = reject;
  r.readAsDataURL(file);
});

export default function Teste() {
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const end = useRef(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs, busy]);

  async function send(e) {
    e.preventDefault();
    const t = text.trim(); if ((!t && !file) || busy) return;
    if (file && file.size > 5 * 1024 * 1024) { setErr('A imagem passa de 5 MB.'); return; }
    setText(''); setErr(''); setBusy(true);
    setMsgs((m) => [...m, { d: 'in', t: [t, file && `📎 ${file.name}`].filter(Boolean).join('\n') }]);
    try {
      const image = file ? { mimeType: file.type, data: await toBase64(file) } : undefined;
      setFile(null);
      const r = await api('/api/teste', { method: 'POST', body: { text: t, image } });
      setMsgs((m) => [...m, ...r.messages.map((x) => ({ d: 'out', t: x })), ...r.ownerNotices.map((x) => ({ d: 'owner', t: x }))]);
    } catch (x) { setErr(x.message); }
    setBusy(false);
  }
  async function reset() { await api('/api/teste', { method: 'POST', body: { reset: true } }); setMsgs([]); setErr(''); setFile(null); }

  return (
    <>
      <h1>Testar o bot</h1>
      <p className="muted">Converse como se fosse um cliente. Usa a mesma IA, configuração, catálogo e pedidos do WhatsApp, sem enviar nada a ninguém. As mensagens em amarelo são as que o <strong>dono</strong> receberia. Para testar o comprovante, gere um Pix e anexe uma imagem de comprovante.</p>
      <div className="card">
        <div className="chat" aria-live="polite">
          {msgs.length === 0 && <p className="muted">Experimente: “Que horas vocês fecham?”, “Preciso de algo para dor de cabeça” ou “Quero comprar 2 unidades”.</p>}
          {msgs.map((m, i) => (
            <div key={i} className={`bubble ${m.d === 'owner' ? 'out' : m.d}`} style={m.d === 'owner' ? { background: 'var(--warn-bg)', color: 'var(--warn)', alignSelf: 'stretch', maxWidth: '100%' } : undefined}>
              {m.d === 'owner' && <div className="small"><strong>📲 O dono receberia:</strong></div>}{m.t}
            </div>
          ))}
          {busy && <div className="bubble out muted">digitando…</div>}
          <div ref={end} />
        </div>
        {err && <div className="alert err" role="alert">{err}</div>}
        {file && <p className="small">📎 {file.name} <button type="button" onClick={() => setFile(null)}>remover</button></p>}
        <form onSubmit={send} className="row" style={{ marginTop: 12, flexWrap: 'nowrap' }}>
          <label className="check" style={{ flex: '0 0 auto', margin: 0, cursor: 'pointer' }} title="Anexar imagem (ex.: comprovante)">
            <span role="img" aria-label="Anexar imagem" style={{ fontSize: 22 }}>📎</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { setFile(e.target.files?.[0] || null); e.target.value = ''; }} />
          </label>
          <input aria-label="Mensagem" value={text} onChange={(e) => setText(e.target.value)} placeholder="Digite uma mensagem" maxLength={1000} />
          <button className="primary" style={{ flex: '0 0 auto' }} disabled={busy || (!text.trim() && !file)}>Enviar</button>
          <button type="button" style={{ flex: '0 0 auto' }} onClick={reset}>Limpar</button>
        </form>
      </div>
    </>
  );
}
