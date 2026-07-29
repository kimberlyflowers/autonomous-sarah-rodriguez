alter table public.projects
  add column if not exists repository_owner text,
  add column if not exists repository_name text,
  add column if not exists repository_default_branch text,
  add column if not exists vercel_project_id text,
  add column if not exists workspace_instructions text;

comment on column public.projects.repository_owner is 'Default GitHub owner for Project Work sessions.';
comment on column public.projects.repository_name is 'Default GitHub repository for Project Work sessions.';
comment on column public.projects.repository_default_branch is 'Base branch used when creating an isolated Project Work worktree.';
comment on column public.projects.vercel_project_id is 'Tenant Vercel project ID or name associated with this Project.';
comment on column public.projects.workspace_instructions is 'Persistent instructions injected into Project Work sessions.';
