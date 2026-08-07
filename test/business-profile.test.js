const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'styles.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const api = fs.readFileSync(path.join(root, 'netlify', 'functions', 'member-workspace.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '007_business_profile_experience.sql'), 'utf8');
const visualMigration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '008_visual_growth_experience.sql'), 'utf8');

test('Business Profile uses the supplied visuals and compact responsive sections', () => {
  assert.match(html, /src="\/assets\/business-profile-hero\.png"/);
  assert.match(html, /src="\/assets\/business-stages\.png"/);
  ['Business Basics','Business Stage','Customers &amp; Markets','Growth &amp; Goals','Certifications &amp; Designations','Digital Presence'].forEach((heading) => assert.ok(html.includes(heading)));
  assert.match(css, /\.profile-hero\{[^}]*height:auto/);
  assert.match(css, /@media\(max-width:600px\)[^{]*\{[^}]*\.profile-hero/);
  assert.doesNotMatch(css, /\.profile-(?:section|form)[^{]*\{[^}]*font-size:(?:4[1-9]|[5-9]\d)px/);
});

test('searchable profile choices and conditional Other fields are accessible', () => {
  ['industryOptions','geographicMarketOptions'].forEach((id) => assert.match(html, new RegExp(`list="${id}"`)));
  ['industryHelp','geographicMarketHelp','primaryBusinessChallengeHelp','otherIndustryHelp','otherCertificationHelp','otherBusinessChallengeHelp'].forEach((id) => assert.match(html, new RegExp(`aria-describedby="[^"]*${id}`)));
  assert.match(app, /validateProfileChoice/);
  assert.match(app, /field\.focus\(\)/);
  assert.match(app, /stageDefinitions/);
  assert.match(app, /geographicDefinitions/);
});

test('certifications are structured and exclusive selections are enforced', () => {
  assert.equal((html.match(/name="business_certifications"/g) || []).length, 11);
  assert.match(html, /value="None"/);
  assert.match(html, /value="Not Sure"/);
  assert.match(app, /exclusive=\['None','Not Sure'\]/);
  assert.match(api, /profile\.business_certifications = certifications/);
  assert.match(migration, /business_certifications jsonb/);
});

test('obsolete profile fields are removed after preserving legacy values', () => {
  assert.doesNotMatch(html, /name="(?:minority_owned_status|small_business_status|social_media|certifications)"/);
  assert.doesNotMatch(api, /'minority_owned_status'|'small_business_status'|'social_media'|'certifications'/);
  assert.match(migration, /legacy_profile_data/);
  ['social_media','certifications','minority_owned_status','small_business_status'].forEach((column) => assert.ok(migration.includes(`to_jsonb(profile)->>'${column}'`), `${column} migration is not safe when the legacy column is absent`));
  assert.match(migration, /drop column if exists minority_owned_status/);
});

test('new profile data is persisted and social links use URL inputs', () => {
  ['primary_markets_served','markets_to_enter','other_business_challenge','other_industry_name','other_certification_name','interested_in_certifications','social_linkedin','social_facebook','social_instagram','social_x','social_other'].forEach((name) => {
    assert.match(html, new RegExp(`name="${name}"`));
    assert.ok(api.includes(`'${name}'`), `API does not allow ${name}`);
    assert.match(migration, new RegExp(name));
  });
  assert.equal((html.match(/name="social_(?:linkedin|facebook|instagram|x|other)" type="url"/g) || []).length, 5);
});

test('Primary Business Challenge is a searchable structured multi-select', () => {
  assert.equal((html.match(/name="primary_business_challenges"/g) || []).length, 11);
  assert.match(html, /id="challengeSearch" type="search"/);
  assert.match(html, /id="challengeChips"/);
  assert.match(app, /selectedChallenges/);
  assert.match(api, /profile\.primary_business_challenges = challenges/);
  assert.match(visualMigration, /primary_business_challenges jsonb/);
});
