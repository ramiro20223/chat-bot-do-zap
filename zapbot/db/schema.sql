-- Schema do ZapBot. Idempotente: roda a cada inicialização.
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

alter table users add column if not exists token_version integer not null default 0;  -- sessões: aumentar = sair de todos os aparelhos

create table if not exists businesses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references users(id) on delete cascade,
  name text not null,
  type text not null default 'outro',
  answers jsonb not null default '{}'::jsonb,
  bot_enabled boolean not null default true,
  wa_enabled boolean not null default false,  -- reconectar o WhatsApp ao reiniciar o servidor
  created_at timestamptz not null default now()
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  category text,
  description text,
  indications text,
  characteristics text,
  price numeric(10,2),
  in_stock boolean not null default true,
  active boolean not null default true,
  search_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists products_business_idx on products (business_id) where active;

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  jid text not null,
  contact_name text,
  paused_until timestamptz,
  last_message_at timestamptz not null default now(),
  unique (business_id, jid)
);
create index if not exists conversations_recent_idx on conversations (business_id, last_message_at desc);

create table if not exists messages (
  id bigserial primary key,
  conversation_id uuid not null references conversations(id) on delete cascade,
  direction text not null check (direction in ('in','out')),
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists messages_conv_idx on messages (conversation_id, id);

-- Sessão do WhatsApp (credenciais do Baileys) guardada no banco: sobrevive a deploys.
create table if not exists wa_auth (
  business_id uuid not null references businesses(id) on delete cascade,
  key text not null,
  value text not null,
  primary key (business_id, key)
);

-- Pedidos (modo vendas)
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  num bigserial unique,                         -- número curto que o dono usa nos comandos ("ok 12")
  business_id uuid not null references businesses(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  jid text not null,
  customer_name text,
  lines jsonb not null default '[]'::jsonb,
  subtotal_cents integer not null,
  discount_pct numeric(5,2) not null default 0,
  total_cents integer not null,
  delivery text,
  address text,
  details text,
  status text not null default 'draft'
    check (status in ('draft','awaiting_payment','proof_received','proof_review','paid','cancelled')),
  pix_txid text,
  pix_payload text,
  reject_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_business_idx on orders (business_id, created_at desc);
create index if not exists orders_conv_idx on orders (conversation_id, status);

-- Comprovantes recebidos (a imagem em si não é guardada; só o hash e o que foi lido dela)
create table if not exists order_proofs (
  id bigserial primary key,
  order_id uuid not null references orders(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  image_sha256 text not null,
  e2e_id text,
  amount_cents integer,
  extracted jsonb not null default '{}'::jsonb,
  verdict text not null,
  problems jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists order_proofs_hash_idx on order_proofs (business_id, image_sha256);
create index if not exists order_proofs_e2e_idx on order_proofs (business_id, e2e_id) where e2e_id is not null;

-- ===== Assinatura (R$ 99,99/mês), ID da conta e liberação pelo administrador =====
alter table users add column if not exists account_code text;
alter table users add column if not exists subscription_until timestamptz;
alter table users add column if not exists blocked boolean not null default false;
alter table users add column if not exists totp_last_step bigint;
-- contas criadas antes deste recurso ganham um ID automaticamente
update users set account_code = 'ZB-' || upper(substr(translate(replace(gen_random_uuid()::text, '-', ''), '01ail', '23456'), 1, 6)) where account_code is null;
create unique index if not exists users_account_code_idx on users (account_code);

-- Histórico das liberações feitas pelo administrador (auditoria)
create table if not exists subscription_events (
  id bigserial primary key,
  user_id uuid not null references users(id) on delete cascade,
  action text not null check (action in ('activate','extend','revoke','block','unblock')),
  days integer,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists subscription_events_user_idx on subscription_events (user_id, id desc);

-- Controle do 2FA do administrador (impede reutilizar o mesmo código)
create table if not exists admin_state (
  id integer primary key default 1 check (id = 1),
  totp_last_step bigint
);
insert into admin_state (id) values (1) on conflict do nothing;

alter table subscription_events drop constraint if exists subscription_events_action_check;
alter table subscription_events add constraint subscription_events_action_check
  check (action in ('activate','extend','revoke','block','unblock','reset_password'));

-- Segurança no Supabase: liga a proteção de linhas (RLS) em todas as tabelas, SEM políticas.
-- Assim a API pública do Supabase (chave "anon") não lê nem grava nada. O servidor conecta como dono do banco e não é afetado.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
