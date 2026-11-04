// Limitadores em memória (puros). Servem para tentativas de login e para flood de mensagens.
export function createLimiter({ max, windowMs, maxKeys = 10000 }) {
  const hits = new Map();
  const recent = (key, now) => (hits.get(key) || []).filter((t) => now - t < windowMs);
  const prune = (now) => { for (const [k, arr] of hits) if (!arr.length || now - arr[arr.length - 1] >= windowMs) hits.delete(k); };
  return {
    /** Já passou do limite? (não registra nada) */
    blocked(key, now = Date.now()) { return recent(key, now).length >= max; },
    /** Registra uma ocorrência (ex.: login errado). */
    record(key, now = Date.now()) { if (hits.size > maxKeys) prune(now); hits.set(key, [...recent(key, now), now]); },
    /** Registra e diz se ainda estava dentro do limite (ex.: mensagens de um cliente). */
    allow(key, now = Date.now()) { if (this.blocked(key, now)) return false; this.record(key, now); return true; },
    clear(key) { hits.delete(key); },
    get size() { return hits.size; },
  };
}
