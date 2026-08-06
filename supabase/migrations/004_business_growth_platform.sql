-- D9Network AI Business Growth Platform: Sprint 1 and Sprint 2.
-- Safe to run after migrations 001, 002, and 003.

alter table public.prompts add column if not exists output_format text;

alter table public.business_profiles add column if not exists business_description text;
alter table public.business_profiles add column if not exists products text;
alter table public.business_profiles add column if not exists services text;
alter table public.business_profiles add column if not exists years_in_business integer;
alter table public.business_profiles add column if not exists target_market text;
alter table public.business_profiles add column if not exists ideal_customer text;
alter table public.business_profiles add column if not exists business_goals text;
alter table public.business_profiles add column if not exists business_stage text;
alter table public.business_profiles add column if not exists geographic_market text;
alter table public.business_profiles add column if not exists social_media text;
alter table public.business_profiles add column if not exists certifications text;
alter table public.business_profiles add column if not exists minority_owned_status text;
alter table public.business_profiles add column if not exists small_business_status text;

update public.business_profiles set
  products = coalesce(products, products_services),
  ideal_customer = coalesce(ideal_customer, audience),
  business_goals = coalesce(business_goals, primary_goal)
where products is null or ideal_customer is null or business_goals is null;

create table if not exists public.favorite_tools (
  id uuid primary key default gen_random_uuid(),
  member_access_id uuid not null references public.member_app_access(id) on delete cascade,
  prompt_id uuid not null references public.prompts(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(member_access_id, prompt_id)
);

create table if not exists public.platform_feedback (
  id uuid primary key default gen_random_uuid(),
  member_access_id uuid references public.member_app_access(id) on delete set null,
  page text not null,
  prompt_id uuid references public.prompts(id) on delete set null,
  saved_output_id uuid references public.saved_outputs(id) on delete set null,
  rating smallint check (rating between 1 and 5),
  feedback_type text not null default 'suggestion' check (feedback_type in ('suggestion','strategy_rating','issue')),
  comments text,
  status text not null default 'new' check (status in ('new','reviewed','resolved')),
  created_at timestamptz not null default now()
);

create table if not exists public.business_health_assessments (
  id uuid primary key default gen_random_uuid(),
  member_access_id uuid not null references public.member_app_access(id) on delete cascade,
  marketing_score smallint not null check (marketing_score between 1 and 5),
  sales_score smallint not null check (sales_score between 1 and 5),
  operations_score smallint not null check (operations_score between 1 and 5),
  networking_score smallint not null check (networking_score between 1 and 5),
  leadership_score smallint not null check (leadership_score between 1 and 5),
  financial_readiness_score smallint not null check (financial_readiness_score between 1 and 5),
  overall_score numeric(3,2) not null,
  created_at timestamptz not null default now()
);
create index if not exists business_health_member_idx on public.business_health_assessments(member_access_id, created_at desc);

alter table public.favorite_tools enable row level security;
alter table public.platform_feedback enable row level security;
alter table public.business_health_assessments enable row level security;
revoke all on public.favorite_tools, public.platform_feedback, public.business_health_assessments from anon, authenticated;

-- Align existing catalog entries with the official member-facing tool names.
update public.prompts set title='7-Day Content Calendar' where slug='seven-day-content-calendar';
update public.prompts set title='LinkedIn Thought Leadership' where slug='linkedin-thought-leadership-post';
update public.prompts set title='Sales Outreach Campaign' where slug='sales-outreach-message';
update public.prompts set title='Referral Strategy' where slug='referral-strategy-builder';
update public.prompts set title='Corporate Partnership Strategy' where slug='corporate-partnership-pitch';
update public.prompts set title='Capability Statement Builder' where slug='capability-statement-outline';
update public.prompts set title='Vendor Readiness Assessment' where slug='vendor-readiness-assessment';
update public.prompts set title='Board Presentation' where slug='board-leadership-update';

with additions(category_slug,title,slug,description,tier_rank,minutes,questions,template,marketplace) as (values
('opportunities-procurement','Supplier Diversity Outreach','supplier-diversity-outreach','Create credible outreach for supplier diversity programs.',3,18,'[{"key":"buyer","label":"Which buyer or supplier diversity program are you targeting?","type":"textarea"},{"key":"capabilities","label":"Which capabilities and certifications are most relevant?","type":"textarea"},{"key":"proof","label":"What past performance or proof can you share?","type":"textarea"}]'::jsonb,'Create a supplier diversity outreach strategy. Buyer: {{buyer}}. Capabilities and certifications: {{capabilities}}. Proof: {{proof}}. Include positioning, email copy, a follow-up cadence, and a readiness checklist.','A future Opportunity Agent can match certifications and capabilities to active programs.'),
('leadership-growth','Executive Presentation','executive-presentation','Shape a clear executive presentation for a high-stakes audience.',3,25,'[{"key":"audience","label":"Who is the executive audience?","type":"textarea"},{"key":"objective","label":"What decision or outcome should the presentation drive?","type":"textarea"},{"key":"evidence","label":"What evidence and insights should be included?","type":"textarea"}]'::jsonb,'Create an executive presentation outline. Audience: {{audience}}. Objective: {{objective}}. Evidence: {{evidence}}. Include slide titles, key messages, recommended visuals, decision points, and speaker notes.','A future Executive Agent can maintain live presentation data and audience-specific narratives.'),
('leadership-growth','Investment Readiness Plan','investment-readiness-plan','Assess and strengthen readiness for lenders and investors.',4,30,'[{"key":"capital","label":"What capital is needed and how will it be used?","type":"textarea"},{"key":"financials","label":"Summarize financial performance and projections.","type":"textarea"},{"key":"evidence","label":"What traction, team strengths, and supporting documents exist?","type":"textarea"}]'::jsonb,'Create an investment readiness plan. Capital need: {{capital}}. Financials: {{financials}}. Evidence: {{evidence}}. Include readiness score, gaps, document checklist, narrative priorities, risks, and a 90-day action plan.','A future Capital Readiness Agent can organize documents and monitor readiness milestones.'),
('strategy-operations','Growth Roadmap','growth-roadmap','Create a sequenced roadmap from current position to growth goals.',4,30,'[{"key":"destination","label":"What growth outcome should be achieved?","type":"textarea"},{"key":"baseline","label":"Describe the current position, resources, and constraints.","type":"textarea"},{"key":"priorities","label":"Which opportunities or priorities matter most?","type":"textarea"}]'::jsonb,'Create a growth roadmap. Destination: {{destination}}. Baseline: {{baseline}}. Priorities: {{priorities}}. Include phases, milestones, dependencies, measures, decision gates, and the next five actions.','A future Strategy Agent can track milestones and adjust the roadmap as conditions change.')
)
insert into public.prompts(category_id,title,slug,description,user_prompt_template,form_schema,minimum_tier_rank,estimated_minutes,tags,sort_order,is_featured,is_published,status,marketplace_upgrade_message,output_format)
select c.id,a.title,a.slug,a.description,a.template,a.questions,a.tier_rank,a.minutes,array[a.category_slug],900+row_number() over(order by a.tier_rank,a.title)::int,true,true,'published',a.marketplace,'Structured recommendations with an executive summary, prioritized actions, measurable outcomes, and next steps.'
from additions a join public.prompt_categories c on c.slug=a.category_slug
on conflict (slug) do update set title=excluded.title,description=excluded.description,user_prompt_template=excluded.user_prompt_template,form_schema=excluded.form_schema,minimum_tier_rank=excluded.minimum_tier_rank,estimated_minutes=excluded.estimated_minutes,status='published',is_published=true,marketplace_upgrade_message=excluded.marketplace_upgrade_message,output_format=excluded.output_format,updated_at=now();

update public.prompts
set output_format=coalesce(output_format,'Structured business growth recommendations with a concise summary, prioritized actions, examples, measurable outcomes, and next steps.')
where status='published';

insert into public.prompt_questions(prompt_id,field_key,label,field_type,sort_order,is_required)
select p.id,q.value->>'key',q.value->>'label',coalesce(q.value->>'type','textarea'),q.ordinality::int,true
from public.prompts p cross join lateral jsonb_array_elements(p.form_schema) with ordinality q(value,ordinality)
where p.slug in ('supplier-diversity-outreach','executive-presentation','investment-readiness-plan','growth-roadmap')
on conflict (prompt_id,field_key) do update set label=excluded.label,field_type=excluded.field_type,sort_order=excluded.sort_order;
