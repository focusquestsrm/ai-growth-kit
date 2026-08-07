const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
test('prompt API gives anonymous users the sign-in message', async () => { const result = await require('../netlify/functions/prompts-list').handler({ httpMethod: 'GET', headers: {} }); assert.equal(result.statusCode, 401); assert.equal(JSON.parse(result.body).error, 'Please sign in to continue.'); });
test('Marketplace API requires the same member-experience authorization', async () => { const result = await require('../netlify/functions/marketplace-list').handler({ httpMethod: 'GET', headers: {} }); assert.equal(result.statusCode, 401); assert.equal(JSON.parse(result.body).error, 'Please sign in to continue.'); });
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
test('administrative access roles are supported independently of membership tiers', () => {
  const { ADMIN_ROLES, PLATFORM_ROLES } = require('../netlify/functions/_shared');
  assert.deepEqual(ADMIN_ROLES, ['platform_admin','content_admin','data_admin']);
  assert.deepEqual(PLATFORM_ROLES, ['platform_admin','content_admin','data_admin','member']);
});

test('member experience authorization follows membership or platform-admin policy', () => {
  const { memberExperienceEligible } = require('../netlify/functions/_shared');
  const user = { id:'auth-user' };
  assert.equal(memberExperienceEligible({ user:null, roles:[], member:null }), false);
  for (const tier of ['Bronze','Silver','Gold','Platinum']) assert.equal(memberExperienceEligible({ user, roles:[], member:{ growth_kit_tier:tier } }), true, tier);
  assert.equal(memberExperienceEligible({ user, roles:['platform_admin'], member:null }), true);
  assert.equal(memberExperienceEligible({ user, roles:['content_admin'], member:null }), false);
  assert.equal(memberExperienceEligible({ user, roles:['data_admin'], member:null }), false);
  assert.equal(memberExperienceEligible({ user, roles:[], member:{ growth_kit_tier:'Ambassador' } }), false);
});

test('platform preview changes effective tier without mutating permissions', () => {
  const { resolvePreviewTierRank } = require('../netlify/functions/_shared');
  const access = { roles:['platform_admin'], member:null };
  const before = JSON.stringify(access);
  assert.deepEqual(['Bronze','Silver','Gold','Platinum'].map((tier)=>resolvePreviewTierRank(access,tier)), [1,2,3,4]);
  assert.equal(JSON.stringify(access), before);
});
