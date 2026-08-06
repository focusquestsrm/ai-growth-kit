const test = require('node:test');
const assert = require('node:assert/strict');

test('an authenticated member without an admin role cannot access admin APIs', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon-test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test';
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).includes('/auth/v1/user')) return new Response(JSON.stringify({ id: '00000000-0000-0000-0000-000000000002', email: 'member@example.com' }), { status: 200 });
    return new Response(JSON.stringify([]), { status: 200 });
  };
  try {
    const { handler } = require('../netlify/functions/admin-console');
    const result = await handler({ httpMethod: 'GET', headers: { authorization: 'Bearer member-token' } });
    assert.equal(result.statusCode, 403);
    assert.equal(JSON.parse(result.body).error, 'Administrator access required');
  } finally { global.fetch = originalFetch; }
});
