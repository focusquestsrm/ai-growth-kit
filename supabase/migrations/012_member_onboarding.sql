-- Persistent, optional onboarding state for members and platform administrators testing Member View.

create table if not exists public.member_onboarding (
  id uuid primary key default gen_random_uuid(),
  member_access_id uuid references public.member_app_access(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete cascade,
  tour_started boolean not null default false,
  tour_completed boolean not null default false,
  tour_skipped boolean not null default false,
  tour_started_at timestamptz,
  tour_completed_at timestamptz,
  tour_skipped_at timestamptz,
  profile_completed_at timestamptz,
  assessment_completed_at timestamptz,
  recommendations_reviewed_at timestamptz,
  first_tool_used_at timestamptz,
  first_strategy_saved_at timestamptz,
  checklist_acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_onboarding_owner check (
    (member_access_id is not null and auth_user_id is null)
    or (member_access_id is null and auth_user_id is not null)
  )
);

create unique index if not exists member_onboarding_member_owner
  on public.member_onboarding(member_access_id) where member_access_id is not null;
create unique index if not exists member_onboarding_auth_owner
  on public.member_onboarding(auth_user_id) where auth_user_id is not null;

alter table public.member_onboarding enable row level security;
revoke all on public.member_onboarding from anon, authenticated;
