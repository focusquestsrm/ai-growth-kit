const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const handlerPath = require.resolve('../netlify/functions/admin-password-reset');
const sharedPath = require.resolve('../netlify/functions/_shared');

function clearModules() { delete require.cache[handlerPath]; delete require.cache[sharedPath]; }

test('password reset rejects requests without platform administrator authentication', async () => {
  clearModules();
  const result = await require(handlerPath).handler({ httpMethod:'POST', headers:{}, body:JSON.stringify({ email:'danielle@focusquest.com', password:'not-a-real-password' }) });
  assert.equal(result.statusCode, 403);
});

test('platform administrator resets only the existing Supabase Auth password and records a safe audit', async () => {
  const saved = { url:process.env.SUPABASE_URL, anon:process.env.SUPABASE_ANON_KEY, service:process.env.SUPABASE_SERVICE_ROLE_KEY, owner:process.env.INITIAL_PLATFORM_ADMIN_EMAIL, fetch:global.fetch };
  process.env.SUPABASE_URL = 'https://project.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'public-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'server-key';
  delete process.env.INITIAL_PLATFORM_ADMIN_EMAIL;
  const calls = [], adminId='00000000-0000-0000-0000-000000000001', accountId='00000000-0000-0000-0000-000000000002', targetId='00000000-0000-0000-0000-000000000003';
  global.fetch = async (url, options = {}) => {
    const request = { url:String(url), method:options.method || 'GET', body:String(options.body || '') }; calls.push(request);
    if (request.url.endsWith('/auth/v1/user')) return new Response(JSON.stringify({ id:adminId, email:'admin@example.com' }), { status:200 });
    if (request.url.includes('/rest/v1/platform_invitations')) return new Response('[]', { status:200 });
    if (request.url.includes('/rest/v1/platform_accounts')) return new Response(JSON.stringify([{ id:accountId, auth_user_id:adminId, email:'admin@example.com', account_status:'active' }]), { status:200 });
    if (request.url.includes('/rest/v1/platform_role_assignments')) return new Response(JSON.stringify([{ id:'role-1', account_id:accountId, role:'platform_admin', permissions:['admin.*'], is_active:true }]), { status:200 });
    if (request.url.includes('/rest/v1/user_roles')) return new Response(JSON.stringify([{ role:'platform_admin' }]), { status:200 });
    if (request.url.includes('/auth/v1/admin/users?')) return new Response(JSON.stringify({ users:[{ id:targetId, email:'danielle@focusquest.com' }] }), { status:200 });
    if (request.url.endsWith(`/auth/v1/admin/users/${targetId}`)) return new Response(JSON.stringify({ id:targetId, email:'danielle@focusquest.com' }), { status:200 });
    if (request.url.includes('/rest/v1/audit_logs')) return new Response('', { status:201 });
    return new Response('{}', { status:404 });
  };
  clearModules();
  try {
    const result = await require(handlerPath).handler({ httpMethod:'POST', headers:{ authorization:'Bearer platform-admin-token' }, body:JSON.stringify({ email:'danielle@focusquest.com', password:'known-test-password' }) });
    assert.equal(result.statusCode, 200);
    assert.equal(JSON.parse(result.body).message, 'Password updated successfully.');
    const update = calls.find((call) => call.url.endsWith(`/auth/v1/admin/users/${targetId}`));
    assert.equal(update.method, 'PUT');
    assert.deepEqual(JSON.parse(update.body), { password:'known-test-password' });
    const auditCall = calls.find((call) => call.url.includes('/rest/v1/audit_logs'));
    assert.ok(auditCall);
    assert.doesNotMatch(auditCall.body, /known-test-password/);
    assert.match(auditCall.body, /"action":"password_reset"/);
    assert.match(auditCall.body, new RegExp(targetId));
    assert.equal(calls.filter((call) => call.method !== 'GET' && !call.url.includes('/audit_logs') && !call.url.includes('/auth/v1/admin/users/')).length, 0);
  } finally {
    global.fetch=saved.fetch;
    for (const [key,value] of [['SUPABASE_URL',saved.url],['SUPABASE_ANON_KEY',saved.anon],['SUPABASE_SERVICE_ROLE_KEY',saved.service],['INITIAL_PLATFORM_ADMIN_EMAIL',saved.owner]]) value === undefined ? delete process.env[key] : process.env[key]=value;
    clearModules();
  }
});

test('admin UI exposes password reset only for platform administrators', () => {
  const app=fs.readFileSync(path.join(root,'public','app.js'),'utf8'), html=fs.readFileSync(path.join(root,'public','index.html'),'utf8'), fn=fs.readFileSync(path.join(root,'netlify','functions','admin-password-reset.js'),'utf8');
  assert.match(app, /includes\('platform_admin'\).*data-reset-password/);
  assert.match(html, /id="passwordResetForm"/);
  assert.match(html, /Confirm New Password/);
  assert.match(app, /api\('admin-password-reset'/);
  assert.match(fn, /admin\?\.roles\?\.includes\('platform_admin'\)/);
  assert.match(fn, /Changes are disabled while viewing as another user/);
  assert.match(fn, /Password updated successfully\./);
  assert.doesNotMatch(fn, /platform_accounts.*PATCH|member_app_access.*PATCH|business_profiles.*PATCH/);
});
