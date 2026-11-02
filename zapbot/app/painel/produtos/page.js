'use client';
import { useEffect, useState, useCallback } from 'react';
import { api } from '@/components/api';
import { labelsFor } from '@/lib/templates.js';

const EMPTY = { name: '', category: '', description: '', indications: '', characteristics: '', price: '', in_stock: true, active: true };
const money = (v) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

export default function Produtos() {
  const [items, setItems] = useState([]);
  const [labels, setLabels] = useState(labelsFor('outro'));
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState('');
  const [bulk, setBulk] = useState('');
  const [showBulk, setShowBulk] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    try { setItems(await api('/api/products')); } catch (e) { setMsg({ err: e.message }); }
  }, []);
  useEffect(() => { load(); api('/api/business').then((b) => setLabels(labelsFor(b.type))).catch(() => {}); }, [load]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function save(e) {
    e.preventDefault(); setMsg(null);
    try {
      await api(editing ? `/api/products/${editing}` : '/api/products', { method: editing ? 'PUT' : 'POST', body: form });
      setForm(EMPTY); setEditing(null); setMsg({ ok: 'Salvo.' }); load();
    } catch (x) { setMsg({ err: x.message }); }
  }
  function edit(p) {
    setEditing(p.id);
    setForm({ ...EMPTY, ...Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v ?? ''])), price: p.price == null ? '' : String(p.price).replace('.', ',') });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function patch(p, change) { await api(`/api/products/${p.id}`, { method: 'PUT', body: { ...p, ...change } }); load(); }
  async function del(p) { if (confirm(`Excluir "${p.name}"?`)) { await api(`/api/products/${p.id}`, { method: 'DELETE' }); load(); } }
  async function importBulk() {
    setMsg(null);
    try {
      const r = await api('/api/products/import', { method: 'POST', body: { text: bulk } });
      setMsg({ ok: `${r.imported} importado(s).${r.errors.length ? ` Ignoradas: ${r.errors.join(' | ')}` : ''}` });
      setBulk(''); setShowBulk(false); load();
    } catch (x) { setMsg({ err: x.message }); }
  }

  const shown = items.filter((p) => !filter || `${p.name} ${p.category || ''} ${p.indications || ''}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <>
      <h1>Catálogo de {labels.noun}s</h1>
      <p className="muted">É daqui que o bot busca quando o cliente pergunta o que vocês têm, para que serve e quanto custa.</p>
      {msg?.ok && <div className="alert ok" role="status">{msg.ok}</div>}
      {msg?.err && <div className="alert err" role="alert">{msg.err}</div>}

      <form className="card" onSubmit={save}>
        <h2>{editing ? 'Editar' : 'Adicionar'} {labels.noun}</h2>
        <div className="row">
          <div><label htmlFor="p-name">{labels.name} *</label><input id="p-name" required value={form.name} onChange={set('name')} /></div>
          <div><label htmlFor="p-cat">{labels.category}</label><input id="p-cat" value={form.category} onChange={set('category')} /></div>
          <div><label htmlFor="p-price">Preço (R$)</label><input id="p-price" inputMode="decimal" placeholder="12,90" value={form.price} onChange={set('price')} /></div>
        </div>
        <label htmlFor="p-desc">{labels.description}</label><textarea id="p-desc" value={form.description} onChange={set('description')} />
        <label htmlFor="p-ind">{labels.indications}</label><textarea id="p-ind" value={form.indications} onChange={set('indications')} />
        <label htmlFor="p-car">{labels.characteristics}</label><textarea id="p-car" value={form.characteristics} onChange={set('characteristics')} />
        <p>
          <label className="check"><input type="checkbox" checked={form.in_stock} onChange={(e) => setForm({ ...form, in_stock: e.target.checked })} /> Em estoque</label>
          <label className="check"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Ativo (aparece para o bot)</label>
        </p>
        <button className="primary">{editing ? 'Salvar alterações' : 'Adicionar'}</button>{' '}
        {editing && <button type="button" onClick={() => { setEditing(null); setForm(EMPTY); }}>Cancelar</button>}
      </form>

      <div className="card">
        <div className="row" style={{ alignItems: 'end' }}>
          <div><label htmlFor="flt">Buscar na lista ({items.length} cadastrados)</label><input id="flt" value={filter} onChange={(e) => setFilter(e.target.value)} /></div>
          <div style={{ flex: '0 0 auto' }}><button onClick={() => setShowBulk(!showBulk)}>Importar em massa</button></div>
        </div>
        {showBulk && (
          <div>
            <label htmlFor="bulk">Cole uma linha por produto, separando os campos com ponto e vírgula</label>
            <p className="small muted">nome;categoria;preço;descrição;indicações;características — dá para copiar direto de uma planilha salvando como CSV com “;”.</p>
            <textarea id="bulk" style={{ minHeight: 140 }} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder="Dipirona 500mg;Analgésicos;8,90;Comprimido;Dor de cabeça e febre;10 comprimidos" />
            <button className="primary" onClick={importBulk} disabled={!bulk.trim()}>Importar</button>
          </div>
        )}
        {shown.length === 0 ? <p className="muted">Nenhum item {filter ? 'encontrado' : 'cadastrado ainda'}.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th>Nome</th><th>Preço</th><th>Estoque</th><th>Ativo</th><th></th></tr></thead>
              <tbody>{shown.map((p) => (
                <tr key={p.id} style={{ opacity: p.active ? 1 : 0.5 }}>
                  <td><strong>{p.name}</strong><br /><span className="small muted">{[p.category, p.indications].filter(Boolean).join(' · ')}</span></td>
                  <td>{money(p.price)}</td>
                  <td><input type="checkbox" aria-label={`${p.name} em estoque`} checked={p.in_stock} onChange={(e) => patch(p, { in_stock: e.target.checked })} /></td>
                  <td><input type="checkbox" aria-label={`${p.name} ativo`} checked={p.active} onChange={(e) => patch(p, { active: e.target.checked })} /></td>
                  <td style={{ whiteSpace: 'nowrap' }}><button onClick={() => edit(p)}>Editar</button> <button className="danger" onClick={() => del(p)}>Excluir</button></td>
                </tr>))}</tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
