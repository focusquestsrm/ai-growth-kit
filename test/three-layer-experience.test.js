const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'styles.css'), 'utf8');
const promptsApi = fs.readFileSync(path.join(root, 'netlify', 'functions', 'prompts-list.js'), 'utf8');
const marketplaceApi = fs.readFileSync(path.join(root, 'netlify', 'functions', 'marketplace-list.js'), 'utf8');
const adminApi = fs.readFileSync(path.join(root, 'netlify', 'functions', 'admin-console.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '011_business_growth_marketplace.sql'), 'utf8');

test('included tools remain the complete tier-authorized searchable library', () => {
  assert.match(promptsApi, /minimum_tier_rank=lte\.\$\{access\.tierRank\}/);
  assert.match(app, /function filteredPrompts\(\).*state\.prompts\.filter/);
  assert.match(html, /My Included AI Business Tools/);
  assert.match(html, /Explore all AI Business Tools available with your membership\./);
  assert.match(html, /id="searchInput"/);
  assert.match(html, /id="categoryFilter"/);
});

test('recommended tools are an explained subset and never restrict included access', () => {
  assert.match(app, /function recommendationReason/);
  ['industry','business_stage','business_goals','primary_business_challenges','geographic_market','markets_to_enter','priorities'].forEach((field) => assert.ok(app.includes(field)));
  assert.match(html, /These recommendations don't limit your access/);
  assert.match(html, /View All My Tools →/);
  assert.match(app, /Included With Your Membership/);
  assert.match(app, /Available With \$\{escapeHtml\(tierNames\[required\]/);
  assert.match(app, /Use Tool →/);
  assert.match(app, /View Upgrade Options →/);
});

test('Marketplace is a distinct premium service experience', () => {
  ['Business Growth Marketplace','Premium AI Services &amp; Agents','Professional Services','Member Services','Partner Offers'].forEach((term) => assert.ok(html.includes(term)));
  ['Opportunity Discovery Agent','RFP Intelligence Agent','Partnership Intelligence Agent','Marketing Campaign Agent','Business Growth Advisor','Referral Matching Agent'].forEach((name) => assert.ok(app.includes(name)));
  assert.match(app, /class="premium-badge">Premium/);
  assert.match(app, /data-marketplace-service/);
  assert.match(app, /Learn More →/);
  assert.doesNotMatch(app.match(/function marketplaceCard[^\n]+/)?.[0] || '', /Use Tool/);
  assert.match(css, /\.marketplace-card\{[^}]*background:linear-gradient/);
});

test('Marketplace details expose service information without checkout or fake prices', () => {
  ['Who It Is For','What It Helps With','Key Capabilities','How It Uses Business Profile Context','Expected Member Inputs','Potential Outputs','Pricing Status'].forEach((label) => assert.ok(app.includes(label)));
  assert.match(app, /Pricing Coming Soon/);
  assert.doesNotMatch(`${html}\n${app}`, /checkout|payment processing|Buy Now|\$\d+/i);
});

test('assessment and dashboard prioritize included tools before optional premium support', () => {
  assert.ok(app.indexOf('Included AI Business Tools for Your Priorities') < app.indexOf('Premium Support'));
  assert.match(html, /id="includedToolsSummary"/);
  assert.match(html, /id="dashboardMarketplace"/);
  assert.match(app, /\.slice\(0,3\)\.map\(\(item\)=>marketplaceCard\(item,true\)\)/);
});

test('Marketplace architecture is protected and future-ready without billing logic', () => {
  assert.match(marketplaceApi, /canUseMemberExperience/);
  assert.doesNotMatch(marketplaceApi, /tokens_used|estimated_ai_cost|credits_remaining/);
  ['marketplace_categories','marketplace_items','marketplace_usage','pricing_model','price','currency','billing_interval','credit_cost','included_runs','trial_available','purchase_url','active','agent_runs','tokens_used','estimated_ai_cost','credits_used','credits_remaining'].forEach((field) => assert.ok(migration.includes(field), `missing ${field}`));
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on public\.marketplace_categories/);
  assert.doesNotMatch(migration, /create table[^;]*(payment|checkout|invoice)/i);
});

test('Administration is prepared to review Marketplace configuration', () => {
  assert.match(html, /data-admin-tab="marketplace"/);
  assert.match(app, /function renderMarketplaceAdmin/);
  assert.match(adminApi, /marketplace_items\?select=/);
  ['Premium','Pricing Status','CTA','Order','Status'].forEach((label) => assert.ok(app.includes(label)));
});

test('terminology keeps premium services separate from prompt tools', () => {
  assert.doesNotMatch(`${html}\n${app}`, /Premium Prompts?|Paid Prompts?|Extra Prompts?/i);
});
