const test = require('node:test');
const assert = require('node:assert/strict');

test('member verification derives tier from the imported member record', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon-test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test';
  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (url, options = {}) => {
    requests.push(String(url));
    if (String(url).includes('/auth/v1/user')) return new Response(JSON.stringify({ id: '00000000-0000-0000-0000-000000000001', email: 'member@example.com' }), { status: 200 });
    if (options.method === 'PATCH') return new Response(null, { status: 204 });
    return new Response(JSON.stringify([{ id: '10000000-0000-0000-0000-000000000001', first_name: 'D9', last_name: 'Member', company: 'Example', growth_kit_tier: 'Gold', growth_kit_tier_rank: 3 }]), { status: 200 });
  };
  try {
    const { handler } = require('../netlify/functions/member-eligibility');
    const result = await handler({ httpMethod: 'POST', headers: { authorization: 'Bearer member-token', 'x-forwarded-for': '192.0.2.10' }, body: JSON.stringify({ email: ' MEMBER@example.com ', user_id: 'BD-42', membership: 'Bronze' }) });
    const body = JSON.parse(result.body);
    assert.equal(result.statusCode, 200); assert.equal(body.member.growth_kit_tier, 'Gold');
    assert.ok(requests.some((url) => url.includes('bd_user_id=eq.BD-42')));
    assert.ok(requests.every((url) => !url.includes('growth_kit_tier=eq.')));
  } finally { global.fetch = originalFetch; }
});
