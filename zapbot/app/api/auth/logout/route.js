import { clearSessionCookie } from '@/lib/session.js';

export async function POST() {
  await clearSessionCookie();
  return Response.json({ ok: true });
}
