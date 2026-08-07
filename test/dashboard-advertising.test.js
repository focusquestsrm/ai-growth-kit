const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'styles.css'), 'utf8');
const assetPath = path.join(root, 'public', 'assets', 'sample-ad.png');

test('approved advertisement asset is a deployable full-resolution PNG', () => {
  const image = fs.readFileSync(assetPath);
  assert.deepEqual([...image.subarray(0, 8)], [137,80,78,71,13,10,26,10]);
  assert.equal(image.readUInt32BE(16), 1024);
  assert.equal(image.readUInt32BE(20), 1536);
  assert.doesNotMatch(`${html}\n${app}`, /C:\\Users\\|ai-growth-kit\\sample-ad/i);
});

test('dashboard ad rail begins after the unchanged full-width hero', () => {
  const hero = html.indexOf('class="dashboard-growth-hero"');
  const layout = html.indexOf('class="dashboard-content-layout"');
  const rail = html.indexOf('id="dashboardRightRail"');
  assert.ok(hero >= 0 && layout > hero && rail > layout);
  assert.match(html, /id="dashboardWelcome"/);
  ['dashboardToolsMetric','dashboardStrategiesMetric','dashboardAssessmentMetric'].forEach((id) => assert.match(html, new RegExp(`id="${id}"`)));
  assert.match(css, /\.dashboard-content-layout\{display:grid;grid-template-columns:minmax\(0,1fr\) minmax\(280px,300px\)/);
});

test('AdPlacement is reusable, clearly sponsored, and future-ready', () => {
  assert.match(app, /function AdPlacement\(ad\)/);
  assert.match(app, /function eligibleAdsForPlacement\(records,placement/);
  ['id','advertiser_name','headline','image_url','destination_url','cta_text','placement','start_date','end_date','active','membership_target','industry_target','impressions','clicks'].forEach((field) => assert.ok(app.includes(`${field}:`), `missing ${field}`));
  assert.match(app, /ad-sponsored-label">Sponsored/);
  assert.match(app, /Sponsored advertisement featuring D9Network and ABC Financial Solutions/);
  assert.match(app, /rel="sponsored noopener"/);
});

test('all authenticated member views receive responsive, uncropped advertising', () => {
  assert.doesNotMatch(app, /dashboardAdRecords[^;]*(minimum_tier|growth_kit_tier)/);
  assert.match(css, /\.ad-placement img\{[^}]*width:100%;height:auto;object-fit:contain/);
  assert.match(css, /\.dashboard-ad-sticky\{position:sticky;top:86px/);
  assert.match(css, /@media\(max-width:1100px\)[^{]*\{[^}]*\.dashboard-content-layout\{grid-template-columns:1fr/);
  assert.match(css, /\.dashboard-right-rail\{grid-row:2\}/);
  assert.ok(html.indexOf('id="dashboardRightRail"') < html.indexOf('class="dashboard-primary dashboard-recommendations-content"'));
});
