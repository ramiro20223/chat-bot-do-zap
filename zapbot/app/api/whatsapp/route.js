import { currentBusiness, unauthorized, bad } from '@/lib/session.js';
import { connect, disconnect, getStatus, sendTestToOwner } from '@/lib/wa.js';

export const dynamic = 'force-dynamic';

export async function GET() {
  const b = await currentBusiness();
  if (!b) return unauthorized();
  return Response.json(getStatus(b.id));
}

export async function POST(req) {
  const b = await currentBusiness();
  if (!b) return unauthorized();
  const { action } = await req.json().catch(() => ({}));
  if (action === 'connect') return Response.json(await connect(b.id));
  if (action === 'disconnect') { await disconnect(b.id); return Response.json(getStatus(b.id)); }
  if (action === 'test_owner') return Response.json(await sendTestToOwner(b.id));
  return bad('Ação inválida');
}
