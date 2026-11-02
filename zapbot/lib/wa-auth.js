// Estado de autenticação do Baileys guardado no Postgres (em vez de arquivos),
// para que a sessão do WhatsApp sobreviva a deploys/reinícios do servidor.
import { proto, initAuthCreds, BufferJSON } from '@whiskeysockets/baileys';
import { query } from './db.js';

export async function usePgAuthState(businessId) {
  const read = async (key) => {
    const { rows } = await query('select value from wa_auth where business_id = $1 and key = $2', [businessId, key]);
    return rows[0] ? JSON.parse(rows[0].value, BufferJSON.reviver) : null;
  };
  const write = (key, value) => value == null
    ? query('delete from wa_auth where business_id = $1 and key = $2', [businessId, key])
    : query(
      `insert into wa_auth (business_id, key, value) values ($1, $2, $3)
       on conflict (business_id, key) do update set value = excluded.value`,
      [businessId, key, JSON.stringify(value, BufferJSON.replacer)],
    );

  const creds = (await read('creds')) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(ids.map(async (id) => {
            let v = await read(`${type}-${id}`);
            if (type === 'app-state-sync-key' && v) v = proto.Message.AppStateSyncKeyData.fromObject(v);
            data[id] = v;
          }));
          return data;
        },
        set: async (data) => {
          const jobs = [];
          for (const category of Object.keys(data)) {
            for (const id of Object.keys(data[category])) jobs.push(write(`${category}-${id}`, data[category][id]));
          }
          await Promise.all(jobs);
        },
      },
    },
    saveCreds: () => write('creds', creds),
  };
}

export const clearAuth = (businessId) => query('delete from wa_auth where business_id = $1', [businessId]);
