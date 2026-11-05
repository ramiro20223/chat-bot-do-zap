import { clearAdminCookie } from '@/lib/admin-session.js';
export async function POST() { await clearAdminCookie(); return Response.json({ ok: true }); }
