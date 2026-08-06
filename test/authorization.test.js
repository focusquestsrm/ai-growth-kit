const test = require('node:test');
const assert = require('node:assert/strict');
test('prompt API denies requests without Supabase authentication', async () => { const result = await require('../netlify/functions/prompts-list').handler({ httpMethod: 'GET', headers: {} }); assert.equal(result.statusCode, 401); });
test('admin API denies unauthenticated requests', async () => { const result = await require('../netlify/functions/admin-console').handler({ httpMethod: 'GET', headers: {} }); assert.equal(result.statusCode, 403); });
test('prompt API rejects unsupported methods', async () => { const result = await require('../netlify/functions/prompts-list').handler({ httpMethod: 'POST', headers: {} }); assert.equal(result.statusCode, 405); });
