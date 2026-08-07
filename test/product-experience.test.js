const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');

test('uses the official product identity and footer', () => {
  assert.match(html, /<title>The D9Network AI Business Growth Platform<\/title>/);
  assert.match(html, /© D9Network/);
  assert.match(html, /All Rights Reserved\./);
  assert.doesNotMatch(`${html}\n${app}`, /Nexx Jenn Technologies/i);
});

test('member experience contains every Sprint 2 workspace', () => {
  ['page-dashboard','page-library','page-saved','page-profile','page-assessment','page-opportunities','page-settings'].forEach((id) => assert.match(html, new RegExp(`id="${id}"`)));
  assert.doesNotMatch(html, /id="page-history"/);
  assert.match(app, /duplicate_output/);
  assert.match(app, /update_strategy/);
  assert.match(app, /set_favorite/);
  assert.match(app, /submit_feedback/);
  assert.match(app, /Business Growth Assessment completed/);
});

test('regular member navigation never links to the Intelligence Dashboard', () => {
  assert.doesNotMatch(html, /data-page="intelligence/i);
});

test('member navigation is grouped into five primary destinations', () => {
  ['Dashboard','My Business','AI Business Tools','Opportunities','Account'].forEach((label) => assert.ok(html.includes(label)));
  assert.doesNotMatch(html, />Growth Activity</);
  assert.match(html, /id="adminNav"[^>]*hidden/);
  assert.doesNotMatch(html, /id="platformNav"|accountViewMode|Admin View/);
});

test('uses centralized compact typography tokens', () => {
  const css = fs.readFileSync(path.join(root, 'public', 'styles.css'), 'utf8');
  ['--type-page-title:32px','--type-dashboard-title:32px','--type-section:22px','--type-card-title:18px','--type-nav:14px','--type-control:16px'].forEach((token) => assert.ok(css.includes(token), `missing ${token}`));
  assert.match(css, /font-family:ui-sans-serif,system-ui,-apple-system/);
  assert.doesNotMatch(html, /style="[^"]*font-size/i);
});

test('Saved Strategies is the single editable generated-work repository', () => {
  const workspace = fs.readFileSync(path.join(root, 'netlify', 'functions', 'member-workspace.js'), 'utf8');
  assert.match(workspace, /saved_strategies\?member_access_id=eq\./);
  assert.match(workspace, /body\.action === 'update_strategy'/);
  ['Open','Duplicate','Export','Delete'].forEach((action) => assert.ok(html.includes(action) || app.includes(action)));
  assert.doesNotMatch(html, /Saved Outputs|Saved Documents/i);
});

test('view-as-user is audited, read-only, and isolated from actual membership', () => {
  assert.match(app, /start_impersonation/);
  assert.match(app, /Read only/);
  assert.doesNotMatch(app, /set_member_access[^\n]+simulated_tier/);
});

test('new accounts receive truthful empty states before profile completion', () => {
  assert.ok(`${html}\n${app}`.includes('Complete your profile to receive personalized recommendations.'));
  assert.match(app, /No saved work yet\./);
  assert.match(app, /No saved strategies yet\./);
  assert.doesNotMatch(app, /first_name:'Platform', last_name:'Administrator'/);
});
