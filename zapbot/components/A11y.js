'use client';
import { useEffect, useState, useRef } from 'react';

const KEY = 'zap_a11y';
const DEFAULT = { theme: 'auto', size: 1, contrast: false, reduce: false };
const SIZES = [['A', 1], ['A+', 1.15], ['A++', 1.3], ['A+++', 1.5]];

function load() { try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return DEFAULT; } }
function apply(p) {
  const r = document.documentElement;
  if (p.theme === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', p.theme);
  r.style.setProperty('--fs', String(p.size));
  if (p.contrast) r.setAttribute('data-contrast', 'high'); else r.removeAttribute('data-contrast');
  if (p.reduce) r.setAttribute('data-motion', 'reduce'); else r.removeAttribute('data-motion');
}

// Script que roda antes da primeira pintura (evita "piscar" claro/escuro). Mesma lógica de apply().
export const A11Y_BOOT = `try{var p=JSON.parse(localStorage.getItem('${KEY}')||'{}'),r=document.documentElement;if(p.theme==='light'||p.theme==='dark')r.setAttribute('data-theme',p.theme);if(p.size)r.style.setProperty('--fs',String(p.size));if(p.contrast)r.setAttribute('data-contrast','high');if(p.reduce)r.setAttribute('data-motion','reduce')}catch(e){}`;

export default function A11y() {
  const [open, setOpen] = useState(false);
  const [p, setP] = useState(DEFAULT);
  const ref = useRef(null);
  useEffect(() => { setP(load()); }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  function set(patch) {
    const n = { ...p, ...patch }; setP(n); apply(n);
    try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* sem armazenamento: vale só nesta visita */ }
  }
  const seg = (label, on, fn) => <button type="button" aria-pressed={on} onClick={fn}>{label}</button>;

  return (
    <>
      <button className="a11y-fab" aria-label="Opções de acessibilidade" aria-expanded={open} aria-controls="a11y-panel" onClick={() => setOpen(!open)}>♿</button>
      {open && (
        <div id="a11y-panel" className="a11y-panel" role="dialog" aria-label="Acessibilidade" ref={ref}>
          <h2>Acessibilidade</h2>
          <span className="t">Tema</span>
          <div className="seg">{seg('Automático', p.theme === 'auto', () => set({ theme: 'auto' }))}{seg('☀ Claro', p.theme === 'light', () => set({ theme: 'light' }))}{seg('🌙 Escuro', p.theme === 'dark', () => set({ theme: 'dark' }))}</div>
          <span className="t">Tamanho da letra</span>
          <div className="seg">{SIZES.map(([l, v]) => seg(l, p.size === v, () => set({ size: v })))}</div>
          <span className="t">Visual</span>
          <div className="seg">{seg('Alto contraste', p.contrast, () => set({ contrast: !p.contrast }))}{seg('Reduzir animações', p.reduce, () => set({ reduce: !p.reduce }))}</div>
          <button type="button" onClick={() => set(DEFAULT)} style={{ width: '100%' }}>Restaurar padrão</button>
        </div>
      )}
    </>
  );
}
