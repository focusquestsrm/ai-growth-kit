const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const shared = fs.readFileSync(path.join(root, 'netlify', 'functions', '_shared.js'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'netlify', 'functions', 'admin-console.js'), 'utf8');
const importer = fs.readFileSync(path.join(root, 'netlify', 'functions', 'admin-member-import.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '006_identity_administration.sql'), 'utf8');

test('identity is rendered from database profile fields without placeholders', () => {
  assert.match(app, /first_name/);
  assert.match(app, /last_name/);
  assert.match(app, /Welcome, \$\{first\}\./);
  assert.match(app, /function initials\(profile\)/);
  assert.doesNotMatch(`${html}\n${app}`, /Your Name|Welcome, Your|>YN<|D9 Member/);
});

test('member and administrator entry points support platform view switching', () => {
  assert.match(app, /location\.pathname\.startsWith\('\/admin'\)/);
  assert.match(app, /'\/admin\/login'/);
  assert.match(app, /'\/login'/);
  assert.match(html, /Platform View/);
  assert.match(html, /Member View/);
  assert.match(html, /id="adminNav"[^>]*hidden/);
});

test('owner identity and role are created from protected configuration', () => {
  assert.match(shared, /process\.env\.INITIAL_PLATFORM_ADMIN_EMAIL/);
  assert.match(shared, /account_designation: 'Platform Administrator'/);
  assert.match(shared, /role: 'platform_admin'/);
  assert.match(app, /Welcome, \$\{first\}\./);
  assert.doesNotMatch(shared, /Nick Alberti|@d9network/i);
});

test('roles, account state, membership, and simulation remain separate', () => {
  ['platform_accounts', 'platform_role_assignments', 'platform_invitations', 'impersonation_sessions'].forEach((table) => assert.match(migration, new RegExp(`public\\.${table}`)));
  assert.match(migration, /membership_status text/);
  assert.match(migration, /simulated_tier text/);
  assert.match(migration, /member_access_id uuid/);
  assert.match(migration, /check \(membership_status = 'member' or member_access_id is null\)/);
});

test('canonical admin roles have scoped permissions and view-as-user is audited read-only', () => {
  const { permissionSet, hasPermission } = require('../netlify/functions/_shared');
  assert.equal(hasPermission(permissionSet([{ role: 'content_admin', permissions: [] }]), 'admin.imports.manage'), false);
  assert.equal(hasPermission(permissionSet([{ role: 'data_admin', permissions: [] }]), 'admin.imports.manage'), true);
  assert.match(admin, /is_read_only:true/);
  assert.match(admin, /impersonation\.started/);
  assert.match(admin, /Changes are disabled while viewing as another user/);
});

test('membership import cannot grant roles or mutate platform accounts', () => {
  assert.doesNotMatch(importer, /platform_role_assignments|user_roles|platform_accounts/);
  assert.match(importer, /member_app_access/);
  assert.match(importer, /requireAdmin\(event, 'admin\.imports\.manage'\)/);
});

test('every administrative request is permission protected and access is audited', () => {
  assert.match(admin, /requireAdmin\(event\)/);
  assert.match(admin, /admin\.accessed/);
  assert.match(admin, /admin\.roles\.manage/);
  assert.match(admin, /admin\.invitations\.manage/);
  assert.match(admin, /admin\.members\.manage/);
});
