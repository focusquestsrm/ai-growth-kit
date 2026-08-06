-- Complete Growth Kit MVP. Safe to run after 001 and 002.
alter table public.member_app_access add column if not exists source_active boolean not null default true;

alter table public.prompts add column if not exists status text;
alter table public.prompts add column if not exists marketplace_upgrade_message text;
update public.prompts set status = case when is_published then 'published' else 'draft' end where status is null;
alter table public.prompts alter column status set default 'draft';
alter table public.prompts alter column status set not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'prompts_status_check') then
    alter table public.prompts add constraint prompts_status_check check (status in ('draft','published','archived'));
  end if;
end $$;

create table if not exists public.prompt_questions (
  id uuid primary key default gen_random_uuid(),
  prompt_id uuid not null references public.prompts(id) on delete cascade,
  field_key text not null,
  label text not null,
  field_type text not null default 'textarea' check (field_type in ('text','textarea')),
  placeholder text,
  sort_order integer not null default 0,
  is_required boolean not null default true,
  unique(prompt_id, field_key)
);

create table if not exists public.saved_outputs (
  id uuid primary key default gen_random_uuid(),
  member_access_id uuid not null references public.member_app_access(id) on delete cascade,
  prompt_id uuid not null references public.prompts(id),
  title text not null,
  input_payload jsonb not null default '{}'::jsonb,
  output_text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists saved_outputs_member_idx on public.saved_outputs(member_access_id, created_at desc);

create table if not exists public.business_profiles (
  id uuid primary key default gen_random_uuid(),
  member_access_id uuid not null unique references public.member_app_access(id) on delete cascade,
  business_name text,
  website text,
  industry text,
  audience text,
  products_services text,
  brand_voice text,
  primary_goal text,
  updated_at timestamptz not null default now()
);

create table if not exists public.import_errors (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references public.import_batches(id) on delete cascade,
  row_number integer,
  severity text not null check (severity in ('ignored','warning','error')),
  code text not null,
  email text,
  bd_user_id text,
  membership text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists import_errors_batch_idx on public.import_errors(import_batch_id, row_number);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_auth_user_id uuid,
  actor_email text not null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_created_idx on public.audit_logs(created_at desc);

alter table public.prompt_questions enable row level security;
alter table public.saved_outputs enable row level security;
alter table public.business_profiles enable row level security;
alter table public.import_errors enable row level security;
alter table public.audit_logs enable row level security;

insert into public.prompt_categories(name,slug,description,sort_order,is_active) values
  ('Profile & Branding','profile-branding','Clarify your business identity, message, and market presence.',10,true),
  ('Marketing & Content','marketing-content','Create useful content and campaigns that build visibility.',20,true),
  ('Sales & Relationships','sales-relationships','Strengthen outreach, referrals, and customer relationships.',30,true),
  ('Strategy & Operations','strategy-operations','Turn goals into focused plans and repeatable systems.',40,true),
  ('Opportunities & Procurement','opportunities-procurement','Prepare for corporate, government, and partnership opportunities.',50,true),
  ('Leadership & Growth','leadership-growth','Communicate, decide, and grow with executive clarity.',60,true)
on conflict (slug) do update set name=excluded.name,description=excluded.description,sort_order=excluded.sort_order,is_active=true;

with seed(category_slug,title,slug,description,tier_rank,minutes,questions,template,marketplace) as (values
('profile-branding','Business Profile Enhancer','business-profile-enhancer','Strengthen a business profile for directories, websites, and introductions.',1,10,'[{"key":"current_profile","label":"Paste your current business profile.","type":"textarea"},{"key":"audience","label":"Who should this profile persuade?","type":"textarea"},{"key":"strengths","label":"What strengths or proof points must stand out?","type":"textarea"}]'::jsonb,'Rewrite this business profile for clarity and credibility. Current profile: {{current_profile}}. Audience: {{audience}}. Strengths: {{strengths}}. Provide a polished 120-word version and a 40-word version.','Unlock a connected Brand Agent that maintains your approved company narrative everywhere.'),
('profile-branding','Elevator Pitch Creator','elevator-pitch-creator','Create a concise, confident introduction for networking conversations.',1,8,'[{"key":"offer","label":"What does your business offer?","type":"textarea"},{"key":"audience","label":"Who do you serve?","type":"textarea"},{"key":"result","label":"What result do clients receive?","type":"textarea"}]'::jsonb,'Create three elevator pitches for this business. Offer: {{offer}}. Audience: {{audience}}. Result: {{result}}. Provide 15-second, 30-second, and conversational versions.','A future Networking Agent can tailor your pitch to every room and contact.'),
('profile-branding','Tagline Generator','tagline-generator','Generate memorable tagline directions aligned with your value.',1,8,'[{"key":"business","label":"Describe your business in one paragraph.","type":"textarea"},{"key":"promise","label":"What promise do you make to customers?","type":"textarea"},{"key":"tone","label":"What tone should the tagline use?","type":"text"}]'::jsonb,'Generate 15 distinctive taglines. Business: {{business}}. Promise: {{promise}}. Tone: {{tone}}. Group them into direct, aspirational, and memorable approaches and explain the strongest three.','Upgrade to a Brand Agent for message testing and reusable brand standards.'),
('marketing-content','Social Media Post','social-media-post','Turn a business update into an engaging social post.',1,8,'[{"key":"topic","label":"What should the post communicate?","type":"textarea"},{"key":"platform","label":"Which social platform is this for?","type":"text"},{"key":"action","label":"What should readers do next?","type":"text"}]'::jsonb,'Write a social media post. Topic: {{topic}}. Platform: {{platform}}. Desired action: {{action}}. Include a strong opening, useful body, natural call to action, and five relevant hashtags.','A future Content Agent can schedule, repurpose, and measure your posts.'),
('sales-relationships','Customer FAQ Builder','customer-faq-builder','Create helpful answers to common customer questions.',1,12,'[{"key":"offer","label":"Describe the product or service.","type":"textarea"},{"key":"questions","label":"List common questions or objections.","type":"textarea"},{"key":"policies","label":"List any important policies or boundaries.","type":"textarea"}]'::jsonb,'Build a customer FAQ. Offer: {{offer}}. Questions: {{questions}}. Policies: {{policies}}. Write concise, reassuring answers and suggest three missing questions customers may ask.','Upgrade to a Customer Support Agent for an always-current knowledge base.'),
('marketing-content','Ideal Customer Profile','ideal-customer-profile','Define the customer most likely to value and buy your offer.',1,12,'[{"key":"offer","label":"What do you sell?","type":"textarea"},{"key":"best_customers","label":"Describe your best current customers.","type":"textarea"},{"key":"problem","label":"What urgent problem do you solve?","type":"textarea"}]'::jsonb,'Create an ideal customer profile. Offer: {{offer}}. Best customers: {{best_customers}}. Problem solved: {{problem}}. Include firmographics or demographics, motivations, objections, buying triggers, and where to reach them.','A future Market Intelligence Agent can enrich this profile with live market signals.'),
('strategy-operations','Basic SWOT Analysis','basic-swot-analysis','Assess strengths, weaknesses, opportunities, and threats.',1,15,'[{"key":"business","label":"Describe the business and current position.","type":"textarea"},{"key":"goal","label":"What goal are you evaluating?","type":"textarea"},{"key":"market","label":"Describe the market and competitors.","type":"textarea"}]'::jsonb,'Conduct a practical SWOT analysis. Business: {{business}}. Goal: {{goal}}. Market: {{market}}. Provide four specific points per quadrant and the three most important 90-day actions.','Upgrade to a Strategy Agent for ongoing competitive monitoring and action tracking.'),
('profile-branding','Professional Business Bio','professional-business-bio','Create polished bios for websites, LinkedIn, and speaking opportunities.',2,12,'[{"key":"role","label":"Describe your business and role.","type":"textarea"},{"key":"credentials","label":"List experience, credentials, and achievements.","type":"textarea"},{"key":"tone","label":"What tone should the bio use?","type":"text"}]'::jsonb,'Write professional bios using these details. Role: {{role}}. Credentials: {{credentials}}. Tone: {{tone}}. Provide 100-word, 50-word, and LinkedIn About versions.','A future Brand Agent can maintain bios across channels as your achievements grow.'),
('profile-branding','Customer Value Proposition','customer-value-proposition','Express why the right customer should choose your business.',2,12,'[{"key":"customer","label":"Who is the target customer?","type":"textarea"},{"key":"problem","label":"What costly problem do they face?","type":"textarea"},{"key":"solution","label":"How does your offer solve it differently?","type":"textarea"}]'::jsonb,'Develop a customer value proposition. Customer: {{customer}}. Problem: {{problem}}. Differentiated solution: {{solution}}. Provide a value proposition statement, proof points, and three message variations.','Upgrade to a Positioning Agent for segment-specific value propositions.'),
('marketing-content','Keyword Generator','keyword-generator','Build a focused keyword set for content and discoverability.',2,10,'[{"key":"business","label":"Describe the business and services.","type":"textarea"},{"key":"location","label":"What geography do you serve?","type":"text"},{"key":"intent","label":"What should searchers be trying to accomplish?","type":"textarea"}]'::jsonb,'Create a keyword strategy. Business: {{business}}. Geography: {{location}}. Search intent: {{intent}}. Group 30 keywords by awareness, consideration, and purchase intent and suggest five content topics.','A future SEO Agent can validate demand and track keyword performance.'),
('marketing-content','Seven-Day Content Calendar','seven-day-content-calendar','Plan a useful week of content for a priority channel.',2,15,'[{"key":"business","label":"Describe the business and audience.","type":"textarea"},{"key":"platform","label":"Which platform is primary?","type":"text"},{"key":"goal","label":"What should this week accomplish?","type":"textarea"}]'::jsonb,'Create a seven-day content calendar. Business: {{business}}. Platform: {{platform}}. Goal: {{goal}}. Include daily theme, hook, format, caption direction, and call to action.','Upgrade to a Content Agent for monthly planning, scheduling, and repurposing.'),
('marketing-content','Promotional Email','promotional-email','Write a persuasive email without sounding overly promotional.',2,10,'[{"key":"offer","label":"What are you promoting?","type":"textarea"},{"key":"audience","label":"Who will receive the email?","type":"textarea"},{"key":"deadline","label":"What timing or urgency applies?","type":"text"}]'::jsonb,'Write a promotional email. Offer: {{offer}}. Audience: {{audience}}. Timing: {{deadline}}. Include five subject lines, preview text, concise body copy, and one clear call to action.','A future Email Agent can segment, test, and optimize campaigns.'),
('marketing-content','LinkedIn Thought-Leadership Post','linkedin-thought-leadership-post','Turn professional insight into a credible LinkedIn post.',2,12,'[{"key":"insight","label":"What insight or point of view will you share?","type":"textarea"},{"key":"evidence","label":"What example or evidence supports it?","type":"textarea"},{"key":"audience","label":"Who should engage with this post?","type":"textarea"}]'::jsonb,'Write a LinkedIn thought-leadership post. Insight: {{insight}}. Evidence: {{evidence}}. Audience: {{audience}}. Use a strong hook, clear argument, practical takeaway, and conversation-starting close.','Upgrade to a Thought Leadership Agent for a consistent executive content system.'),
('sales-relationships','Sales Outreach Message','sales-outreach-message','Create a relevant first-touch message for a prospective buyer.',2,10,'[{"key":"prospect","label":"Describe the prospect and their likely priority.","type":"textarea"},{"key":"offer","label":"What relevant value can you offer?","type":"textarea"},{"key":"proof","label":"What proof or credibility can you mention?","type":"textarea"}]'::jsonb,'Write a concise sales outreach message. Prospect: {{prospect}}. Value: {{offer}}. Proof: {{proof}}. Provide email and LinkedIn versions with a low-friction next step.','A future Sales Agent can personalize sequences and track follow-up.'),
('sales-relationships','Referral Strategy Builder','referral-strategy-builder','Create a repeatable approach for earning introductions.',2,15,'[{"key":"business","label":"Describe the business and ideal referral.","type":"textarea"},{"key":"partners","label":"Who could refer this type of customer?","type":"textarea"},{"key":"value","label":"What value can you return to referral partners?","type":"textarea"}]'::jsonb,'Build a referral strategy. Business and ideal referral: {{business}}. Potential partners: {{partners}}. Mutual value: {{value}}. Include positioning, ask scripts, follow-up cadence, and tracking measures.','Upgrade to a Relationship Agent for referral reminders and partner intelligence.'),
('sales-relationships','Customer Retention Plan','customer-retention-plan','Strengthen loyalty, repeat business, and customer value.',2,18,'[{"key":"customers","label":"Describe your current customer base.","type":"textarea"},{"key":"churn","label":"Why might customers leave or disengage?","type":"textarea"},{"key":"capacity","label":"What retention resources can you support?","type":"textarea"}]'::jsonb,'Create a customer retention plan. Customers: {{customers}}. Churn risks: {{churn}}. Capacity: {{capacity}}. Include onboarding, communication, loyalty actions, recovery steps, and five KPIs.','A future Customer Success Agent can monitor health and trigger retention actions.'),
('strategy-operations','90-Day Growth Plan','90-day-growth-plan','Turn a growth objective into weekly actions and measurable milestones.',2,18,'[{"key":"goal","label":"What is the 90-day goal?","type":"textarea"},{"key":"resources","label":"What resources are available?","type":"textarea"},{"key":"obstacles","label":"What obstacles are likely?","type":"textarea"}]'::jsonb,'Create a realistic 90-day growth plan. Goal: {{goal}}. Resources: {{resources}}. Obstacles: {{obstacles}}. Include monthly milestones, weekly actions, owners, and KPIs.','Upgrade to a Strategy Agent for progress tracking and adaptive recommendations.'),
('marketing-content','Event Promotion Kit','event-promotion-kit','Build coordinated messaging to drive event registrations.',3,20,'[{"key":"event","label":"Describe the event and its value.","type":"textarea"},{"key":"audience","label":"Who should attend?","type":"textarea"},{"key":"channels","label":"Which promotion channels are available?","type":"textarea"}]'::jsonb,'Create an event promotion kit. Event: {{event}}. Audience: {{audience}}. Channels: {{channels}}. Include positioning, landing-page copy, three emails, five social posts, partner copy, and a timeline.','A future Event Agent can coordinate promotion, registration, and follow-up.'),
('opportunities-procurement','Corporate Partnership Pitch','corporate-partnership-pitch','Frame a mutually valuable partnership for a corporate prospect.',3,20,'[{"key":"partner","label":"Describe the target corporate partner.","type":"textarea"},{"key":"opportunity","label":"What partnership are you proposing?","type":"textarea"},{"key":"value","label":"What measurable value will each party receive?","type":"textarea"}]'::jsonb,'Create a corporate partnership pitch. Partner: {{partner}}. Opportunity: {{opportunity}}. Mutual value: {{value}}. Include executive summary, strategic fit, activation plan, measures, and next-step email.','Upgrade to a Partnership Agent for account research and relationship planning.'),
('opportunities-procurement','Sponsorship Outreach','sponsorship-outreach','Create a benefits-led sponsorship approach.',3,18,'[{"key":"opportunity","label":"What needs sponsorship?","type":"textarea"},{"key":"sponsor","label":"Who is the prospective sponsor?","type":"textarea"},{"key":"ask","label":"What are you requesting?","type":"textarea"}]'::jsonb,'Create a sponsorship outreach package. Opportunity: {{opportunity}}. Sponsor: {{sponsor}}. Ask: {{ask}}. Include email, value proposition, three sponsorship levels, benefits, and follow-up.','A future Sponsorship Agent can match prospects and manage fulfillment.'),
('opportunities-procurement','Capability Statement Outline','capability-statement-outline','Build the structure corporate and government buyers expect.',3,20,'[{"key":"business","label":"Describe core services and customers.","type":"textarea"},{"key":"differentiators","label":"List differentiators and certifications.","type":"textarea"},{"key":"performance","label":"Summarize relevant past performance.","type":"textarea"}]'::jsonb,'Build a one-page capability statement outline. Business: {{business}}. Differentiators: {{differentiators}}. Past performance: {{performance}}. Include core competencies, company data, NAICS placeholders, and missing-information flags.','Upgrade to a Procurement Agent for opportunity matching and reusable response content.'),
('opportunities-procurement','Vendor-Readiness Assessment','vendor-readiness-assessment','Identify gaps before pursuing supplier opportunities.',3,20,'[{"key":"business","label":"Describe the business and target buyers.","type":"textarea"},{"key":"credentials","label":"List certifications, insurance, and registrations.","type":"textarea"},{"key":"capacity","label":"Describe delivery capacity and past performance.","type":"textarea"}]'::jsonb,'Assess vendor readiness. Business and buyers: {{business}}. Credentials: {{credentials}}. Capacity: {{capacity}}. Provide a readiness score, critical gaps, evidence checklist, and 60-day action plan.','A future Procurement Agent can maintain credentials and flag matched opportunities.'),
('opportunities-procurement','RFP Response Outline','rfp-response-outline','Organize a compliant and persuasive proposal response.',3,25,'[{"key":"rfp","label":"Summarize the solicitation and requirements.","type":"textarea"},{"key":"solution","label":"Describe your proposed solution.","type":"textarea"},{"key":"proof","label":"List proof, team strengths, and past performance.","type":"textarea"}]'::jsonb,'Create an RFP response outline. Requirements: {{rfp}}. Solution: {{solution}}. Proof: {{proof}}. Include compliance matrix, executive summary structure, response sections, evidence needs, risks, and review checklist.','Upgrade to a Proposal Agent for compliance checks and collaborative response development.'),
('leadership-growth','Executive Business Summary','executive-business-summary','Summarize performance, priorities, risks, and decisions.',4,20,'[{"key":"business","label":"Describe the business and current position.","type":"textarea"},{"key":"performance","label":"Provide key performance information.","type":"textarea"},{"key":"priorities","label":"What decisions or priorities need attention?","type":"textarea"}]'::jsonb,'Write a one-page executive business summary. Business: {{business}}. Performance: {{performance}}. Priorities: {{priorities}}. Include current position, highlights, risks, three priorities, and one decision recommendation.','A future Executive Agent can maintain a live leadership briefing.'),
('leadership-growth','Executive Growth Brief','executive-growth-brief','Prepare a concise brief on growth performance and next moves.',4,20,'[{"key":"results","label":"What growth results have been achieved?","type":"textarea"},{"key":"pipeline","label":"What opportunities are in the pipeline?","type":"textarea"},{"key":"constraints","label":"What constraints require leadership attention?","type":"textarea"}]'::jsonb,'Prepare an executive growth brief. Results: {{results}}. Pipeline: {{pipeline}}. Constraints: {{constraints}}. Include scorecard, insights, forecast, risks, and recommended decisions.','Upgrade to an Executive Agent for automated scorecards and decision support.'),
('strategy-operations','12-Month Strategic Plan','12-month-strategic-plan','Translate a long-term direction into quarterly priorities.',4,30,'[{"key":"vision","label":"What should be true in 12 months?","type":"textarea"},{"key":"baseline","label":"Describe the current baseline and resources.","type":"textarea"},{"key":"risks","label":"What risks or constraints must be planned for?","type":"textarea"}]'::jsonb,'Create a 12-month strategic plan. Vision: {{vision}}. Baseline: {{baseline}}. Risks: {{risks}}. Include strategic pillars, quarterly objectives, initiatives, owners, KPIs, dependencies, and review cadence.','A future Strategy Agent can track execution and refresh forecasts continuously.'),
('leadership-growth','Board or Leadership Update','board-leadership-update','Communicate results and decisions clearly to leadership.',4,20,'[{"key":"period","label":"What period and goals does this update cover?","type":"textarea"},{"key":"results","label":"Summarize results, wins, and misses.","type":"textarea"},{"key":"decisions","label":"What decisions or support are required?","type":"textarea"}]'::jsonb,'Create a board or leadership update. Period and goals: {{period}}. Results: {{results}}. Decisions: {{decisions}}. Include executive summary, scorecard, insights, risks, asks, and next-period priorities.','Upgrade to an Executive Reporting Agent for recurring board-ready updates.'),
('leadership-growth','Market Expansion Strategy','market-expansion-strategy','Evaluate and plan entry into a new market.',4,30,'[{"key":"market","label":"Describe the target market or geography.","type":"textarea"},{"key":"offer","label":"Which offer will enter the market?","type":"textarea"},{"key":"evidence","label":"What evidence, assets, or partnerships are available?","type":"textarea"}]'::jsonb,'Create a market expansion strategy. Market: {{market}}. Offer: {{offer}}. Evidence and assets: {{evidence}}. Include attractiveness, segments, entry options, assumptions, risks, 12-month roadmap, and decision gates.','A future Market Intelligence Agent can add live market and competitor data.'),
('leadership-growth','Economic Impact Narrative','economic-impact-narrative','Explain the broader economic value created by the business.',4,25,'[{"key":"business","label":"Describe the business, reach, and communities served.","type":"textarea"},{"key":"impact","label":"List jobs, spending, revenue, or community outcomes.","type":"textarea"},{"key":"audience","label":"Who will receive this narrative?","type":"textarea"}]'::jsonb,'Write an economic impact narrative. Business: {{business}}. Impact data: {{impact}}. Audience: {{audience}}. Distinguish direct, indirect, and community effects, avoid unsupported claims, identify missing data, and provide an executive summary.','Upgrade to an Impact Agent for data collection and stakeholder-ready reporting.')
)
insert into public.prompts(category_id,title,slug,description,user_prompt_template,form_schema,minimum_tier_rank,estimated_minutes,tags,sort_order,is_featured,is_published,status,marketplace_upgrade_message)
select c.id,s.title,s.slug,s.description,s.template,s.questions,s.tier_rank,s.minutes,array[s.category_slug],row_number() over(order by s.tier_rank,s.title)::int,true,true,'published',s.marketplace
from seed s join public.prompt_categories c on c.slug=s.category_slug
on conflict (slug) do update set category_id=excluded.category_id,title=excluded.title,description=excluded.description,user_prompt_template=excluded.user_prompt_template,
 form_schema=excluded.form_schema,minimum_tier_rank=excluded.minimum_tier_rank,estimated_minutes=excluded.estimated_minutes,is_published=true,status='published',marketplace_upgrade_message=excluded.marketplace_upgrade_message,updated_at=now();

insert into public.prompt_questions(prompt_id,field_key,label,field_type,sort_order,is_required)
select p.id,q.value->>'key',q.value->>'label',coalesce(q.value->>'type','textarea'),q.ordinality::int,true
from public.prompts p cross join lateral jsonb_array_elements(p.form_schema) with ordinality q(value,ordinality)
where p.status='published'
on conflict (prompt_id,field_key) do update set label=excluded.label,field_type=excluded.field_type,sort_order=excluded.sort_order;

revoke all on public.prompt_questions,public.saved_outputs,public.business_profiles,public.import_errors,public.audit_logs from anon,authenticated;
