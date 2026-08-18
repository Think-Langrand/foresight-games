-- 0005 — Multi-tenant projects.
--
-- Each row is one client "project": a gated micro-site at /project/<slug> whose
-- scenario-sets are pulled from a specific Foresight/Carmelita project
-- (`carmelita_project_ref`). The passphrase is stored ONLY as a scrypt hash and
-- validated server-side (see lib/project-gate.ts). `home_config` drives which
-- home-page items show and in what order.
--
-- Read server-side through lib/projects.ts (service_role bypasses RLS); like the
-- `content` table it gets NO public policy — the browser never reads it directly.

create table if not exists public.projects (
  id                     uuid primary key default gen_random_uuid(),
  slug                   text not null unique,          -- the /project/<slug> route segment
  name                   text not null,
  carmelita_project_ref  text not null,                 -- Foresight project id/slug used to resolve data
  passphrase_hash        text,                          -- scrypt$N$r$p$salt$hash ; null = no gate
  home_config            jsonb not null default '{}'::jsonb,  -- { items: [{ key, visible }] } ; array order = display order
  enabled                boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- RLS on, no policy: anon is denied, service_role bypasses. Matches `content`.
alter table public.projects enable row level security;
