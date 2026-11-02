// Horário de funcionamento (puro, sem dependências).
export const DAYS = [
  { key: 'mon', label: 'Segunda' },
  { key: 'tue', label: 'Terça' },
  { key: 'wed', label: 'Quarta' },
  { key: 'thu', label: 'Quinta' },
  { key: 'fri', label: 'Sexta' },
  { key: 'sat', label: 'Sábado' },
  { key: 'sun', label: 'Domingo' },
];

export const DEFAULT_HOURS = Object.fromEntries(
  DAYS.map((d) => [d.key, { closed: d.key === 'sun', open: '09:00', close: '18:00' }]),
);

const toMin = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** Dia da semana (chave) e minutos desde 00:00 no fuso informado. */
export function localParts(date, tz = 'America/Sao_Paulo') {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const day = get('weekday').toLowerCase().slice(0, 3); // mon, tue...
  return { day, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

/** true/false se estiver aberto agora; null se os horários não foram preenchidos. */
export function isOpenNow(hours, date = new Date(), tz = 'America/Sao_Paulo') {
  if (!hours || typeof hours !== 'object') return null;
  const { day, minutes } = localParts(date, tz);
  const idx = DAYS.findIndex((d) => d.key === day);
  const today = hours[day];
  const yesterday = hours[DAYS[(idx + 6) % 7].key];

  const covers = (h, nowMin, overnightOnly) => {
    if (!h || h.closed) return false;
    const o = toMin(h.open), c = toMin(h.close);
    if (o === null || c === null) return false;
    if (c > o) return !overnightOnly && nowMin >= o && nowMin < c;
    // vira a madrugada (ex.: 18:00–02:00)
    return overnightOnly ? nowMin < c : nowMin >= o;
  };
  return covers(today, minutes, false) || covers(yesterday, minutes, true);
}

export function describeHours(hours) {
  if (!hours) return 'Não informado';
  return DAYS.map(({ key, label }) => {
    const h = hours[key];
    return `${label}: ${!h || h.closed ? 'Fechado' : `${h.open} às ${h.close}`}`;
  }).join('\n');
}
