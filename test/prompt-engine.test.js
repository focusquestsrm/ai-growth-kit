const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const engine = require('../public/prompt-engine');

const root = path.join(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '010_context_aware_prompt_engine.sql'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'netlify', 'functions', 'admin-console.js'), 'utf8');
const workspace = fs.readFileSync(path.join(root, 'netlify', 'functions', 'member-workspace.js'), 'utf8');

test('assembled prompts are concise, structured, relevant, and fully resolved', () => {
  const tool = { title: 'Example', context_fields: ['business_name','services','products'], task_template: 'Create a plan for {{business_name}} about {{goal}} and note {{missing_value}}.', required_output: '1. Summary\n2. Actions', guardrails: 'Do not invent results.', prompt_version: '1.1' };
  const profile = { business_name: 'ABC Financial', services: 'Bookkeeping, Tax Planning', products: 'None', website: 'https://unused.example' };
  const schema = [{ key:'goal', label:'Primary Goal' }];
  const result = engine.assemble({ tool, profile, answers:{ goal:'Acquire 25 clients' }, schema });
  assert.ok(result.text.startsWith(engine.HEADER));
  ['BUSINESS CONTEXT','TOOL-SPECIFIC INPUTS','TASK','REQUIRED OUTPUT','GUARDRAILS'].forEach((heading) => assert.ok(result.text.includes(heading)));
  assert.match(result.text, /Services:\n- Bookkeeping\n- Tax Planning/);
  assert.match(result.text, /Primary Goal:\nAcquire 25 clients/);
  assert.doesNotMatch(result.text, /Products:\nNone|unused\.example|Guided Responses|Desired Output|\{\{/);
  assert.equal(result.version, '1.1');
});

test('temporary overrides affect one assembly without mutating the profile', () => {
  const profile = { business_name:'Original Business', target_market:'Small businesses' };
  const result = engine.assemble({ tool:{ title:'Profile', context_fields:['business_name','target_market'], task_template:'Create recommendations.', required_output:'Recommendations' }, profile, overrides:{ target_market:'Nonprofit executive directors' } });
  assert.equal(result.businessContext.target_market, 'Nonprofit executive directors');
  assert.equal(profile.target_market, 'Small businesses');
  assert.match(app, /Update Business Profile with these changes/);
});

test('all 33 official tools receive versioned tool-level configurations', () => {
  const configured = [...migration.matchAll(/^\('([a-z0-9-]+)'/gm)].map((match) => match[1]);
  assert.equal(new Set(configured).size, 33);
  assert.match(migration, /90-Day Objective/);
  assert.match(migration, /Month 1: Foundation and Pipeline Building/);
  assert.match(migration, /Weekly Activity Targets/);
  assert.match(migration, /activity metrics/);
  assert.match(migration, /prompt_version = '1\.1'/);
});

test('admin configuration and historical snapshots retain the tool contract', () => {
  ['context_fields','task_template','required_output','guardrails','prompt_version'].forEach((field) => assert.match(admin, new RegExp(field)));
  assert.match(app, /business_context_snapshot/);
  assert.match(app, /guided_responses/);
  assert.match(workspace, /versionedInputPayload/);
  assert.match(workspace, /input_payload: versionedInputPayload/);
  assert.match(app, /No strategy or outcome was recorded/);
});
