const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const sharedPath = require.resolve('../netlify/functions/_shared');
const originalBaseUrl = process.env.APP_BASE_URL;
const originalContext = process.env.CONTEXT;
const { invitationRedirectUrl } = require(sharedPath);

test.afterEach(() => {
  if (originalBaseUrl === undefined) delete process.env.APP_BASE_URL; else process.env.APP_BASE_URL = originalBaseUrl;
  if (originalContext === undefined) delete process.env.CONTEXT; else process.env.CONTEXT = originalContext;
});

test('production invitations use the deployed callback and preserve the destination', () => {
  process.env.APP_BASE_URL = 'https://ai-growth-kit.netlify.app';
  process.env.CONTEXT = 'production';
  assert.equal(invitationRedirectUrl('/admin/login'), 'https://ai-growth-kit.netlify.app/auth/callback?next=%2Fadmin%2Flogin');
});

test('Netlify production context declares the deployed application URL', () => {
  const config = fs.readFileSync(path.join(root, 'netlify.toml'), 'utf8');
  assert.match(config, /\[context\.production\.environment\][\s\S]*APP_BASE_URL\s*=\s*"https:\/\/ai-growth-kit\.netlify\.app"/);
});

test('localhost is allowed for development but rejected in production', () => {
  process.env.APP_BASE_URL = 'http://localhost:3000';
  delete process.env.CONTEXT;
  assert.equal(invitationRedirectUrl('/login'), 'http://localhost:3000/auth/callback?next=%2Flogin');
  process.env.CONTEXT = 'production';
  assert.throws(() => invitationRedirectUrl('/login'), /not safe/);
});

test('invitation callback handles setup, session persistence, and useful invalid-link errors', () => {
  const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const auth = fs.readFileSync(path.join(root, 'netlify', 'functions', 'auth-session.js'), 'utf8');
  assert.match(html, /id="invitationSetupForm"/);
  assert.match(app, /location\.pathname!=='\/auth\/callback'/);
  assert.match(app, /\['invite','recovery'\]\.includes\(authType\)/);
  assert.match(app, /history\.replaceState\(\{\},'',`\$\{location\.pathname\}\$\{location\.search\}`\)/);
  assert.match(app, /action:'complete_invitation'/);
  assert.match(app, /This invitation link is invalid or has expired/);
  assert.match(auth, /await activateInvitation\(updatedUser\)/);
  assert.match(auth, /body\.action === 'complete_invitation'/);
});

test('valid invitation session securely sets the password and activates the invitation', async () => {
  const saved = { url:process.env.SUPABASE_URL, anon:process.env.SUPABASE_ANON_KEY, service:process.env.SUPABASE_SERVICE_ROLE_KEY, owner:process.env.INITIAL_PLATFORM_ADMIN_EMAIL, fetch:global.fetch };
  process.env.SUPABASE_URL = 'https://project.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'public-anon-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'server-service-key';
  delete process.env.INITIAL_PLATFORM_ADMIN_EMAIL;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url:String(url), method:options.method || 'GET' });
    if (String(url).includes('/rest/v1/platform_invitations')) return new Response('[]', { status:200 });
    return new Response(JSON.stringify({ id:'user-1', email:'invited@example.com', user_metadata:{} }), { status:200, headers:{ 'Content-Type':'application/json' } });
  };
  delete require.cache[require.resolve('../netlify/functions/auth-session')];
  delete require.cache[sharedPath];
  try {
    const result = await require('../netlify/functions/auth-session').handler({ httpMethod:'POST', headers:{ authorization:'Bearer invitation-access-token' }, body:JSON.stringify({ action:'complete_invitation', password:'a-secure-password' }) });
    assert.equal(result.statusCode, 200);
    assert.ok(calls.some((call) => call.url.endsWith('/auth/v1/user') && call.method === 'PUT'));
    assert.ok(calls.some((call) => call.url.includes('/rest/v1/platform_invitations')));
  } finally {
    global.fetch = saved.fetch;
    for (const [key,value] of [['SUPABASE_URL',saved.url],['SUPABASE_ANON_KEY',saved.anon],['SUPABASE_SERVICE_ROLE_KEY',saved.service],['INITIAL_PLATFORM_ADMIN_EMAIL',saved.owner]]) value === undefined ? delete process.env[key] : process.env[key] = value;
    delete require.cache[require.resolve('../netlify/functions/auth-session')];
    delete require.cache[sharedPath];
  }
});
