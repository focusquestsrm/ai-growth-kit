-- Unified platform identity and administration model.
-- Safe to run after migration 005. Membership imports must continue to write
-- only to member_app_access; administrative assignments live in separate tables.

create table if not exists public.platform_accounts (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  email text not null,
  normalized_email text not null unique,
  first_name text,
  last_name text,
  organization text not null default 'D9Network',
  account_type text not null check (account_type in ('internal','member','partner','external_tester')),
  account_status text not null check (account_status in ('invited','pending_activation','active','suspended','archived')),
  membership_status text not null check (membership_status in ('member','non_member','pending','inactive')),
  member_access_id uuid unique references public.member_app_access(id) on delete set null,
  simulated_tier text check (simulated_tier is null or simulated_tier in ('Bronze','Silver','Gold','Platinum')),
  account_designation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (membership_status = 'member' or member_access_id is null)
);

create table if not exists public.platform_role_assignments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.platform_accounts(id) on delete cascade,
  role text not null check (role in ('super_admin','admin','staff','executive_viewer','member','partner_admin','tester','read_only')),
  permissions jsonb not null default '[]'::jsonb,
  scope text not null default 'd9network',
  is_active boolean not null default true,
  assigned_by uuid references public.platform_accounts(id) on delete set null,
  assigned_at timestamptz not null default now(),
  unique(account_id, role, scope)
);

create table if not exists public.platform_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  normalized_email text not null,
  first_name text,
  last_name text,
  role text not null check (role in ('admin','staff','executive_viewer','member','partner_admin','tester','read_only')),
  permissions jsonb not null default '[]'::jsonb,
  account_type text not null check (account_type in ('internal','member','partner','external_tester')),
  account_status text not null default 'invited' check (account_status in ('invited','pending_activation','active','suspended','archived')),
  membership_status text not null check (membership_status in ('member','non_member','pending','inactive')),
  simulated_tier text check (simulated_tier is null or simulated_tier in ('Bronze','Silver','Gold','Platinum')),
  invited_by uuid not null references public.platform_accounts(id),
  auth_invited_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.impersonation_sessions (
  id uuid primary key default gen_random_uuid(),
  actor_account_id uuid not null references public.platform_accounts(id),
  target_account_id uuid references public.platform_accounts(id),
  viewed_role text check (viewed_role is null or viewed_role in ('admin','staff','executive_viewer','member','partner_admin','tester','read_only')),
  simulated_tier text check (simulated_tier is null or simulated_tier in ('Bronze','Silver','Gold','Platinum')),
  is_read_only boolean not null default true,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_by uuid references public.platform_accounts(id)
);

create index if not exists platform_accounts_auth_idx on public.platform_accounts(auth_user_id);
create index if not exists platform_roles_account_idx on public.platform_role_assignments(account_id) where is_active;
create index if not exists platform_invitations_email_idx on public.platform_invitations(normalized_email, created_at desc);
create index if not exists impersonation_actor_idx on public.impersonation_sessions(actor_account_id, started_at desc);

alter table public.platform_accounts enable row level security;
alter table public.platform_role_assignments enable row level security;
alter table public.platform_invitations enable row level security;
alter table public.impersonation_sessions enable row level security;
revoke all on public.platform_accounts, public.platform_role_assignments, public.platform_invitations, public.impersonation_sessions from anon, authenticated;

-- Preserve existing administrative assignments during the transition. These
-- records contain no membership/tier changes and can be reviewed in the console.
insert into public.platform_accounts(email, normalized_email, account_type, account_status, membership_status, organization, account_designation)
select min(ur.email), ur.normalized_email, 'internal', 'active', 'non_member', 'D9Network',
  case when bool_or(ur.role = 'platform_admin') then 'Platform Administrator' else 'D9Network Administrator' end
from public.user_roles ur
where ur.role in ('data_admin','content_admin','platform_admin') and coalesce(ur.is_active, true)
group by ur.normalized_email
on conflict (normalized_email) do nothing;

insert into public.platform_role_assignments(account_id, role, permissions)
select pa.id,
  case ur.role when 'platform_admin' then 'super_admin' when 'content_admin' then 'admin' else 'staff' end,
  case ur.role
    when 'platform_admin' then '["admin.*"]'::jsonb
    when 'content_admin' then '["admin.dashboard.read","admin.content.manage","admin.feedback.manage","admin.reporting.read"]'::jsonb
    else '["admin.dashboard.read","admin.members.read","admin.members.manage","admin.imports.manage"]'::jsonb
  end
from public.user_roles ur
join public.platform_accounts pa on pa.normalized_email = ur.normalized_email
where ur.role in ('data_admin','content_admin','platform_admin') and coalesce(ur.is_active, true)
on conflict (account_id, role, scope) do nothing;
