create extension if not exists pgcrypto;

create table if not exists membership_tiers (
  rank smallint primary key check (rank between 1 and 4),
  name text unique not null,
  monthly_generation_limit integer not null default 10
);
insert into membership_tiers(rank,name,monthly_generation_limit) values
  (1,'Bronze',10),(2,'Silver',60),(3,'Gold',125),(4,'Platinum',250)
on conflict (rank) do update set name=excluded.name, monthly_generation_limit=excluded.monthly_generation_limit;

create table if not exists member_app_access (
  id uuid primary key default gen_random_uuid(),
  bd_user_id text not null,
  email text not null,
  normalized_email text unique not null,
  first_name text,
  last_name text,
  company text,
  d9_affiliation text,
  source_subscription_name text,
  growth_kit_tier text not null check (growth_kit_tier in ('Bronze','Silver','Gold','Platinum')),
  growth_kit_tier_rank smallint not null references membership_tiers(rank),
  access_enabled boolean not null default true,
  source text not null default 'manual',
  auth_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists member_app_access_bd_user_idx on member_app_access(bd_user_id);
create index if not exists member_app_access_tier_idx on member_app_access(growth_kit_tier_rank);

create table if not exists user_roles (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  normalized_email text not null,
  role text not null check (role in ('member','organization_leader','data_admin','content_admin','platform_admin')),
  organization_id text,
  created_at timestamptz not null default now(),
  unique(normalized_email, role, organization_id)
);

create table if not exists prompt_categories (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  slug text unique not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists prompts (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references prompt_categories(id),
  title text not null,
  slug text unique not null,
  description text not null,
  system_prompt text,
  user_prompt_template text not null,
  form_schema jsonb not null default '[]'::jsonb,
  minimum_tier_rank smallint not null references membership_tiers(rank),
  estimated_minutes integer not null default 10,
  output_type text not null default 'text',
  tags text[] not null default '{}',
  sort_order integer not null default 0,
  is_featured boolean not null default false,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists prompt_generations (
  id uuid primary key default gen_random_uuid(),
  member_access_id uuid not null references member_app_access(id),
  prompt_id uuid not null references prompts(id),
  input_payload jsonb not null default '{}'::jsonb,
  output_text text,
  status text not null default 'completed',
  created_at timestamptz not null default now()
);

create table if not exists import_batches (
  id uuid primary key default gen_random_uuid(),
  import_type text not null,
  filename text not null,
  uploaded_by text not null,
  total_rows integer not null default 0,
  accepted_rows integer not null default 0,
  ignored_rows integer not null default 0,
  rejected_rows integer not null default 0,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table member_app_access enable row level security;
alter table prompts enable row level security;
alter table prompt_categories enable row level security;
alter table prompt_generations enable row level security;
alter table user_roles enable row level security;
alter table import_batches enable row level security;
