const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const app = read('public', 'app.js');
const html = read('public', 'index.html');
const css = read('public', 'styles.css');
const endpoint = read('netlify', 'functions', 'onboarding-state.js');
const migration = read('supabase', 'migrations', '012_member_onboarding.sql');

test('first-login welcome can be started or skipped and is not forced again', () => {
  assert.match(html, /Welcome to the D9Network AI Business Growth Platform/);
  assert.match(html, /Take the Tour/);
  assert.match(html, /Skip for Now/);
  assert.match(app, /!o\.tour_started&&!o\.tour_completed&&!o\.tour_skipped/);
  for (const action of ['start_tour', 'skip_tour', 'complete_tour']) assert.match(endpoint, new RegExp(action));
});

test('tour contains all seven required destinations and dynamic membership context', () => {
  const block = app.match(/const tourSteps=\[([\s\S]*?)\];/)?.[1] || '';
  assert.equal((block.match(/\{target:/g) || []).length, 7);
  for (const title of [
    'Your Growth Starts Here', 'Step 1: Tell Us About Your Business',
    'Step 2: Assess Your Business', 'Step 3: See What We Recommend',
    'Explore All Your AI Business Tools', 'Build Your Growth Library',
    'Discover Additional Growth Services'
  ]) assert.match(block, new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(block, /state\.prompts\.length/);
  assert.match(block, /tierNames\[effectiveRank\(\)\]/);
  assert.match(app, /Complete My Business Profile/);
  assert.match(app, /Return to Dashboard/);
});

test('getting started progress is derived from real member records', () => {
  for (const label of [
    'Create Your Account', 'Complete Business Profile',
    'Complete Business Growth Assessment', 'Review Recommended Tools',
    'Use Your First AI Business Tool', 'Save Your First Strategy'
  ]) assert.match(app, new RegExp(label));
  assert.match(app, /profileComplete\(\)/);
  assert.match(app, /state\.assessment\?\.latest/);
  assert.match(app, /state\.workspace\.generations\?\.length/);
  assert.match(app, /state\.workspace\.outputs\?\.length/);
  assert.match(app, /Math\.round\(complete\/items\.length\*100\)/);
  assert.match(app, /checklist_acknowledged_at/);
});

test('persistent onboarding supports members and platform-admin Member View securely', () => {
  assert.match(endpoint, /canUseMemberExperience\(event\)/);
  assert.match(endpoint, /access\.ownerColumn/);
  assert.match(endpoint, /access\.ownerId/);
  assert.match(migration, /member_access_id uuid references public\.member_app_access/);
  assert.match(migration, /auth_user_id uuid references auth\.users/);
  assert.match(migration, /member_onboarding_owner check/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on public\.member_onboarding from anon, authenticated/);
});

test('tour is restartable, keyboard dismissible, focusable, and responsive', () => {
  assert.match(html, /data-start-tour>Take a Tour/);
  assert.match(html, /id="tourPanel"[^>]*tabindex="-1"/);
  assert.match(app, /event\.key==='Escape'/);
  assert.match(app, /panel\.focus\(\)/);
  assert.match(css, /\.tour-panel:focus-visible/);
  assert.match(css, /@media\(max-width:700px\)[\s\S]*?\.tour-panel/);
  assert.match(css, /safe-area-inset-bottom/);
});
