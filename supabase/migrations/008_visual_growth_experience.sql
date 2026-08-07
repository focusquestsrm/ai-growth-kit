-- Shared visual system metadata and multi-select business challenges.
-- Safe to rerun after migration 007_business_profile_experience.sql.

alter table public.prompts add column if not exists thumbnail_url text;
alter table public.prompts add column if not exists thumbnail_type text;
alter table public.prompt_categories add column if not exists category_default_thumbnail text;
alter table public.business_profiles add column if not exists primary_business_challenges jsonb not null default '[]'::jsonb;

update public.business_profiles as profile
set primary_business_challenges = jsonb_build_array(to_jsonb(profile)->>'primary_business_challenge')
where jsonb_array_length(primary_business_challenges) = 0
  and nullif(btrim(to_jsonb(profile)->>'primary_business_challenge'), '') is not null;

alter table public.business_profiles drop constraint if exists business_profiles_challenges_array;
alter table public.business_profiles add constraint business_profiles_challenges_array check (jsonb_typeof(primary_business_challenges) = 'array');
alter table public.prompts drop constraint if exists prompts_thumbnail_type;
alter table public.prompts add constraint prompts_thumbnail_type check (thumbnail_type is null or thumbnail_type in ('custom','category'));

update public.prompt_categories
set category_default_thumbnail = slug
where slug in ('profile-branding','marketing-content','sales-relationships','strategy-operations','opportunities-procurement','leadership-growth');

update public.assessment_sections set title = case slug
  when 'brand-market-position' then 'Brand & Market Position'
  when 'sales-business-development' then 'Sales & Business Development'
  when 'partnerships-networking' then 'Partnerships & Networking'
  when 'government-corporate-readiness' then 'Government & Corporate Readiness'
  when 'leadership-growth-planning' then 'Leadership & Growth Planning'
  else title end
where slug in ('brand-market-position','sales-business-development','partnerships-networking','government-corporate-readiness','leadership-growth-planning');

alter table public.business_profiles drop column if exists primary_business_challenge;
