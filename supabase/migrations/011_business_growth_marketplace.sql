-- Three-layer member experience: included tools, recommended tools, and premium Marketplace services.
-- No pricing model, billing calculation, checkout, or payment processing is activated by this migration.

create table if not exists public.marketplace_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  display_order integer not null default 0,
  active boolean not null default true,
  coming_soon boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketplace_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.marketplace_categories(id),
  name text not null,
  slug text not null unique,
  description text not null,
  who_it_is_for text,
  helps_with jsonb not null default '[]'::jsonb,
  key_capabilities jsonb not null default '[]'::jsonb,
  profile_context text,
  expected_inputs jsonb not null default '[]'::jsonb,
  potential_outputs jsonb not null default '[]'::jsonb,
  is_premium boolean not null default true,
  thumbnail_url text,
  cta_label text not null default 'Learn More →',
  pricing_status text not null default 'Pricing Coming Soon',
  pricing_model text,
  price numeric(12,2),
  currency text,
  billing_interval text,
  credit_cost numeric(12,2),
  included_runs integer,
  trial_available boolean,
  purchase_url text,
  active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_items_json_arrays check (
    jsonb_typeof(helps_with) = 'array' and jsonb_typeof(key_capabilities) = 'array'
    and jsonb_typeof(expected_inputs) = 'array' and jsonb_typeof(potential_outputs) = 'array'
  ),
  constraint marketplace_items_pricing_model check (
    pricing_model is null or pricing_model in ('pay_per_use','monthly_add_on','credits','subscription_bundle')
  )
);

create table if not exists public.marketplace_usage (
  id uuid primary key default gen_random_uuid(),
  marketplace_item_id uuid not null references public.marketplace_items(id),
  member_app_access_id uuid references public.member_app_access(id),
  auth_user_id uuid references auth.users(id),
  agent_runs integer not null default 1,
  tokens_used bigint,
  estimated_ai_cost numeric(14,6),
  credits_used numeric(12,2),
  credits_remaining numeric(12,2),
  usage_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint marketplace_usage_owner check (member_app_access_id is not null or auth_user_id is not null)
);

alter table public.marketplace_categories enable row level security;
alter table public.marketplace_items enable row level security;
alter table public.marketplace_usage enable row level security;

insert into public.marketplace_categories (name,slug,description,display_order,active,coming_soon) values
  ('AI Services & Agents','ai-services-agents','Premium AI-powered research, monitoring, matching, and advisory capabilities.',1,true,false),
  ('Professional Services','professional-services','Future expert-led business support.',2,true,true),
  ('Member Services','member-services','Future services designed for D9Network members.',3,true,true),
  ('Partner Offers','partner-offers','Future offers from trusted D9Network partners.',4,true,true)
on conflict (slug) do update set name=excluded.name,description=excluded.description,display_order=excluded.display_order,active=excluded.active,coming_soon=excluded.coming_soon,updated_at=now();

