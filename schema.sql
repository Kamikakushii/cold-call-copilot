create extension if not exists "pgcrypto";

create table if not exists calls (
  id uuid primary key default gen_random_uuid(),
  prospect_name text not null,
  company text not null,
  outcome text,
  created_at timestamptz not null default now()
);

create table if not exists call_stages (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references calls (id) on delete cascade,
  stage_number integer not null check (stage_number between 1 and 8),
  button_tapped text,
  prospect_words text,
  created_at timestamptz not null default now()
);

create index if not exists call_stages_call_id_idx on call_stages (call_id);
