-- Schema do ZapBot. Idempotente: roda a cada inicialização.
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

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
