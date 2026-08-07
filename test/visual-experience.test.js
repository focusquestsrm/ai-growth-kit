const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'styles.css'), 'utf8');
const prompts = fs.readFileSync(path.join(root, 'netlify', 'functions', 'prompts-list.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '008_visual_growth_experience.sql'), 'utf8');

test('shared visual components power dashboard, library, and assessment', () => {
  ['heroGraphic','categoryThumbnail','progressRing','statusCard','assessmentSectionCard'].forEach((name) => assert.match(app, new RegExp(`function ${name}`)));
  ['dashboardHeroGraphic','profileCompletion','growthPriorities','opportunityGraphic'].forEach((id) => assert.match(html, new RegExp(`id="${id}"`)));
  assert.match(app, /profileCompletionPercent/);
  assert.doesNotMatch(`${html}\n${app}`, /Business Health Score/i);
});

test('tool thumbnails follow custom, category, and generic fallback priority', () => {
  assert.match(app, /if\(item\?\.thumbnail_url\)return/);
  assert.match(app, /category\.category_default_thumbnail\|\|category\.slug\|\|'general'/);
  ['profile-branding','marketing-content','sales-relationships','strategy-operations','opportunities-procurement','leadership-growth'].forEach((slug) => assert.ok(app.includes(`'${slug}'`)));
  assert.match(prompts, /thumbnail_url,thumbnail_type/);
  assert.match(migration, /category_default_thumbnail/);
});

test('assessment is a ten-area guided step experience with real progress', () => {
  ['assessmentProgress','assessmentOverview','assessmentBack','assessmentNext','assessmentSubmit'].forEach((id) => assert.match(html, new RegExp(`id="${id}"`)));
  assert.match(app, /Section \$\{state\.assessmentStep\+1\} of \$\{sections\.length\}/);
  assert.match(app, /answered\/questions\.length/);
  ['Key Strengths','Areas for Improvement','Top 3 Growth Priorities','30-Day Actions','90-Day Actions','Future Agent Recommendations','Recommended AI Business Tools'].forEach((label) => assert.ok(app.includes(label)));
});

test('profile spacing uses the requested compact rhythm', () => {
  assert.match(css, /\.profile-section\{[^}]*padding:14px 16px/);
  assert.match(css, /\.profile-section \.form-grid\{[^}]*row-gap:22px/);
  assert.match(css, /\.profile-form \.field-help\{margin:8px 0 0/);
  assert.match(css, /min-height:50px/);
  assert.match(css, /min-height:116px/);
  assert.match(css, /\.profile-page-intro\{[^}]*max-width:none/);
});
