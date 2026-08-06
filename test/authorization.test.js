const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
test('prompt API denies requests without Supabase authentication', async () => { const result = await require('../netlify/functions/prompts-list').handler({ httpMethod: 'GET', headers: {} }); assert.equal(result.statusCode, 403); });
test('admin API denies unauthenticated requests', async () => { const result = await require('../netlify/functions/admin-console').handler({ httpMethod: 'GET', headers: {} }); assert.equal(result.statusCode, 403); });
test('prompt API rejects unsupported methods', async () => { const result = await require('../netlify/functions/prompts-list').handler({ httpMethod: 'POST', headers: {} }); assert.equal(result.statusCode, 405); });
test('tier filtering allows cumulative access only to published prompts', () => {
  const { filterPromptsByTier } = require('../netlify/functions/_shared');
  const prompts = [1,2,3,4].map((rank) => ({ minimum_tier_rank: rank, status: 'published' })).concat({ minimum_tier_rank: 1, status: 'draft' });
  assert.deepEqual([1,2,3,4].map((rank) => filterPromptsByTier(prompts, rank).length), [1,2,3,4]);
});
test('member-facing verification never asks the member to select a tier', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.doesNotMatch(html, /name=["']membership["']/i);
});
test('all required administrator roles are supported independently of tiers', () => {
  const { ADMIN_ROLES } = require('../netlify/functions/_shared');
  assert.deepEqual(ADMIN_ROLES, ['data_admin','content_admin','platform_admin']);
});
