alter table public.website_builds
  add column if not exists project_id uuid references public.projects(id) on delete set null;

create index if not exists website_builds_project_created_idx
  on public.website_builds (project_id, created_at desc);

comment on column public.website_builds.project_id is
  'Project that owns this durable Work session. The session ID also scopes its isolated Git worktree.';
