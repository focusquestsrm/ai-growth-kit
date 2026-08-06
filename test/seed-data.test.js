const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '003_complete_growth_kit.sql'), 'utf8');
const categories = ['profile-branding','marketing-content','sales-relationships','strategy-operations','opportunities-procurement','leadership-growth'];
const requiredPrompts = ['Business Profile Enhancer','Elevator Pitch Creator','Tagline Generator','Social Media Post','Customer FAQ Builder','Ideal Customer Profile','Basic SWOT Analysis','Professional Business Bio','Customer Value Proposition','Keyword Generator','Seven-Day Content Calendar','Promotional Email','LinkedIn Thought-Leadership Post','Sales Outreach Message','Referral Strategy Builder','Customer Retention Plan','90-Day Growth Plan','Event Promotion Kit','Corporate Partnership Pitch','Sponsorship Outreach','Capability Statement Outline','Vendor-Readiness Assessment','RFP Response Outline','Executive Business Summary','Executive Growth Brief','12-Month Strategic Plan','Board or Leadership Update','Market Expansion Strategy','Economic Impact Narrative'];

test('seeds every required prompt and marketplace upgrade copy', () => {
  requiredPrompts.forEach((title) => assert.ok(sql.includes(`'${title}'`), `missing ${title}`));
  assert.equal(requiredPrompts.length, 29);
  assert.match(sql, /marketplace_upgrade_message/);
});
test('all six required categories have seeded prompts', () => {
  categories.forEach((slug) => {
    const matches = sql.match(new RegExp(`\\('${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`, 'g')) || [];
    assert.ok(matches.length >= 2, `${slug} has no prompt seed rows`);
  });
});
