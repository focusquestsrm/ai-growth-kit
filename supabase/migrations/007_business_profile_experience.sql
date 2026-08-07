-- Expanded, structured Business Profile experience.
-- Safe to run after migration 006_identity_administration.sql.

alter table public.business_profiles add column if not exists other_industry_name text;
alter table public.business_profiles add column if not exists primary_markets_served text;
alter table public.business_profiles add column if not exists markets_to_enter text;
alter table public.business_profiles add column if not exists business_certifications jsonb not null default '[]'::jsonb;
alter table public.business_profiles add column if not exists other_certification_name text;
alter table public.business_profiles add column if not exists interested_in_certifications text;
alter table public.business_profiles add column if not exists social_linkedin text;
alter table public.business_profiles add column if not exists social_facebook text;
alter table public.business_profiles add column if not exists social_instagram text;
alter table public.business_profiles add column if not exists social_x text;
alter table public.business_profiles add column if not exists social_other text;
alter table public.business_profiles add column if not exists primary_business_challenge text;
alter table public.business_profiles add column if not exists other_business_challenge text;
alter table public.business_profiles add column if not exists legacy_profile_data jsonb not null default '{}'::jsonb;

-- Preserve every retired free-text value before converting it to the new structure.
update public.business_profiles
set legacy_profile_data = coalesce(legacy_profile_data, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
  'social_media', nullif(btrim(social_media), ''),
  'certifications', nullif(btrim(certifications), ''),
  'minority_owned_status', nullif(btrim(minority_owned_status), ''),
  'small_business_status', nullif(btrim(small_business_status), '')
));

-- Keep recognized URLs in the new Other social link while retaining all originals above.
update public.business_profiles
set social_other = btrim(social_media)
where social_other is null and social_media ~* '^https?://[^[:space:]]+$';

-- Map previous certification fields to structured selections when their meaning is clear.
update public.business_profiles
set business_certifications = business_certifications || jsonb_build_array('Small Business / SBA-qualified')
where coalesce(small_business_status, '') ~* '(yes|certif|qualified|small business|sba)'
  and not business_certifications ? 'Small Business / SBA-qualified';

update public.business_profiles
set business_certifications = business_certifications || jsonb_build_array('Minority Business Enterprise (MBE)')
where coalesce(minority_owned_status, '') ~* '(yes|certif|minority|mbe)'
  and not business_certifications ? 'Minority Business Enterprise (MBE)';

update public.business_profiles
set business_certifications = business_certifications || jsonb_build_array('Other Certification'),
    other_certification_name = btrim(certifications)
where nullif(btrim(certifications), '') is not null
  and not business_certifications ? 'Other Certification';

-- Retain a valid catalog industry. Unmapped free text becomes the explicit Other value.
update public.business_profiles
set other_industry_name = btrim(industry), industry = 'Other'
where nullif(btrim(industry), '') is not null
  and industry <> all(array[
    'Accounting & Financial Services','Advertising, Marketing & Public Relations','Agriculture & Food Production','Arts, Entertainment & Media','Automotive & Transportation Services','Beauty, Personal Care & Wellness','Business Consulting & Professional Services','Childcare & Family Services','Construction & Skilled Trades','Consumer Products & Retail','Education & Training','Energy & Utilities','Engineering & Technical Services','Event Planning & Hospitality','Food & Beverage','Government & Public Sector Services','Healthcare & Medical Services','Home Services & Property Maintenance','Human Resources & Staffing','Information Technology & Cybersecurity','Insurance','Legal Services','Logistics, Distribution & Supply Chain','Manufacturing','Nonprofit & Community Services','Real Estate & Property Management','Restaurants & Catering','Security & Protective Services','Sports, Fitness & Recreation','Telecommunications','Travel & Tourism','Transportation & Delivery','Other'
  ]);

alter table public.business_profiles drop constraint if exists business_profiles_certifications_array;
alter table public.business_profiles add constraint business_profiles_certifications_array check (jsonb_typeof(business_certifications) = 'array');
alter table public.business_profiles drop constraint if exists business_profiles_certification_interest;
alter table public.business_profiles add constraint business_profiles_certification_interest check (interested_in_certifications is null or interested_in_certifications in ('Yes','No','Not Sure'));

alter table public.business_profiles drop column if exists social_media;
alter table public.business_profiles drop column if exists certifications;
alter table public.business_profiles drop column if exists minority_owned_status;
alter table public.business_profiles drop column if exists small_business_status;
