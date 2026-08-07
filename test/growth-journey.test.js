const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'styles.css'), 'utf8');
const promptsApi = fs.readFileSync(path.join(root, 'netlify', 'functions', 'prompts-list.js'), 'utf8');
const workspaceApi = fs.readFileSync(path.join(root, 'netlify', 'functions', 'member-workspace.js'), 'utf8');

test('dashboard hero uses approved copy, artwork, personalization, and live metrics', () => {
  assert.match(html, /Your Growth Journey/);
  assert.match(html, /<span>Starts Here\.<\/span>/);
  assert.match(html, /Everything you need to build, grow, and scale your business/);
  assert.match(app, /function personalizedGreeting/);
  assert.match(app, /dashboardWelcome'\)\.textContent=personalizedGreeting/);
  assert.match(app, /state\.prompts\.length/);
  assert.match(app, /saved\.length/);
  assert.match(app, /assessmentDashboardState/);
  assert.match(css, /\.dashboard-growth-hero\{min-height:340px/);
  assert.match(css, /\.dashboard-hero-art img\{[^}]*object-fit:cover/);
  assert.doesNotMatch(html, /Welcome, Your|Tools Available for Your Membership/);
});

test('profile save presents an optional assessment next step', () => {
  assert.match(html, /id="profileSaveNextStep"/);
  assert.match(html, /Next Step: Discover Your Growth Priorities/);
  assert.match(html, /Take Business Growth Assessment →/);
  assert.match(html, /data-dismiss-profile-next/);
  assert.match(app, /profileSaveNextStep.*classList\.remove\('hidden'\)/);
});

test('assessment recommendations preserve membership access', () => {
  assert.match(app, /Included With Your Membership/);
  assert.match(app, /Available With \$\{escapeHtml\(tierNames\[required\]/);
  assert.match(app, /View Upgrade Options →/);
  assert.match(app, /Use Tool →/);
  assert.doesNotMatch(`${html}\n${app}`, /Buy Tool|Purchase Prompt|\$\d+/i);
});

test('eligible tools assemble protected personalized prompts for copying', () => {
  assert.match(app, /function assemblePersonalizedPrompt/);
  assert.match(app, /prompt\.system_prompt/);
  assert.match(app, /profileContext\(context\)/);
  assert.match(app, /Guided Responses/);
  assert.match(app, /Desired Output/);
  assert.match(app, /Copy AI Prompt/);
  assert.match(app, /AI Generation Coming Soon/);
  assert.match(promptsApi, /minimum_tier_rank=lte\.\$\{access\.tierRank\}/);
  assert.match(promptsApi, /system_prompt,user_prompt_template,output_format/);
  assert.match(workspaceApi, /record_tool_use/);
  assert.match(workspaceApi, /prompt_copied/);
  assert.match(workspaceApi, /body\.action === 'save_output'/);
});