with agent_category as (select id from public.marketplace_categories where slug='ai-services-agents'), seed(name,slug,description,who_it_is_for,helps_with,key_capabilities,profile_context,expected_inputs,potential_outputs,display_order) as (values
  ('Opportunity Discovery Agent','opportunity-discovery-agent','Find and prioritize grants, contracts, partnerships, and other business opportunities aligned with your Business Profile and growth goals.','Businesses seeking relevant growth opportunities without manually searching multiple sources.','["Opportunity discovery","Grant and contract prioritization","Partnership research"]'::jsonb,'["Search and organize potential opportunities","Prioritize alignment with business goals","Support ongoing opportunity monitoring"]'::jsonb,'Uses capabilities, markets, goals, certifications, and geographic reach from your Business Profile.','["Business priorities","Target markets","Opportunity preferences"]'::jsonb,'["Prioritized opportunity list","Alignment summaries","Suggested next actions"]'::jsonb,1),
  ('RFP Intelligence Agent','rfp-intelligence-agent','Analyze RFP requirements, identify risks, create compliance checklists, and help organize response strategy.','Businesses evaluating or preparing responses to formal solicitations.','["RFP qualification","Compliance planning","Response organization"]'::jsonb,'["Analyze requirements","Flag risks and deadlines","Create compliance checklists"]'::jsonb,'Uses capabilities, experience, certifications, and target markets from your Business Profile.','["RFP documents","Response goals","Team constraints"]'::jsonb,'["Compliance checklist","Risk summary","Response strategy outline"]'::jsonb,2),
  ('Partnership Intelligence Agent','partnership-intelligence-agent','Identify organizations and companies that may align with your capabilities, markets, and strategic growth goals.','Businesses seeking strategic, channel, corporate, or complementary partnerships.','["Partner discovery","Alignment research","Outreach prioritization"]'::jsonb,'["Research prospective partners","Assess strategic alignment","Organize relationship priorities"]'::jsonb,'Uses offerings, capabilities, audience, markets, and growth goals from your Business Profile.','["Partnership objectives","Preferred markets","Relationship criteria"]'::jsonb,'["Prospective partner list","Alignment rationale","Outreach priorities"]'::jsonb,3),
  ('Marketing Campaign Agent','marketing-campaign-agent','Build coordinated multi-channel marketing campaigns using your Business Profile, audience, goals, and brand context.','Businesses ready to coordinate a campaign across multiple marketing channels.','["Campaign planning","Message coordination","Channel execution"]'::jsonb,'["Develop campaign structure","Coordinate channel messaging","Recommend milestones and measures"]'::jsonb,'Uses your audience, positioning, offers, goals, and brand context.','["Campaign goal","Offer","Timing and channel preferences"]'::jsonb,'["Campaign plan","Channel briefs","Measurement framework"]'::jsonb,4),
  ('Business Growth Advisor','business-growth-advisor','Use your Business Profile, assessment results, goals, and saved strategies to recommend ongoing next actions.','Members who want ongoing, context-aware guidance across business priorities.','["Priority setting","Strategy follow-through","Ongoing next-action planning"]'::jsonb,'["Review saved context","Connect priorities across work","Recommend focused next actions"]'::jsonb,'Uses your Business Profile, Growth Assessment, goals, and saved strategies.','["Current constraints","Progress updates","Priority changes"]'::jsonb,'["Priority brief","Recommended next actions","Progress review"]'::jsonb,5),
  ('Referral Matching Agent','referral-matching-agent','Identify relevant D9Network members for potential referrals, strategic partnerships, and complementary business relationships.','Members seeking relevant referral and relationship opportunities inside the network.','["Referral discovery","Member matching","Complementary relationship building"]'::jsonb,'["Match complementary capabilities","Explain relationship relevance","Suggest connection priorities"]'::jsonb,'Uses your offerings, ideal customers, markets, and partnership goals.','["Referral goals","Target relationships","Match preferences"]'::jsonb,'["Potential match list","Match rationale","Suggested connection approach"]'::jsonb,6)
)
insert into public.marketplace_items (category_id,name,slug,description,who_it_is_for,helps_with,key_capabilities,profile_context,expected_inputs,potential_outputs,is_premium,cta_label,pricing_status,active,display_order)
select agent_category.id,seed.name,seed.slug,seed.description,seed.who_it_is_for,seed.helps_with,seed.key_capabilities,seed.profile_context,seed.expected_inputs,seed.potential_outputs,true,'Learn More →','Pricing Coming Soon',true,seed.display_order from seed cross join agent_category
on conflict (slug) do update set name=excluded.name,description=excluded.description,who_it_is_for=excluded.who_it_is_for,helps_with=excluded.helps_with,key_capabilities=excluded.key_capabilities,profile_context=excluded.profile_context,expected_inputs=excluded.expected_inputs,potential_outputs=excluded.potential_outputs,is_premium=true,cta_label='Learn More →',pricing_status='Pricing Coming Soon',active=true,display_order=excluded.display_order,updated_at=now();

revoke all on public.marketplace_categories, public.marketplace_items, public.marketplace_usage from anon, authenticated;
