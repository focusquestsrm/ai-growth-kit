-- Platform administrators may exercise the member experience without a
-- Brilliant Directories/member_app_access record. Every user-owned row must
-- still have exactly one owner: a synchronized member or an authenticated user.

do $$ begin
  if exists (select 1 from pg_constraint where conname = 'platform_role_assignments_role_check') then
    alter table public.platform_role_assignments drop constraint platform_role_assignments_role_check;
  end if;
exception when duplicate_object then null;
end $$;

update public.platform_role_assignments set role = case role
  when 'super_admin' then 'platform_admin'
  when 'admin' then 'content_admin'
  when 'staff' then 'data_admin'
  else role
end
where role in ('super_admin','admin','staff');

alter table public.platform_role_assignments add constraint platform_role_assignments_role_check
  check (role in ('platform_admin','content_admin','data_admin','member','executive_viewer','partner_admin','tester','read_only'));

alter table public.platform_invitations drop constraint if exists platform_invitations_role_check;
alter table public.platform_invitations add constraint platform_invitations_role_check
  check (role in ('content_admin','data_admin','member')) not valid;

alter table public.prompt_generations add column if not exists auth_user_id uuid references auth.users(id) on delete cascade;
alter table public.saved_outputs add column if not exists auth_user_id uuid references auth.users(id) on delete cascade;
alter table public.business_profiles add column if not exists auth_user_id uuid references auth.users(id) on delete cascade;
alter table public.favorite_tools add column if not exists auth_user_id uuid references auth.users(id) on delete cascade;
alter table public.platform_feedback add column if not exists auth_user_id uuid references auth.users(id) on delete set null;
alter table public.business_health_assessments add column if not exists auth_user_id uuid references auth.users(id) on delete cascade;
alter table public.assessment_responses add column if not exists auth_user_id uuid references auth.users(id) on delete cascade;
alter table public.saved_strategies add column if not exists auth_user_id uuid references auth.users(id) on delete cascade;

alter table public.prompt_generations alter column member_access_id drop not null;
alter table public.saved_outputs alter column member_access_id drop not null;
alter table public.business_profiles alter column member_access_id drop not null;
alter table public.favorite_tools alter column member_access_id drop not null;
alter table public.business_health_assessments alter column member_access_id drop not null;
alter table public.assessment_responses alter column member_access_id drop not null;
alter table public.saved_strategies alter column member_access_id drop not null;

do $$
declare table_name text;
begin
  foreach table_name in array array['prompt_generations','saved_outputs','business_profiles','favorite_tools','business_health_assessments','assessment_responses','saved_strategies'] loop
    execute format('alter table public.%I drop constraint if exists %I', table_name, table_name || '_owner_check');
    execute format('alter table public.%I add constraint %I check (num_nonnulls(member_access_id, auth_user_id) = 1)', table_name, table_name || '_owner_check');
  end loop;
end $$;

alter table public.platform_feedback drop constraint if exists platform_feedback_owner_check;
alter table public.platform_feedback add constraint platform_feedback_owner_check
  check (num_nonnulls(member_access_id, auth_user_id) = 1) not valid;

create unique index if not exists business_profiles_auth_user_unique on public.business_profiles(auth_user_id);
create unique index if not exists favorite_tools_auth_user_prompt_unique on public.favorite_tools(auth_user_id, prompt_id);
create index if not exists prompt_generations_auth_user_idx on public.prompt_generations(auth_user_id, created_at desc) where auth_user_id is not null;
create index if not exists saved_outputs_auth_user_idx on public.saved_outputs(auth_user_id, updated_at desc) where auth_user_id is not null;
create index if not exists saved_strategies_auth_user_idx on public.saved_strategies(auth_user_id, updated_at desc) where auth_user_id is not null;
create index if not exists business_health_auth_user_idx on public.business_health_assessments(auth_user_id, created_at desc) where auth_user_id is not null;
create index if not exists assessment_responses_auth_user_idx on public.assessment_responses(auth_user_id, completed_at desc) where auth_user_id is not null;

-- Preserve the original administrator bootstrap as the canonical role name.
insert into public.user_roles(auth_user_id,email,normalized_email,role,is_active,assigned_by)
select pa.auth_user_id,pa.email,pa.normalized_email,'platform_admin',true,'migration-009'
from public.platform_accounts pa
join public.platform_role_assignments pra on pra.account_id=pa.id and pra.role='platform_admin' and pra.is_active
where pa.auth_user_id is not null
  and not exists (
    select 1 from public.user_roles ur
    where ur.auth_user_id=pa.auth_user_id and ur.role='platform_admin' and coalesce(ur.is_active,true)
  );

comment on column public.business_profiles.auth_user_id is
  'Authenticated owner for a platform administrator profile; bd_user_id/member_app_access is not required.';
