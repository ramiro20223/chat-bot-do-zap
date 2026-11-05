import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { csrfOk, sessionCookieName } from './lib/web-security.js';

const enc = (s) => new TextEncoder().encode(s);

// Em produção, sem AUTH_SECRET forte NÃO existe segredo padrão: ninguém passa (falha fechada).
function secretBytes() {
  const s = process.env.AUTH_SECRET;
  if (process.env.NODE_ENV === 'production') return s && s.length >= 32 ? enc(s) : null;
  return enc(s || 'dev-only-secret-change-me');
}

export async function middleware(req) {
  const { pathname } = req.nextUrl;

  // API: pedidos que alteram dados só valem se vierem do próprio site (barra CSRF).
  if (pathname.startsWith('/api/')) {
    const ok = csrfOk({
      method: req.method, origin: req.headers.get('origin'), host: req.headers.get('host'),
      forwardedHost: req.headers.get('x-forwarded-host'), secFetchSite: req.headers.get('sec-fetch-site'),
    });
    return ok ? NextResponse.next() : NextResponse.json({ error: 'Origem não permitida' }, { status: 403 });
  }

  // Painel do ADMINISTRADOR: cookie próprio (audiência diferente). Cookie de cliente nunca serve aqui.
  if (pathname.startsWith('/admin/painel')) {
    try {
      const secret = secretBytes();
      const token = req.cookies.get(process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false' ? '__Host-zap_admin' : 'zap_admin')?.value;
      if (!secret || !token) throw new Error('sem sessão');
      await jwtVerify(token, secret, { algorithms: ['HS256'], issuer: 'zapbot', audience: 'zapbot-admin' });
      return NextResponse.next();
    } catch {
      const url = req.nextUrl.clone(); url.pathname = '/admin'; url.search = '';
      return NextResponse.redirect(url);
    }
  }

  // Painel: exige sessão com assinatura válida. Se a sessão foi revogada, as rotas da API conferem no banco e mandam para o login.
  try {
    const secret = secretBytes();
    const token = req.cookies.get(sessionCookieName(process.env))?.value;
    if (!secret || !token) throw new Error('sem sessão');
    await jwtVerify(token, secret, { algorithms: ['HS256'], issuer: 'zapbot', audience: 'zapbot-panel' });
    return NextResponse.next();
  } catch {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }
}

export const config = { matcher: ['/painel/:path*', '/assinatura', '/admin/painel/:path*', '/api/:path*'] };
