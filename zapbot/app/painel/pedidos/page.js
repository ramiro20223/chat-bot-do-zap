'use client';
import { useEffect, useState, useCallback } from 'react';
import { api } from '@/components/api';

const money = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const when = (d) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const STATUS = {
  awaiting_payment: ['Aguardando pagamento', 'off'], proof_received: ['Comprovante recebido', ''], proof_review: ['Revisar comprovante', 'warn'],
  paid: ['Pago', ''], cancelled: ['Cancelado', 'off'],
};
const PROBLEMS = { valor_diferente: 'valor diferente do pedido', nao_efetivado: 'pagamento agendado/pendente', duplicado: 'comprovante já usado em outro pedido' };

export default function Pedidos() {
  const [list, setList] = useState([]);
  const [msg, setMsg] = useState(null);
  const [filter, setFilter] = useState('pendentes');

  const load = useCallback(async () => { try { setList(await api('/api/pedidos')); } catch (e) { setMsg({ err: e.message }); } }, []);
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]);

  async function act(o, action) {
    let reason = null;
    if (action === 'recusar') { reason = prompt('Motivo (o cliente recebe esta mensagem). Ex.: faltou R$ 5, enviar novo comprovante'); if (reason === null) return; }
    if (action === 'confirmar' && !confirm(`Você conferiu no app do banco que ${money(o.total_cents)} entrou?`)) return;
    if (action === 'cancelar' && !confirm(`Cancelar o pedido #${o.num}?`)) return;
    try {
      const r = await api('/api/pedidos', { method: 'POST', body: { num: o.num, action, reason } });
      setMsg({ ok: r.message }); load();
    } catch (e) { setMsg({ err: e.message }); }
  }

  const pending = ['awaiting_payment', 'proof_received', 'proof_review'];
  const shown = list.filter((o) => filter === 'todos' || (filter === 'pendentes' ? pending.includes(o.status) : o.status === filter));

  return (
    <>
      <h1>Pedidos</h1>
      <p className="muted">Pedidos fechados pelo bot. <strong>Confirme o pagamento só depois de ver o dinheiro no app do banco</strong>: o bot confere o comprovante, mas um print pode ser falso.</p>
      {msg?.ok && <div className="alert ok" role="status">{msg.ok}</div>}
      {msg?.err && <div className="alert err" role="alert">{msg.err}</div>}
      <p>
        {[['pendentes', 'Pendentes'], ['paid', 'Pagos'], ['cancelled', 'Cancelados'], ['todos', 'Todos']].map(([k, l]) => (
          <button key={k} className={`list-btn ${filter === k ? 'on' : ''}`} style={{ display: 'inline-block', width: 'auto', marginRight: 6 }} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </p>
      {shown.length === 0 && <div className="card muted">Nenhum pedido aqui ainda.</div>}
      {shown.map((o) => {
        const [label, cls] = STATUS[o.status] || [o.status, 'off'];
        const lines = typeof o.lines === 'string' ? JSON.parse(o.lines) : o.lines;
        return (
          <div className="card" key={o.id}>
            <h2>#{o.num} · {o.customer || `+${o.phone}`} <span className={`pill ${cls === 'warn' ? '' : cls}`} style={cls === 'warn' ? { background: 'var(--warn-bg)', color: 'var(--warn)' } : undefined}>{label}</span></h2>
            <p className="small muted">+{o.phone} · {when(o.created_at)}</p>
            <table><tbody>
              {lines.map((l, i) => <tr key={i}><td>{l.quantity}x {l.name}{l.note && <span className="muted small"> ({l.note})</span>}</td><td style={{ textAlign: 'right' }}>{money(l.subtotalCents)}</td></tr>)}
              {o.discount_pct > 0 && <tr><td className="muted">Desconto {o.discount_pct}%</td><td style={{ textAlign: 'right' }} className="muted">− {money(o.subtotal_cents - o.total_cents)}</td></tr>}
              <tr><td><strong>Total</strong></td><td style={{ textAlign: 'right' }}><strong>{money(o.total_cents)}</strong></td></tr>
            </tbody></table>
            <p className="small">{o.delivery === 'entrega' ? `Entrega: ${o.address || 'sem endereço'}` : 'Retirada no local'}{o.details && <><br />Detalhes: {o.details}</>}</p>
            {o.proof_verdict && (
              <p className="small">Comprovante: {o.proof_verdict === 'ok' ? '✅ valor confere' : `⚠️ ${(o.proof_problems || []).map((p) => PROBLEMS[p] || p).join(', ') || 'revisar'}`}</p>
            )}
            {pending.includes(o.status) && (
              <p>
                <button className="primary" onClick={() => act(o, 'confirmar')}>Confirmar pagamento</button>{' '}
                <button onClick={() => act(o, 'recusar')}>Recusar comprovante</button>{' '}
                <button className="danger" onClick={() => act(o, 'cancelar')}>Cancelar pedido</button>
              </p>
            )}
          </div>
        );
      })}
    </>
  );
}
