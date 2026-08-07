const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'styles.css'), 'utf8');
const assessment = fs.readFileSync(path.join(root, 'netlify', 'functions', 'assessment.js'), 'utf8');
const approved = ['strategy-operations', 'leadership-growth', 'marketing-content', 'sales-relationships', 'profile-branding'];

test('every approved category has a valid mapped PNG asset', () => {
  for (const slug of approved) {
    assert.match(app, new RegExp(`'${slug}':'/assets/${slug}\\.png'`));
    const image = fs.readFileSync(path.join(root, 'public', 'assets', `${slug}.png`));
    assert.deepEqual([...image.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  }
  assert.doesNotMatch(app, /'opportunities-procurement':'\/assets\//);
});

test('one resolver enforces custom, category, and generic thumbnail priority', () => {
  assert.match(app, /function categoryThumbnail\(item,compact=false\)/);
  assert.match(app, /if\(item\?\.thumbnail_url\)return thumbnailImage/);
  assert.match(app, /if\(categoryAsset\)return thumbnailImage/);
  assert.match(app, /category-thumbnail generic/);
  assert.match(app, /recommendedPrompts\(\)\.map\(\(prompt\)=>promptCard\(prompt,true\)\)/);
  assert.match(app, /categoryThumbnail\(visual,true\)/);
  assert.match(app, /toolId=tool\.id\|\|tool\.prompt_id/);
});

test('thumbnail presentation preserves artwork and accessible descriptions', () => {
  assert.match(css, /\.category-thumbnail\{height:150px;/);
  assert.match(css, /\.category-thumbnail\.image img\{[^}]*object-fit:contain/);
  assert.match(css, /\.category-thumbnail\.compact\{[^}]*height:96px/);
  assert.match(app, /alt="\$\{escapeHtml\(alt\)\}" loading="lazy"/);
});

test('immediate assessment recommendations retain thumbnail metadata', () => {
  ['thumbnail_url', 'thumbnail_type', 'prompt_categories'].forEach((field) => assert.match(assessment, new RegExp(`${field}: mapping\\.prompts\\.${field}`)));
});
