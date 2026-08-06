-- Qualitative Business Growth Assessment and canonical Saved Strategies.
-- Safe to run after migration 004.

alter table public.user_roles add column if not exists is_active boolean not null default true;
alter table public.user_roles add column if not exists assigned_by text;
alter table public.user_roles add column if not exists assigned_at timestamptz not null default now();
alter table public.user_roles add column if not exists last_login_at timestamptz;

create table if not exists public.assessment_versions (
  id uuid primary key default gen_random_uuid(),
  version_label text unique not null,
  title text not null default 'Business Growth Assessment',
  description text,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.assessment_sections (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.assessment_versions(id) on delete cascade,
  slug text not null,
  title text not null,
  description text,
  display_order integer not null default 0,
  is_active boolean not null default true,
  unique(version_id, slug)
);

create table if not exists public.assessment_questions (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.assessment_sections(id) on delete cascade,
  question_text text not null,
  answer_type text not null default 'yes_partial_no_na' check (answer_type in ('yes_partial_no_na','maturity')),
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.assessment_tool_mappings (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.assessment_sections(id) on delete cascade,
  prompt_id uuid not null references public.prompts(id) on delete cascade,
  priority integer not null default 10,
  is_active boolean not null default true,
  unique(section_id, prompt_id)
);

create table if not exists public.assessment_responses (
  id uuid primary key default gen_random_uuid(),
  member_access_id uuid not null references public.member_app_access(id) on delete cascade,
  version_id uuid not null references public.assessment_versions(id),
  answers jsonb not null default '{}'::jsonb,
  completed_at timestamptz not null default now()
);
create index if not exists assessment_responses_member_idx on public.assessment_responses(member_access_id, completed_at desc);

create table if not exists public.assessment_results (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null unique references public.assessment_responses(id) on delete cascade,
  identified_strengths jsonb not null default '[]'::jsonb,
  improvement_areas jsonb not null default '[]'::jsonb,
  priority_ranking jsonb not null default '[]'::jsonb,
  actions_30_day jsonb not null default '[]'::jsonb,
  actions_90_day jsonb not null default '[]'::jsonb,
  future_agent_recommendations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.assessment_recommendations (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references public.assessment_responses(id) on delete cascade,
  prompt_id uuid not null references public.prompts(id),
  priority integer not null,
  is_locked boolean not null default false,
  required_tier_rank smallint not null references public.membership_tiers(rank),
  alternative_prompt_id uuid references public.prompts(id),
  reason text,
  created_at timestamptz not null default now(),
  unique(response_id, prompt_id)
);

create table if not exists public.saved_strategies (
  id uuid primary key default gen_random_uuid(),
  member_access_id uuid not null references public.member_app_access(id) on delete cascade,
  prompt_id uuid not null references public.prompts(id),
  title text not null,
  input_payload jsonb not null default '{}'::jsonb,
  strategy_text text not null,
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists saved_strategies_member_idx on public.saved_strategies(member_access_id, updated_at desc);

insert into public.saved_strategies(id,member_access_id,prompt_id,title,input_payload,strategy_text,created_at,updated_at)
select id,member_access_id,prompt_id,title,input_payload,output_text,created_at,updated_at from public.saved_outputs
on conflict (id) do nothing;

alter table public.assessment_versions enable row level security;
alter table public.assessment_sections enable row level security;
alter table public.assessment_questions enable row level security;
alter table public.assessment_tool_mappings enable row level security;
alter table public.assessment_responses enable row level security;
alter table public.assessment_results enable row level security;
alter table public.assessment_recommendations enable row level security;
alter table public.saved_strategies enable row level security;
revoke all on public.assessment_versions,public.assessment_sections,public.assessment_questions,public.assessment_tool_mappings,public.assessment_responses,public.assessment_results,public.assessment_recommendations,public.saved_strategies from anon,authenticated;

insert into public.assessment_versions(version_label,title,description,is_active)
values ('2026.1','Business Growth Assessment','Identify strengths, growth priorities, and the most relevant next actions.',true)
on conflict (version_label) do update set title=excluded.title,description=excluded.description,is_active=true;

with version as (select id from public.assessment_versions where version_label='2026.1'), seed(slug,title,description,display_order) as (values
('business-foundation','Business Foundation','Core direction, structure, and business fundamentals.',10),
('brand-market-position','Brand and Market Position','Clarity, differentiation, and market relevance.',20),
('marketing','Marketing','Consistent visibility and demand generation.',30),
('sales-business-development','Sales and Business Development','Pipeline, outreach, and revenue growth.',40),
('customer-retention','Customer Retention','Customer experience, loyalty, and repeat business.',50),
('operations','Operations','Repeatable delivery, systems, and capacity.',60),
('financial-readiness','Financial Readiness','Financial visibility and readiness for capital.',70),
('partnerships-networking','Partnerships and Networking','Relationships, referrals, and strategic collaboration.',80),
('government-corporate-readiness','Government and Corporate Readiness','Credentials and capacity for institutional buyers.',90),
('leadership-growth-planning','Leadership and Growth Planning','Leadership rhythm, decisions, and long-range planning.',100)
)
insert into public.assessment_sections(version_id,slug,title,description,display_order)
select version.id,seed.slug,seed.title,seed.description,seed.display_order from version cross join seed
on conflict (version_id,slug) do update set title=excluded.title,description=excluded.description,display_order=excluded.display_order,is_active=true;

with question_seed(section_slug,display_order,question_text) as (values
('business-foundation',10,'Do you have a clearly documented business model and primary offer?'),('business-foundation',20,'Are your near-term business goals specific and measurable?'),('business-foundation',30,'Are essential registrations, policies, and records current?'),('business-foundation',40,'Can your team explain the business priorities consistently?'),
('brand-market-position',10,'Is your value proposition clear to your ideal customer?'),('brand-market-position',20,'Does your brand communicate a consistent and credible identity?'),('brand-market-position',30,'Can customers easily understand what makes you different?'),('brand-market-position',40,'Do you regularly validate your positioning with market feedback?'),
('marketing',10,'Do you have a documented marketing plan tied to business goals?'),('marketing',20,'Do you publish useful content on a consistent schedule?'),('marketing',30,'Can you identify which channels generate qualified interest?'),('marketing',40,'Do your campaigns include clear calls to action and follow-up?'),
('sales-business-development',10,'Do you have a repeatable process for generating and qualifying leads?'),('sales-business-development',20,'Is your sales pipeline reviewed consistently?'),('sales-business-development',30,'Do you use structured outreach and follow-up messages?'),('sales-business-development',40,'Can you forecast likely revenue from current opportunities?'),
('customer-retention',10,'Do new customers receive a consistent onboarding experience?'),('customer-retention',20,'Do you collect and act on customer feedback?'),('customer-retention',30,'Do you track repeat business, renewals, or customer loss?'),('customer-retention',40,'Do you have a plan to deepen high-value customer relationships?'),
('operations',10,'Are your most important workflows documented?'),('operations',20,'Can the business deliver consistently as demand increases?'),('operations',30,'Are responsibilities and decision ownership clear?'),('operations',40,'Do you track operational quality, timing, and capacity?'),
('financial-readiness',10,'Do you review current financial statements regularly?'),('financial-readiness',20,'Do you maintain a practical cash-flow forecast?'),('financial-readiness',30,'Can you explain how additional capital would produce growth?'),('financial-readiness',40,'Are key financial and compliance documents organized?'),
('partnerships-networking',10,'Have you identified the partners most relevant to your growth goals?'),('partnerships-networking',20,'Do you have a repeatable referral strategy?'),('partnerships-networking',30,'Do you consistently follow up after networking conversations?'),('partnerships-networking',40,'Can you articulate mutual value in a partnership conversation?'),
('government-corporate-readiness',10,'Do you have a current capability statement?'),('government-corporate-readiness',20,'Are relevant registrations and certifications current?'),('government-corporate-readiness',30,'Can you document relevant past performance and delivery capacity?'),('government-corporate-readiness',40,'Do you have a process for evaluating solicitations and corporate opportunities?'),
('leadership-growth-planning',10,'Do you review strategic priorities on a consistent schedule?'),('leadership-growth-planning',20,'Are key performance measures visible to decision makers?'),('leadership-growth-planning',30,'Do you have a documented 12-month direction?'),('leadership-growth-planning',40,'Can leadership identify risks, decisions, and next actions clearly?')
)
insert into public.assessment_questions(section_id,question_text,display_order)
select s.id,q.question_text,q.display_order from question_seed q join public.assessment_sections s on s.slug=q.section_slug join public.assessment_versions v on v.id=s.version_id and v.version_label='2026.1'
where not exists (select 1 from public.assessment_questions existing where existing.section_id=s.id and existing.question_text=q.question_text);

with mapping(section_slug,tool_slug,priority) as (values
('brand-market-position','business-profile-enhancer',10),('brand-market-position','professional-business-bio',20),('brand-market-position','customer-value-proposition',30),('brand-market-position','tagline-generator',40),
('marketing','ideal-customer-profile',10),('marketing','seven-day-content-calendar',20),('marketing','social-media-post',30),('marketing','promotional-email',40),('marketing','linkedin-thought-leadership-post',50),('marketing','keyword-generator',60),
('sales-business-development','sales-outreach-message',10),('sales-business-development','referral-strategy-builder',20),('sales-business-development','customer-retention-plan',30),('sales-business-development','90-day-growth-plan',40),
('customer-retention','customer-retention-plan',10),('customer-retention','customer-faq-builder',20),
('government-corporate-readiness','capability-statement-outline',10),('government-corporate-readiness','vendor-readiness-assessment',20),('government-corporate-readiness','rfp-response-outline',30),('government-corporate-readiness','supplier-diversity-outreach',40),('government-corporate-readiness','corporate-partnership-pitch',50),
('leadership-growth-planning','basic-swot-analysis',10),('leadership-growth-planning','executive-business-summary',20),('leadership-growth-planning','executive-growth-brief',30),('leadership-growth-planning','12-month-strategic-plan',40),('leadership-growth-planning','market-expansion-strategy',50),('leadership-growth-planning','growth-roadmap',60),
('partnerships-networking','referral-strategy-builder',10),('partnerships-networking','corporate-partnership-pitch',20),
('business-foundation','business-profile-enhancer',10),('business-foundation','basic-swot-analysis',20),
('operations','90-day-growth-plan',10),('operations','growth-roadmap',20),
('financial-readiness','investment-readiness-plan',10),('financial-readiness','executive-business-summary',20)
)
insert into public.assessment_tool_mappings(section_id,prompt_id,priority)
select s.id,p.id,m.priority from mapping m join public.assessment_sections s on s.slug=m.section_slug join public.assessment_versions v on v.id=s.version_id and v.version_label='2026.1' join public.prompts p on p.slug=m.tool_slug
on conflict (section_id,prompt_id) do update set priority=excluded.priority,is_active=true;
