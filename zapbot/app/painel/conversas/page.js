'use client';
import { useEffect, useState, useCallback } from 'react';
import { api } from '@/components/api';

const when = (d) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export default function Conversas() {
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(null);
  const [thread, setThread] = useState([]);
  const [err, setErr] = useState('');

  const load = useCallback(async () => { try { setList(await api('/api/conversas')); } catch (e) { setErr(e.message); } }, []);
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]);

  async function show(c) { setOpen(c); setThread(await api(`/api/conversas/${c.id}`)); }
  async function resume(c) { await api(`/api/conversas/${c.id}`, { method: 'POST' }); setOpen({ ...c, paused: false }); load(); }

  return (
    <>
      <h1>Conversas</h1>
      <p className="muted">Últimas conversas atendidas pelo bot. “Humano” significa que o bot está pausado (você respondeu ou o bot pediu ajuda).</p>
      {err && <div className="alert err" role="alert">{err}</div>}
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="card" style={{ flex: '1 1 280px' }}>
          {list.length === 0 && <p className="muted">Nenhuma conversa ainda.</p>}
          {list.map((c) => (
            <button key={c.id} className={`list-btn ${open?.id === c.id ? 'on' : ''}`} onClick={() => show(c)}>
              <strong>{c.contact_name || `+${c.phone}`}</strong> {c.paused && <span className="pill off">Humano</span>}
              <br /><span className="small muted">{(c.last_body || '').slice(0, 60)} · {when(c.last_message_at)}</span>
            </button>
          ))}
        </div>
        <div className="card" style={{ flex: '2 1 360px' }}>
          {!open ? <p className="muted">Selecione uma conversa.</p> : (<>
            <h2>{open.contact_name || `+${open.phone}`} <span className="muted small">+{open.phone}</span></h2>
            {open.paused && <p><button onClick={() => resume(open)}>Devolver para o bot</button></p>}
            <div className="chat">{thread.map((m, i) => <div key={i} className={`bubble ${m.direction === 'in' ? 'in' : 'out'}`}>{m.body}<div className="small muted">{when(m.created_at)}</div></div>)}</div>
          </>)}
        </div>
      </div>
    </>
  );
}
