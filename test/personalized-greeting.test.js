const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { resolveFirstName, validFirstName } = require('../netlify/functions/_identity');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const prompts = fs.readFileSync(path.join(root, 'netlify', 'functions', 'prompts-list.js'), 'utf8');

test('personalized name lookup follows the required source order', () => {
  assert.equal(resolveFirstName({ first_name: 'Tina', full_name: 'Profile Person' }, { user_metadata: { first_name: 'Nick', full_name: 'Sean Smith' } }), 'Tina');
  assert.equal(resolveFirstName({ first_name: 'Your' }, { user_metadata: { first_name: 'Nick' } }), 'Nick');
  assert.equal(resolveFirstName({}, { user_metadata: { full_name: 'Sean Smith' } }), 'Sean');
  assert.equal(resolveFirstName({}, {}), '');
});

test('placeholder and empty names can never become greetings', () => {
  ['Your', 'USER', 'null', 'Undefined', '', null, undefined].forEach((value) => assert.equal(validFirstName(value), ''));
  assert.match(app, /invalidFirstNames=new Set\(\['your','user','null','undefined'\]\)/);
  assert.match(app, /first\?`\$\{prefix\}, \$\{first\}`:prefix/);
});

test('member and preview responses use the authenticated identity resolution', () => {
  assert.match(prompts, /first_name: access\.firstName \|\| null/);
  assert.match(app, /personalizedGreeting\(identity\)/);
  assert.match(app, /account\.first_name=personalizedFirstName\(account\)\|\|null/);
});
