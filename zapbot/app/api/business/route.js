import { query } from '@/lib/db.js';
import { currentBusiness, unauthorized, bad, readJson } from '@/lib/session.js';
import { sanitizeHours } from '@/lib/hours.js';
import { BUSINESS_TYPES, questionsFor, missingRequired } from '@/lib/templates.js';

export async function GET() {
  const b = await currentBusiness();
  if (!b) return await unauthorized();
  return Response.json({ name: b.name, type: b.type, answers: b.answers, bot_enabled: b.bot_enabled, missing: missingRequired(b.type, b.answers) });
}

// Só grava respostas das perguntas do tipo escolhido (ignora qualquer outra chave).
export async function PUT(req) {
  const b = await currentBusiness();
  if (!b) return await unauthorized();
  const body = await readJson(req);

  const type = body.type ?? b.type;
  if (!BUSINESS_TYPES.some((t) => t.key === type)) return bad('Tipo de empresa inválido');
  const name = body.name !== undefined ? String(body.name).trim().slice(0, 120) : b.name;
  if (!name) return bad('O nome da empresa é obrigatório');

  let answers = b.answers;
  if (body.answers && typeof body.answers === 'object') {
    answers = {};
    for (const q of questionsFor(type)) {
      const v = body.answers[q.key];
      if (v === undefined || v === null) continue;
      if (q.type === 'hours') { const hrs = sanitizeHours(v); if (!hrs) return bad('Horário de funcionamento inválido (use HH:MM)'); answers[q.key] = hrs; }
      else if (q.type === 'boolean') answers[q.key] = v === true;
      else if (q.type === 'multi') answers[q.key] = Array.isArray(v) ? v.map((x) => String(x).slice(0, 80)).slice(0, 20) : [];
      else answers[q.key] = String(v).slice(0, 4000);
    }
  }
  const botEnabled = typeof body.bot_enabled === 'boolean' ? body.bot_enabled : b.bot_enabled;

  await query('update businesses set name = $2, type = $3, answers = $4, bot_enabled = $5 where id = $1', [b.id, name, type, answers, botEnabled]);
  return Response.json({ ok: true, missing: missingRequired(type, answers) });
}
