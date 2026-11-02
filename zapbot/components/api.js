// Pequeno helper de fetch para o painel. Lança Error com a mensagem da API.
export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && typeof window !== 'undefined') window.location.href = '/login';
  if (!res.ok) throw new Error(data.error || 'Algo deu errado. Tente novamente.');
  return data;
}
