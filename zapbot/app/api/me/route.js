import { currentBusiness, unauthorized } from '@/lib/session.js';
import { missingRequired } from '@/lib/templates.js';

export async function GET() {
  const b = await currentBusiness();
  if (!b) return unauthorized();
  return Response.json({ id: b.id, name: b.name, type: b.type, bot_enabled: b.bot_enabled, setupMissing: missingRequired(b.type, b.answers) });
}
