import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

export async function middleware(req) {
  const token = req.cookies.get('zap_session')?.value;
  try {
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET || 'dev-only-secret-change-me');
    await jwtVerify(token, secret, { algorithms: ['HS256'] });
    return NextResponse.next();
  } catch {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }
}

export const config = { matcher: ['/painel/:path*'] };
