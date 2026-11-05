'use client';
import { useEffect } from 'react';
import './landing.css';

// Mensagens da conversa de demonstração. O atraso (--d) faz cada balão aparecer na sua vez, só com CSS.
const CHAT = [
  { who: 'cli', d: 0.9, t: 'Oi! Vocês têm dipirona?' },
  { who: 'bot', d: 2.2, t: 'Temos sim! Dipirona 500 mg, R$ 8,90 a cartela. Quantas você quer?' },
  { who: 'cli', d: 3.9, t: 'Quero 2. Faz por R$ 8 cada?' },
  { who: 'bot', d: 5.4, t: 'Fechado: 2 por R$ 16,00. Pix copia e cola 👇', pix: true },
  { who: 'cli', d: 7.4, proof: true },
  { who: 'ok', d: 8.8, t: '✓ Comprovante conferido. Dono avisado.' },
];

const STEPS = [
  ['Crie sua conta', 'E-mail e senha. Leva menos de um minuto e sua senha é guardada criptografada.'],
  ['Receba seu ID', 'Ao criar a conta aparece o seu ID. Um toque no botão e ele já vai pro meu WhatsApp.'],
  ['Pague e eu libero', 'A gente conversa, você faz o pagamento e eu libero o seu acesso na hora.'],
];

export default function Home() {
  useEffect(() => {
    const els = document.querySelectorAll('.lp-step');
    if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; }
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.25 });
    els.forEach((e, i) => { e.style.transitionDelay = `${i * 120}ms`; io.observe(e); });
    return () => io.disconnect();
  }, []);

  return (
    <main className="lp">
      <div className="lp-wrap">
        <header className="lp-top">
          <span className="lp-logo"><i aria-hidden="true" />ZapBot</span>
          <a className="lp-link" href="/login">Entrar</a>
        </header>

        <section className="lp-hero">
          <div>
            <span className="lp-kicker">Atendente de WhatsApp com IA</span>
            <h1>Seu WhatsApp <em>vendendo</em> sozinho.</h1>
            <p className="lp-lead">Responde clientes, negocia, manda o Pix e confere o comprovante. Você só confirma o pagamento.</p>
            <div className="lp-cta">
              <a className="lp-btn main" href="/login?modo=cadastro">Criar minha conta</a>
              <a className="lp-btn ghost" href="/login">Já tenho conta</a>
            </div>
          </div>

          <div className="lp-phone" aria-label="Exemplo de conversa">
            <div className="lp-screen">
              <div className="lp-bar"><b>ZB</b><span>Farmácia Central<small>atendimento automático</small></span></div>
              <div className="lp-msgs">
                {CHAT.map((m, i) => (
                  <div key={i} className={`lp-m ${m.who}`} style={{ '--d': `${m.d}s` }}>
                    {m.proof ? <span className="lp-proof"><i />Comprovante enviado</span> : m.t}
                    {m.pix && <span className="lp-pix">Pix · valor<b>R$ 16,00</b></span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="lp-sec">
          <h2>Como liberar o seu acesso</h2>
          <div className="lp-steps">
            {STEPS.map(([h, p]) => (<div className="lp-step" key={h}><h3>{h}</h3><p>{p}</p></div>))}
          </div>
        </section>

        <section className="lp-price" aria-label="Assinatura">
          <div>
            <div className="lp-amount">R$ 99,99<small> / mês</small></div>
            <ul className="lp-list">
              <li>Atendimento com IA, 24 horas por dia</li>
              <li>Catálogo de produtos e negociação com limite de desconto</li>
              <li>Pix, conferência de comprovante e aviso ao dono</li>
              <li>Renovação mensal combinada direto comigo, no WhatsApp</li>
            </ul>
          </div>
          <a className="lp-btn main" href="/login?modo=cadastro">Quero assinar</a>
        </section>

        <p className="lp-foot">Ao criar sua conta você recebe um ID e fala comigo direto no WhatsApp para ativar.</p>
      </div>

      <div className="lp-sticky">
        <a className="lp-btn main" href="/login?modo=cadastro">Criar minha conta</a>
      </div>
    </main>
  );
}
