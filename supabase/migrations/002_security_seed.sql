alter table public.user_roles add column if not exists auth_user_id uuid;
create index if not exists user_roles_auth_user_idx on public.user_roles(auth_user_id);
create unique index if not exists member_app_access_auth_user_unique_idx on public.member_app_access(auth_user_id) where auth_user_id is not null;
create unique index if not exists user_roles_unique_assignment_idx
  on public.user_roles(normalized_email, role, (coalesce(organization_id, '')));

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_auth_user_id uuid,
  actor_email text not null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_events_created_idx on public.audit_events(created_at desc);
alter table public.audit_events enable row level security;

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists member_app_access_updated on public.member_app_access;
create trigger member_app_access_updated before update on public.member_app_access for each row execute function public.set_updated_at();
drop trigger if exists prompts_updated on public.prompts;
create trigger prompts_updated before update on public.prompts for each row execute function public.set_updated_at();

insert into public.prompt_categories(name,slug,description,sort_order) values
  ('Brand & Visibility','brand-visibility','Clarify your message and strengthen market visibility.',10),
  ('Marketing & Sales','marketing-sales','Build campaigns and conversations that create demand.',20),
  ('Operations','operations','Create repeatable systems that save time and reduce friction.',30),
  ('Strategy','strategy','Turn goals and insights into focused action.',40),
  ('Opportunity Readiness','opportunity-readiness','Prepare for corporate, government, and partnership opportunities.',50),
  ('Leadership','leadership','Communicate and decide with executive clarity.',60)
on conflict (slug) do update set name=excluded.name, description=excluded.description, sort_order=excluded.sort_order;

insert into public.prompts(category_id,title,slug,description,user_prompt_template,form_schema,minimum_tier_rank,estimated_minutes,tags,sort_order,is_featured,is_published)
values
  ((select id from public.prompt_categories where slug='brand-visibility'),'Brand Message Builder','brand-message-builder','Turn your expertise into a clear, memorable business message.',
   'Act as a brand strategist. Business: {{business}}. Audience: {{audience}}. Difference: {{difference}}. Outcome: {{outcome}}. Create a concise positioning statement, a one-sentence elevator pitch, and three supporting messages.',
   '[{"key":"business","label":"What does your business offer?","type":"textarea"},{"key":"audience","label":"Who is your ideal customer?","type":"textarea"},{"key":"difference","label":"What makes your approach different?","type":"textarea"},{"key":"outcome","label":"What outcome do customers receive?","type":"textarea"}]',1,10,array['branding','positioning'],10,true,true),
  ((select id from public.prompt_categories where slug='marketing-sales'),'30-Day Content Plan','30-day-content-plan','Create a practical month of content around your goals.',
   'Create a 30-day content plan. Business: {{business}}. Goal: {{goal}}. Channels: {{channels}}. Voice: {{voice}}. Include weekly themes, daily post ideas, calls to action, and simple success measures.',
   '[{"key":"business","label":"Describe your business and audience.","type":"textarea"},{"key":"goal","label":"What is the primary goal?","type":"text"},{"key":"channels","label":"Which channels do you use?","type":"text"},{"key":"voice","label":"Describe your brand voice.","type":"text"}]',1,12,array['content','marketing'],20,true,true),
  ((select id from public.prompt_categories where slug='operations'),'Standard Operating Procedure Builder','sop-builder','Document a repeatable process your team can follow.',
   'Create a clear standard operating procedure. Process: {{process}}. Owner: {{owner}}. Inputs: {{inputs}}. Success: {{success}}. Include purpose, prerequisites, numbered steps, quality checks, exceptions, and review cadence.',
   '[{"key":"process","label":"Which process should be documented?","type":"textarea"},{"key":"owner","label":"Who owns the process?","type":"text"},{"key":"inputs","label":"What inputs or tools are required?","type":"textarea"},{"key":"success","label":"How is success measured?","type":"textarea"}]',2,15,array['operations','systems'],30,true,true),
  ((select id from public.prompt_categories where slug='strategy'),'90-Day Growth Plan','90-day-growth-plan','Turn a growth objective into weekly actions and measurable milestones.',
   'Create a realistic 90-day growth plan. Goal: {{goal}}. Resources: {{resources}}. Weekly capacity: {{capacity}}. Obstacles: {{obstacles}}. Include one objective, three monthly milestones, weekly actions, owners, and KPIs.',
   '[{"key":"goal","label":"What is the 90-day goal?","type":"textarea"},{"key":"resources","label":"What resources are available?","type":"textarea"},{"key":"capacity","label":"How much time can be committed weekly?","type":"text"},{"key":"obstacles","label":"What obstacles are likely?","type":"textarea"}]',2,15,array['strategy','planning'],40,true,true),
  ((select id from public.prompt_categories where slug='opportunity-readiness'),'Capability Statement Outline','capability-statement-outline','Build the structure corporate and government buyers expect.',
   'Act as a procurement consultant. Build a one-page capability statement outline. Business: {{business}}. Differentiators: {{differentiators}}. Certifications: {{certifications}}. Past performance: {{performance}}. Include core competencies, company data, NAICS placeholders, and missing-information flags.',
   '[{"key":"business","label":"Describe the business and core services.","type":"textarea"},{"key":"differentiators","label":"List differentiators.","type":"textarea"},{"key":"certifications","label":"List certifications.","type":"textarea"},{"key":"performance","label":"Summarize past performance.","type":"textarea"}]',3,18,array['procurement','capability'],50,true,true),
  ((select id from public.prompt_categories where slug='leadership'),'Executive Business Summary','executive-business-summary','Produce a leadership-grade summary of performance, priorities, and decisions.',
   'Write a one-page executive business summary. Business: {{business}}. Performance: {{performance}}. Goal: {{goal}}. Challenges: {{challenges}}. Include current position, highlights, three strategic priorities, risks, and one decision recommendation.',
   '[{"key":"business","label":"Describe the business.","type":"textarea"},{"key":"performance","label":"Provide key performance numbers.","type":"textarea"},{"key":"goal","label":"What is the main goal?","type":"textarea"},{"key":"challenges","label":"What are the top challenges?","type":"textarea"}]',4,20,array['leadership','executive'],60,true,true)
on conflict (slug) do update set title=excluded.title, description=excluded.description, user_prompt_template=excluded.user_prompt_template,
  form_schema=excluded.form_schema, minimum_tier_rank=excluded.minimum_tier_rank, is_published=excluded.is_published, updated_at=now();

revoke all on public.member_app_access, public.prompts, public.prompt_categories, public.prompt_generations,
  public.user_roles, public.import_batches, public.audit_events from anon, authenticated;
