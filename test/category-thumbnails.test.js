const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'styles.css'), 'utf8');
const assessment = fs.readFileSync(path.join(root, 'netlify', 'functions', 'assessment.js'), 'utf8');
const approved = ['strategy-operations', 'leadership-growth', 'marketing-content', 'sales-relationships', 'profile-branding', 'opportunities-procurement'];
const catalogSql = ['003_complete_growth_kit.sql', '004_business_growth_platform.sql'].map((file) => fs.readFileSync(path.join(root, 'supabase', 'migrations', file), 'utf8')).join('\n');

test('every approved category has a valid mapped PNG asset', () => {
  for (const slug of approved) {
    assert.match(app, new RegExp(`'${slug}':'/assets/${slug}\\.png'`));
    const image = fs.readFileSync(path.join(root, 'public', 'assets', `${slug}.png`));
    assert.deepEqual([...image.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    const width = image.readUInt32BE(16), height = image.readUInt32BE(20);
    assert.ok(Math.abs(width / height - 1) < 0.03, `${slug} must remain near-square`);
  }
});

test('category IDs, slugs, and display names normalize to the same central map', () => {
  assert.match(app, /function normalizeCategoryKey\(value\)/);
  assert.match(app, /category\.category_slug/);
  const expected = {
    'Strategy & Operations':'strategy-operations',
    'Leadership & Growth':'leadership-growth',
    'Marketing & Content':'marketing-content',
    'Sales & Relationships':'sales-relationships',
    'Profile & Branding':'profile-branding',
    'Opportunities & Procurement':'opportunities-procurement'
  };
  for (const [name, slug] of Object.entries(expected)) {
    const normalized = name.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    assert.match(app, new RegExp(`'${normalized}':'${slug}'`));
  }
});

test('all 33 official tools are assigned to one of the six mapped categories', () => {
  const rows = [...catalogSql.matchAll(/\('([a-z]+(?:-[a-z]+)+)','([^']+)','([a-z0-9-]+)'/g)]
    .map((match) => ({ category:match[1], title:match[2], slug:match[3] }))
    .filter((row) => approved.includes(row.category));
  assert.equal(rows.length, 33);
  rows.forEach((row) => assert.ok(approved.includes(row.category), `${row.title} has unsupported category ${row.category}`));
  const expected = {
    'vendor-readiness-assessment':'opportunities-procurement',
    'capability-statement-outline':'opportunities-procurement',
    'rfp-response-outline':'opportunities-procurement',
    '90-day-growth-plan':'strategy-operations',
    'growth-roadmap':'strategy-operations',
    'business-profile-enhancer':'profile-branding',
    'ideal-customer-profile':'marketing-content',
    'sales-outreach-message':'sales-relationships',
    'executive-growth-brief':'leadership-growth'
  };
  for (const [slug, category] of Object.entries(expected)) assert.equal(rows.find((row) => row.slug === slug)?.category, category, slug);
});

test('one resolver enforces custom, category, and generic thumbnail priority', () => {
  assert.match(app, /function categoryThumbnail\(item,compact=false\)/);
  assert.match(app, /if\(item\?\.thumbnail_url\)return thumbnailImage/);
  assert.match(app, /if\(categoryAsset\)return thumbnailImage/);
  assert.match(app, /category-thumbnail generic/);
  assert.match(app, /recommendedPrompts\(\)\.map\(\(prompt\)=>recommendedToolCard\(prompt,recommendationReason\(prompt\),true\)\)/);
  assert.match(app, /categoryThumbnail\(visual,true\)/);
  assert.match(app, /toolId=tool\.id\|\|tool\.prompt_id/);
  const recommendationRenderer = app.match(/function assessmentRecommendationCards[^\n]+/)?.[0] || '';
  assert.match(recommendationRenderer, /categoryThumbnail\(visual,true\)/);
  assert.match(recommendationRenderer, /locked-note/);
});

test('thumbnail presentation preserves artwork and accessible descriptions', () => {
  assert.match(css, /\.category-thumbnail\{flex:0 0 120px;width:120px;height:120px;aspect-ratio:1\/1/);
  assert.match(css, /\.category-thumbnail\.image img\{[^}]*object-fit:contain/);
  assert.match(css, /\.category-thumbnail\.compact\{[^}]*width:72px;height:72px;aspect-ratio:1\/1/);
  assert.match(app, /alt="\$\{escapeHtml\(alt\)\}" loading="lazy"/);
});

test('standard and recommendation cards use compact square header layouts', () => {
  assert.match(app, /class="tool-card-header">\$\{categoryThumbnail\(prompt,compact\)\}/);
  assert.match(app, /class="recommendation-card-header">\$\{categoryThumbnail\(visual,true\)\}/);
  assert.match(css, /\.tool-card-header\{display:grid;grid-template-columns:120px minmax\(0,1fr\)/);
  assert.match(css, /\.recommendation-card-header\{display:grid;grid-template-columns:72px minmax\(0,1fr\)/);
  assert.match(css, /@media\(max-width:600px\)\{\.category-thumbnail:not\(\.compact\)\{[^}]*width:88px;height:88px/);
  assert.match(css, /\.category-thumbnail\{[^}]*background:transparent/);
  assert.doesNotMatch(css, /\.prompt-card>\.category-thumbnail\.compact\{width:calc/);
});

test('immediate assessment recommendations retain thumbnail metadata', () => {
  ['thumbnail_url', 'thumbnail_type', 'prompt_categories'].forEach((field) => assert.match(assessment, new RegExp(`${field}: mapping\\.prompts\\.${field}`)));
});
