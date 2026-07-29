create table if not exists public.agent_execution_checkpoints (
  id uuid primary key default gen_random_uuid(),
  session_id text not null unique,
  organization_id uuid,
  agent_id uuid,
  status text not null default 'running'
    check (status in ('running', 'pending', 'ready', 'failed', 'blocked', 'timeout')),
  current_step text,
  todos jsonb not null default '[]'::jsonb,
  tools_used jsonb not null default '[]'::jsonb,
  tool_receipts jsonb not null default '[]'::jsonb,
  pending_jobs jsonb not null default '[]'::jsonb,
  last_error text,
  rounds_used integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists agent_execution_checkpoints_status_idx
  on public.agent_execution_checkpoints (status, updated_at desc);

alter table public.agent_execution_checkpoints enable row level security;

comment on table public.agent_execution_checkpoints is
  'Durable execution cursor for Bloomie chat tasks. Service-role only; user-facing access goes through authenticated application APIs.';
