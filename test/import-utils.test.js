const test = require('node:test');
const assert = require('node:assert/strict');
const { ignoredMembership, normalizeEmail, normalizeMembership } = require('../netlify/functions/_shared');
const { processRows } = require('../netlify/functions/import-utils');

test('normalizes supported tiers to access ranks', () => {
  assert.deepEqual(normalizeMembership(' Bronze '), ['Bronze', 1]);
  assert.deepEqual(normalizeMembership('SILVER'), ['Silver', 2]);
  assert.deepEqual(normalizeMembership('Gold'), ['Gold', 3]);
  assert.deepEqual(normalizeMembership('platinum'), ['Platinum', 4]);
  assert.equal(normalizeMembership('Bronze Plus'), null);
});
test('ignores only the excluded Brilliant Directories plans', () => {
  assert.equal(ignoredMembership('Bronze II (Claim)'), true); assert.equal(ignoredMembership(' ambassador '), true); assert.equal(ignoredMembership('Bronze'), false);
});
test('normalizes email and keeps the highest tier for duplicates', () => {
  const result = processRows([{ user_id: 10, email: ' MEMBER@Example.COM ', subscription_name: 'Bronze' }, { user_id: 11, email: 'member@example.com', subscription_name: 'Gold' }, { user_id: 12, email: 'ignored@example.com', subscription_name: 'Ambassador' }]);
  assert.equal(normalizeEmail(' MEMBER@Example.COM '), 'member@example.com'); assert.equal(result.accepted.length, 1); assert.equal(result.accepted[0].growth_kit_tier, 'Gold'); assert.equal(result.accepted[0].bd_user_id, '11'); assert.equal(result.duplicates.length, 1); assert.equal(result.ignored.length, 1);
});
test('rejects incomplete and unsupported rows', () => {
  const result = processRows([{ user_id: '', email: 'bad', subscription_name: 'Silver' }, { user_id: 2, email: 'x@example.com', subscription_name: 'Bronze Plus' }]); assert.equal(result.accepted.length, 0); assert.equal(result.rejected.length, 2);
});
