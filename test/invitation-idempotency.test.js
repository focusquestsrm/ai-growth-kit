const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const app = read('public', 'app.js');
const html = read('public', 'index.html');
const admin = read('netlify', 'functions', 'admin-console.js');
const shared = read('netlify', 'functions', '_shared.js');
const migration = read('supabase', 'migrations', '013_idempotent_platform_invitations.sql');

test('invitation form prevents a second in-flight submission', () => {
  assert.match(html, /id="sendInvitation"/);
  assert.match(html, /data-message aria-live="polite"/);
  assert.match(app, /e\.submitter\?\.value==='cancel'/);
  assert.match(app, /form\.dataset\.submitting==='true'/);
  assert.match(app, /form\.dataset\.submitting='true'/);
  assert.match(app, /setBusy\(form,true\)/);
  assert.match(app, /delete form\.dataset\.submitting;setBusy\(form,false\)/);
});

test('server reuses pending invitations and rejects sent or accepted duplicates', () => {
  assert.match(admin, /normalized_email=eq\.\$\{encodeURIComponent\(email\)\}/);
  assert.match(admin, /existing\?\.\[0\]\?\.accepted_at/);
  assert.match(admin, /existing\?\.\[0\]\?\.auth_invited_at/);
  assert.match(admin, /method:'PATCH'/);
  assert.match(admin, /already being processed/);
});

test('failed delivery records remain retryable and useful safe errors are returned', () => {
  assert.match(admin, /invitation\.delivery_failed/);
  assert.match(admin, /body\.action === 'resend_invitation'/);
  assert.match(admin, /body\.action === 'delete_invitation'/);
  assert.match(admin, /Only invitations that failed before delivery can be removed/);
  assert.match(admin, /Invitation email limit reached/);
  assert.match(admin, /authentication account already exists/);
  assert.match(admin, /Supabase email settings/);
  assert.match(shared, /error\.status = res\.status/);
  assert.match(shared, /redirect_to: invitationRedirectUrl\(destination\)/);
  assert.match(admin, /role === 'member' \? '\/login' : '\/admin\/login'/);
});

test('invitation administration displays status and wires retry and removal controls', () => {
  assert.match(app, /function invitationRow\(item\)/);
  assert.match(app, /data-resend-invitation/);
  assert.match(app, /data-delete-invitation/);
  assert.match(app, /action:'resend_invitation'/);
  assert.match(app, /action:'delete_invitation'/);
  assert.match(app, /Remove this failed invitation record/);
});

test('migration removes existing duplicates and enforces one invitation per email', () => {
  assert.match(migration, /row_number\(\) over/);
  assert.match(migration, /partition by normalized_email/);
  assert.match(migration, /duplicate_rank > 1/);
  assert.match(migration, /create unique index if not exists platform_invitations_normalized_email_unique/);
});
