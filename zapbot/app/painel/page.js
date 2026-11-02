'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '@/components/api';

export default function Conexao() {
  const [wa, setWa] = useState({ status: 'idle' });
  const [me, setMe] = useState(null);
  const [err, setErr] = useState('');

  const refresh = useCallback(async () => { try { setWa(await api('/api/whatsapp')); } catch (e) { setErr(e.message); } }, []);
  const loadMe = useCallback(async () => { try { setMe(await api('/api/me')); } catch (e) { setErr(e.message); } }, []);

  useEffect(() => { loadMe(); refresh(); }, [loadMe, refresh]);
  // Atualiza o QR/estado enquanto não estiver ocioso.
  useEffect(() => {
    if (wa.status === 'idle') return undefined;
    const t = setInterval(refresh, wa.status === 'connected' ? 10000 : 2000);
    return () => clearInterval(t);
  }, [wa.status, refresh]);

  const act = (action) => async () => { setErr(''); try { setWa(await api('/api/whatsapp', { method: 'POST', body: { action } })); } catch (e) { setErr(e.message); } };
  async function toggleBot(on) { await api('/api/business', { method: 'PUT', body: { bot_enabled: on } }); loadMe(); }

  return (
    <>
      <h1>Conexão com o WhatsApp</h1>
      <p className="muted">{me ? me.name : ''}</p>
      {err && <div className="alert err" role="alert">{err}</div>}
      {me?.setupMissing?.length > 0 && (
        <div className="alert">Faltam {me.setupMissing.length} informação(ões) obrigatória(s) da empresa. O bot responde melhor com tudo preenchido — <Link href="/painel/configuracao">terminar configuração</Link>.</div>
      )}

      <div className="card">
        {wa.status === 'idle' && (<>
          <p>Nenhum WhatsApp conectado. Ao conectar, o bot começa a responder sozinho as mensagens recebidas nesse número.</p>
          <button className="primary" onClick={act('connect')}>Conectar WhatsApp</button>
          <p className="small muted">Você vai ler um QR Code com o celular: WhatsApp → Aparelhos conectados → Conectar um aparelho. É o mesmo processo do WhatsApp Web.</p>
        </>)}
        {wa.status === 'connecting' && <p>Conectando…</p>}
        {wa.status === 'qr' && (<>
          <h2>Leia o QR Code com o celular</h2>
          {wa.qr && <img className="qr" src={wa.qr} alt="QR Code para conectar o WhatsApp" />}
          <p className="small muted">WhatsApp → Configurações → Aparelhos conectados → Conectar um aparelho. O código renova sozinho.</p>
          <button onClick={act('disconnect')}>Cancelar</button>
        </>)}
        {wa.status === 'connected' && (<>
          <p><span className="pill">Conectado</span> {wa.phone && <>número <strong>+{wa.phone}</strong></>}</p>
          <label className="check"><input type="checkbox" checked={me?.bot_enabled ?? true} onChange={(e) => toggleBot(e.target.checked)} /> Bot respondendo automaticamente</label>
          <p className="small muted">Se você responder uma conversa direto pelo celular, o bot fica em silêncio nela por 30 minutos.</p>
          <button className="danger" onClick={() => { if (confirm('Desconectar e desvincular este WhatsApp?')) act('disconnect')(); }}>Desconectar</button>
        </>)}
      </div>

      <div className="alert">Esta conexão usa o método não oficial do WhatsApp Web. Evite mensagens em massa e use um número que você aceite arriscar: a Meta pode banir números que automatizam sem a API oficial.</div>
    </>
  );
}
