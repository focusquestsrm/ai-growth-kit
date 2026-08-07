const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'styles.css'), 'utf8');

test('one reusable guidance component serves only My Business pages', () => {
  assert.match(app, /function BusinessGuidanceSidebar\(key\)/);
  assert.match(app, /const businessGuidanceContent=/);
  assert.equal((html.match(/class="business-guidance"/g) || []).length, 3);
  ['profile','assessment','savedStrategies'].forEach((key) => assert.match(html, new RegExp(`data-guidance="${key}"`)));
  ['page-dashboard','page-library','page-opportunities','page-settings','page-admin'].forEach((id) => {
    const start = html.indexOf(`id="${id}"`);
    const end = html.indexOf('</section>', start);
    assert.doesNotMatch(html.slice(start, end), /business-guidance/, `${id} must not contain guidance`);
  });
});

test('guidance configuration contains the required contextual content', () => {
  ['Business Growth Tips','Assessment Guidance','Turn Strategy Into Action','Goal-Setting Tips','Your Next Best Moves'].forEach((title) => assert.ok(app.includes(title), `missing ${title}`));
  ['Define Your Ideal Customer','What Strong Businesses Do','Generating a strategy is the beginning','How to Write a Powerful Capability Statement','Recommended Next Step','Keep Growing'].forEach((copy) => assert.ok(app.includes(copy), `missing ${copy}`));
  assert.match(app, /profileComplete\(\)\?/);
  assert.match(app, /state\.assessment\?\.latest\?/);
  assert.match(app, /state\.workspace\.outputs\?\.\[0\]/);
  assert.doesNotMatch(app, /Business Health Score/);
});

test('desktop guidance is compact and sticky while smaller layouts stack', () => {
  assert.match(css, /\.my-business-layout\{display:grid;grid-template-columns:minmax\(0,1fr\) minmax\(300px,320px\)/);
  assert.match(css, /\.guidance-sticky\{position:sticky/);
  assert.match(css, /@media\(max-width:1180px\)\{\.my-business-layout\{grid-template-columns:1fr\}/);
  assert.match(css, /@media\(max-width:700px\)[^{]*\{[^}]*\.business-guidance/);
  assert.doesNotMatch(app, /guidance[^\n]*href=/i);
});
