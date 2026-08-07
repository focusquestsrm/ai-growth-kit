const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('review sessions use a fixed server-side member and simulated entitlement only', async () => {
  process.env.REVIEW_MODE = 'true';
  process.env.REVIEW_MODE_SECRET = 'test-only-review-signing-secret';
  process.env.REVIEW_MEMBER_ID = '00000000-0000-4000-8000-000000000009';
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test';

  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).includes('/rest/v1/member_app_access?')) return new Response(JSON.stringify([{
      id:process.env.REVIEW_MEMBER_ID, email:'review@example.com', normalized_email:'review@example.com',
      first_name:'Review', last_name:'Member', company:'ABC Financial Solutions', growth_kit_tier:'Platinum', growth_kit_tier_rank:4
    }]), { status:200 });
    return new Response(JSON.stringify([]), { status:200 });
  };

  try {
    const { handler } = require('../netlify/functions/review-session');
    const shared = require('../netlify/functions/_shared');
    const result = await handler({ httpMethod:'POST', headers:{}, body:JSON.stringify({ selection:'bronze' }) });
    assert.equal(result.statusCode, 200);
    const session = JSON.parse(result.body);
    assert.equal(session.tier_rank, 1);
    assert.equal(JSON.stringify(session).includes(process.env.REVIEW_MEMBER_ID), false);

    const access = await shared.canUseMemberExperience({ headers:{ 'x-review-session':session.token } });
    assert.equal(access.allowed, true);
    assert.equal(access.ownerColumn, 'member_access_id');
    assert.equal(access.ownerId, process.env.REVIEW_MEMBER_ID);
    assert.equal(access.tierRank, 1);
    assert.equal(access.member.growth_kit_tier, 'Platinum');

    const adminResult = await handler({ httpMethod:'POST', headers:{}, body:JSON.stringify({ selection:'admin' }) });
    const adminSession = JSON.parse(adminResult.body);
    const admin = await shared.requireAdmin({ headers:{ 'x-review-session':adminSession.token } });
    assert.deepEqual(admin.roles, ['platform_admin']);
    assert.equal(admin.reviewMode, true);

    const mutation = await require('../netlify/functions/admin-console').handler({
      httpMethod:'POST', headers:{ 'x-review-session':adminSession.token }, body:JSON.stringify({ action:'set_member_access' })
    });
    assert.equal(mutation.statusCode, 403);
    assert.match(JSON.parse(mutation.body).error, /disabled in Review Mode/);
  } finally {
    global.fetch = originalFetch;
    delete process.env.REVIEW_MODE;
    delete process.env.REVIEW_MODE_SECRET;
    delete process.env.REVIEW_MEMBER_ID;
  }
});

test('review UI is environment-gated and leaves Supabase login in place', () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
  const shared = fs.readFileSync(path.join(root, 'netlify', 'functions', '_shared.js'), 'utf8');
  assert.match(html, /id="reviewAccessForm"/);
  assert.match(html, /id="loginForm"/);
  assert.match(app, /config\.enabled/);
  assert.match(app, /d9-review-session/);
  assert.match(shared, /REVIEW_MEMBER_ID/);
  assert.doesNotMatch(app, /REVIEW_MEMBER_ID/);
});
