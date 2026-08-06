const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const required = ['public/index.html', 'public/styles.css', 'public/app.js', 'public/d9-logo.png', 'public/d9-logo-white.png', 'netlify/functions/auth-session.js', 'netlify/functions/member-eligibility.js', 'netlify/functions/prompts-list.js', 'netlify/functions/member-workspace.js', 'netlify/functions/admin-console.js', 'netlify/functions/admin-member-import.js', 'netlify/functions/health.js'];
const missing = required.filter((file) => !fs.existsSync(path.join(root, file)));
if (missing.length) throw new Error(`Missing build assets: ${missing.join(', ')}`);
const browserBundle = ['public/index.html', 'public/styles.css', 'public/app.js'].map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
if (/Nexx Jenn Technologies/i.test(browserBundle)) throw new Error('Prohibited vendor branding found in the member application');
if (/Bronze Plus/i.test(browserBundle)) throw new Error('Unsupported member tier found in the member application');
if (/next implementation slice/i.test(browserBundle)) throw new Error('Placeholder implementation copy found');
const jsFiles = [...fs.readdirSync(path.join(root, 'netlify/functions')).filter((name) => name.endsWith('.js')).map((name) => `netlify/functions/${name}`), 'public/app.js', 'scripts/check-config.js', 'scripts/serve-static.js'];
for (const file of jsFiles) { const check = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' }); if (check.status !== 0) throw new Error(`${file} failed syntax validation:\n${check.stderr}`); }
console.log(`Build validation passed (${required.length} assets, ${jsFiles.length} scripts).`);
