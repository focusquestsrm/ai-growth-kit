const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migrations = ['003_complete_growth_kit.sql','004_business_growth_platform.sql'].map((name) => fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', name), 'utf8')).join('\n');
const categories = ['profile-branding','marketing-content','sales-relationships','strategy-operations','opportunities-procurement','leadership-growth'];
const requiredTools = [
  'Business Profile Enhancer','Elevator Pitch Creator','Tagline Generator','Social Media Post','Customer FAQ Builder','Ideal Customer Profile','Basic SWOT Analysis',
  'Professional Business Bio','Customer Value Proposition','Keyword Generator','7-Day Content Calendar','Promotional Email','LinkedIn Thought Leadership','Sales Outreach Campaign','Referral Strategy','Customer Retention Plan','90-Day Growth Plan',
  'Corporate Partnership Strategy','Sponsorship Outreach','Event Promotion Kit','Capability Statement Builder','Vendor Readiness Assessment','RFP Response Outline','Supplier Diversity Outreach','Executive Presentation',
  'Executive Business Summary','Executive Growth Brief','12-Month Strategic Plan','Market Expansion Strategy','Board Presentation','Economic Impact Narrative','Investment Readiness Plan','Growth Roadmap'
];

test('seeds the complete 33-tool catalog', () => {
  requiredTools.forEach((title) => assert.ok(migrations.includes(`'${title}'`), `missing ${title}`));
  assert.equal(requiredTools.length, 33);
});

test('all six Business Growth Categories are represented', () => {
  categories.forEach((slug) => assert.ok(migrations.includes(`'${slug}'`), `missing ${slug}`));
});

test('platform migration adds reusable profile, favorites, feedback, and health data', () => {
  ['business_description','business_goals','favorite_tools','platform_feedback','business_health_assessments','output_format'].forEach((name) => assert.match(migrations, new RegExp(name)));
});
