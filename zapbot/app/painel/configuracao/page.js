'use client';
import { useEffect, useState } from 'react';
import { api } from '@/components/api';
import { BUSINESS_TYPES, questionsFor } from '@/lib/templates.js';
import { DAYS, DEFAULT_HOURS } from '@/lib/hours.js';

function HoursEditor({ value, onChange }) {
  const hours = value || DEFAULT_HOURS;
  const patch = (k, p) => onChange({ ...hours, [k]: { ...hours[k], ...p } });
  return (
    <div className="hours">
      {DAYS.map(({ key, label }) => {
        const h = hours[key] || DEFAULT_HOURS[key];
        return (
          <div key={key} style={{ display: 'contents' }}>
            <span>{label}</span>
            <div className="t">
              <label className="check" style={{ margin: 0 }}><input type="checkbox" checked={!!h.closed} onChange={(e) => patch(key, { closed: e.target.checked })} /> Fechado</label>
              {!h.closed && (<>
                <input type="time" aria-label={`${label} abre`} value={h.open || '09:00'} onChange={(e) => patch(key, { open: e.target.value })} />
                <span>às</span>
                <input type="time" aria-label={`${label} fecha`} value={h.close || '18:00'} onChange={(e) => patch(key, { close: e.target.value })} />
              </>)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Field({ q, value, onChange }) {
  const id = `q-${q.key}`;
  const label = <label htmlFor={id}>{q.label}{q.required && <span className="muted"> *</span>}</label>;
  if (q.type === 'hours') return <div>{label}<HoursEditor value={value} onChange={onChange} /></div>;
  if (q.type === 'textarea') return <div>{label}<textarea id={id} value={value || ''} onChange={(e) => onChange(e.target.value)} /></div>;
  if (q.type === 'select') return (
    <div>{label}<select id={id} value={value || ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">Selecione…</option>{q.options.map((o) => <option key={o}>{o}</option>)}
    </select></div>
  );
  if (q.type === 'multi') {
    const cur = Array.isArray(value) ? value : [];
    return (
      <div role="group" aria-label={q.label}>{label}
        {q.options.map((o) => (
          <label key={o} className="check"><input type="checkbox" checked={cur.includes(o)} onChange={(e) => onChange(e.target.checked ? [...cur, o] : cur.filter((x) => x !== o))} /> {o}</label>
        ))}
      </div>
    );
  }
  if (q.type === 'boolean') return <div><label className="check" style={{ marginTop: 14 }}><input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} /> {q.label}</label></div>;
  return <div>{label}<input id={id} value={value || ''} onChange={(e) => onChange(e.target.value)} /></div>;
}

export default function Configuracao() {
  const [name, setName] = useState('');
  const [type, setType] = useState('outro');
  const [answers, setAnswers] = useState({});
  const [msg, setMsg] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api('/api/business').then((b) => { setName(b.name); setType(b.type); setAnswers(b.answers || {}); setLoaded(true); })
      .catch((e) => setMsg({ err: e.message }));
  }, []);

  const questions = questionsFor(type);
  const missing = questions.filter((q) => q.required && q.type !== 'boolean' && (answers[q.key] === undefined || answers[q.key] === '' || (Array.isArray(answers[q.key]) && !answers[q.key].length)));

  async function save(e) {
    e.preventDefault(); setMsg(null);
    try { await api('/api/business', { method: 'PUT', body: { name, type, answers } }); setMsg({ ok: 'Configuração salva. O bot já usa as novas informações.' }); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    catch (x) { setMsg({ err: x.message }); }
  }

  if (!loaded) return <p className="muted">{msg?.err || 'Carregando…'}</p>;
  return (
    <form onSubmit={save}>
      <h1>Configuração da empresa</h1>
      <p className="muted">O bot só responde com base no que você informar aqui e nos produtos cadastrados. Quanto mais completo, melhor o atendimento.</p>
      {msg?.ok && <div className="alert ok" role="status">{msg.ok}</div>}
      {msg?.err && <div className="alert err" role="alert">{msg.err}</div>}
      {missing.length > 0 && <div className="alert">Faltam {missing.length} resposta(s) obrigatória(s) (marcadas com *).</div>}

      <div className="card">
        <div className="row">
          <div><label htmlFor="nm">Nome da empresa</label><input id="nm" required value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><label htmlFor="tp">Tipo de negócio</label>
            <select id="tp" value={type} onChange={(e) => setType(e.target.value)}>{BUSINESS_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select>
          </div>
        </div>
        <p className="small muted">Ao trocar o tipo, as perguntas abaixo mudam. As respostas em comum são mantidas.</p>
      </div>

      <div className="card">
        {questions.map((q) => <Field key={q.key} q={q} value={answers[q.key]} onChange={(v) => setAnswers((a) => ({ ...a, [q.key]: v }))} />)}
      </div>
      <button className="primary">Salvar configuração</button>
    </form>
  );
}
