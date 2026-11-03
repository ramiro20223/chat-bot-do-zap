// Pequeno helper de fetch para o painel. Lança Error com a mensagem da API.
export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
    signal: AbortSignal.timeout(90000),
  }).catch((e) => { throw new Error(e.name === 'TimeoutError' ? 'A resposta demorou demais. Veja o terminal do servidor para o motivo.' : e.message); });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && typeof window !== 'undefined') window.location.href = '/login';
  if (!res.ok) throw new Error(data.error || 'Algo deu errado. Tente novamente.');
  return data;
}
