const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');

test('uses the official product identity and footer', () => {
  assert.match(html, /<title>The D9Network AI Business Growth Platform<\/title>/);
  assert.match(html, /© D9Network/);
  assert.match(html, /All Rights Reserved\./);
  assert.doesNotMatch(`${html}\n${app}`, /Nexx Jenn Technologies/i);
});

test('member experience contains every Sprint 2 workspace', () => {
  ['page-dashboard','page-library','page-saved','page-history','page-profile','page-health','page-opportunities'].forEach((id) => assert.match(html, new RegExp(`id="${id}"`)));
  assert.match(app, /duplicate_output/);
  assert.match(app, /set_favorite/);
  assert.match(app, /submit_feedback/);
  assert.match(app, /save_health/);
});

test('regular member navigation never links to the Intelligence Dashboard', () => {
  assert.doesNotMatch(html, /data-page="intelligence/i);
});
