const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const tierNames = { 1: 'Bronze', 2: 'Silver', 3: 'Gold', 4: 'Platinum' };
const state = { session: null, member: null, prompts: [], admin: null, workspace: { profile: null, outputs: [], generations: [] }, category: 'all', history: [], importPayload: null, currentOutput: null };

function escapeHtml(value) { const node = document.createElement('div'); node.textContent = String(value ?? ''); return node.innerHTML; }
function toast(message, error = false) { const el = $('#toast'); el.textContent = message; el.className = `toast show${error ? ' error' : ''}`; clearTimeout(toast.timer); toast.timer = setTimeout(() => el.className = 'toast', 3200); }
function message(form, value, success = false) { const el = $('[data-message]', form); if (el) { el.textContent = value || ''; el.classList.toggle('success', success); } }
function setBusy(form, busy) { $$('button', form).forEach((button) => button.disabled = busy); }

async function api(path, options = {}) {
  const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(state.session?.access_token ? { Authorization: `Bearer ${state.session.access_token}` } : {}), ...(options.headers || {}) };
  const result = await fetch(`/api/${path}`, { ...options, headers });
  const body = await result.json().catch(() => ({}));
  if (!result.ok) { const error = new Error(body.error || 'Something went wrong.'); error.status = result.status; throw error; }
  return body;
}

function saveSession(session) { state.session = session; sessionStorage.setItem('d9-session', JSON.stringify(session)); }
function signOut() { state.session = state.member = state.admin = null; sessionStorage.removeItem('d9-session'); $('#appView').classList.add('hidden'); $('#verifyForm').classList.add('hidden'); $('#loginForm').classList.remove('hidden'); $('#authView').classList.remove('hidden'); $('#loginForm').reset(); }
function showVerification() { $('#loginForm').classList.add('hidden'); $('#verifyForm').classList.remove('hidden'); $('#verifyForm [name=email]').value = state.session?.user?.email || ''; }

$('#loginForm').addEventListener('submit', async (event) => {
  event.preventDefault(); const form = event.currentTarget; message(form, ''); setBusy(form, true);
  try { const data = Object.fromEntries(new FormData(form)); saveSession(await api('auth-session', { method: 'POST', body: JSON.stringify(data) })); await enterApp(); }
  catch (error) { message(form, error.message); } finally { setBusy(form, false); }
});

$('#verifyForm').addEventListener('submit', async (event) => {
  event.preventDefault(); const form = event.currentTarget; message(form, ''); setBusy(form, true);
  try { await api('member-eligibility', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) }); await enterApp(); }
  catch (error) { message(form, error.message); } finally { setBusy(form, false); }
});

async function enterApp() {
  try {
    let data;
    try { data = await api('prompts-list'); }
    catch (memberError) {
      if (memberError.status !== 403) throw memberError;
      try {
        state.admin = await api('admin-console'); state.member = null; state.prompts = [];
        $('#authView').classList.add('hidden'); $('#appView').classList.remove('hidden'); $('#adminNav').classList.remove('hidden');
        $$('[data-page="library"],[data-page="saved"],[data-page="history"],[data-page="profile"]').forEach((item) => item.classList.add('hidden'));
        const email = state.admin.admin.email; $('#memberName').textContent = email; $('#memberTier').textContent = 'Administrator'; $('#tierBadge').textContent = 'Admin'; $('#avatar').textContent = email.slice(0,2).toUpperCase();
        renderAdmin(); go('admin'); return;
      } catch { return showVerification(); }
    }
    state.member = data.member; state.prompts = data.prompts || [];
    $$('[data-page="library"],[data-page="saved"],[data-page="history"],[data-page="profile"]').forEach((item) => item.classList.remove('hidden'));
    $('#authView').classList.add('hidden'); $('#appView').classList.remove('hidden'); renderMember();
    try { state.workspace = await api('member-workspace'); } catch { state.workspace = { profile: null, outputs: [], generations: [] }; }
    renderLibrary(); renderProfile(); go('library');
    try { state.admin = await api('admin-console'); $('#adminNav').classList.remove('hidden'); renderAdmin(); } catch { state.admin = null; $('#adminNav').classList.add('hidden'); }
  } catch (error) {
    if (error.status === 403) return showVerification();
    if (error.status === 401) return signOut();
    toast(error.message, true);
  }
}

function renderMember() {
  const name = [state.member.first_name, state.member.last_name].filter(Boolean).join(' ') || 'D9 Member';
  $('#memberName').textContent = name; $('#memberTier').textContent = `${state.member.growth_kit_tier} member`; $('#tierBadge').textContent = state.member.growth_kit_tier;
  $('#avatar').textContent = name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase(); $('#promptCount').textContent = state.prompts.length;
}

function categoryOf(prompt) { return prompt.prompt_categories || { id: 'uncategorized', name: 'General', slug: 'general' }; }
function filteredPrompts(source = state.prompts) {
  const query = ($('#searchInput').value || '').trim().toLowerCase();
  return source.filter((prompt) => (state.category === 'all' || categoryOf(prompt).slug === state.category) && (!query || `${prompt.title} ${prompt.description} ${(prompt.tags || []).join(' ')}`.toLowerCase().includes(query)));
}
function promptCard(prompt) {
  const cat = categoryOf(prompt);
  return `<article class="prompt-card"><div class="prompt-top"><span class="category-tag">${escapeHtml(cat.name)}</span></div><h4>${escapeHtml(prompt.title)}</h4><p>${escapeHtml(prompt.description)}</p><div class="prompt-foot"><span>${prompt.estimated_minutes || 10} min · ${tierNames[prompt.minimum_tier_rank]}+</span><button class="button subtle" data-open-prompt="${prompt.id}">Open workflow</button></div></article>`;
}
function renderLibrary() {
  const categories = [...new Map(state.prompts.map((prompt) => [categoryOf(prompt).slug, categoryOf(prompt)])).values()];
  $('#categoryFilter').innerHTML = '<option value="all">All categories</option>' + categories.map((cat) => `<option value="${escapeHtml(cat.slug)}">${escapeHtml(cat.name)}</option>`).join('');
  $('#categoryFilter').value = state.category;
  $('#categoryCards').innerHTML = `<button class="category-chip ${state.category === 'all' ? 'active' : ''}" data-category="all">All workflows</button>` + categories.map((cat) => `<button class="category-chip ${state.category === cat.slug ? 'active' : ''}" data-category="${escapeHtml(cat.slug)}">${escapeHtml(cat.name)}</button>`).join('');
  renderPromptResults(); renderSaved(); renderHistory();
}
function renderPromptResults() { const list = filteredPrompts(); $('#resultCount').textContent = `${list.length} result${list.length === 1 ? '' : 's'}`; $('#promptGrid').innerHTML = list.length ? list.map(promptCard).join('') : '<div class="empty">No prompts match those filters.</div>'; }
function renderSaved() { const list = state.workspace.outputs || []; $('#savedGrid').innerHTML = list.length ? list.map((item) => `<article class="saved-output"><h4>${escapeHtml(item.title)}</h4><time>${new Date(item.created_at).toLocaleString()}</time><pre>${escapeHtml(item.output_text)}</pre><div class="prompt-foot"><button class="button subtle" data-copy-output="${item.id}">Copy</button><button class="text-button" data-delete-output="${item.id}">Delete</button></div></article>`).join('') : '<div class="empty">No saved outputs yet. Build a prompt and select “Save output.”</div>'; }
function renderHistory() { const remote = (state.workspace.generations || []).map((item) => ({ title: item.prompts?.title || 'Prompt workflow', category: item.prompts?.prompt_categories?.name || 'Growth Kit', time: new Date(item.created_at).toLocaleString() })); const list = [...state.history, ...remote]; $('#historyList').innerHTML = list.length ? list.map((item) => `<div class="history-row"><div><b>${escapeHtml(item.title)}</b><span>${escapeHtml(item.category)}</span></div><time>${escapeHtml(item.time)}</time></div>`).join('') : '<div class="empty">No prompts generated yet.</div>'; }

function renderProfile() { const form = $('#profileForm'), profile = state.workspace.profile || {}; ['business_name','website','industry','audience','products_services','brand_voice','primary_goal'].forEach((key) => form.elements[key].value = profile[key] || ''); }

function openPrompt(id) {
  const prompt = state.prompts.find((item) => item.id === id); if (!prompt) return;
  state.currentOutput = null;
  const schema = Array.isArray(prompt.prompt_questions) && prompt.prompt_questions.length ? [...prompt.prompt_questions].sort((a,b) => a.sort_order-b.sort_order).map((item) => ({ key: item.field_key, label: item.label, type: item.field_type })) : (Array.isArray(prompt.form_schema) ? prompt.form_schema : []);
  $('#workspace').innerHTML = `<div class="workspace"><form id="builderForm" class="panel"><p class="eyebrow">${escapeHtml(categoryOf(prompt).name)}</p><h3>${escapeHtml(prompt.title)}</h3><p class="muted">${escapeHtml(prompt.description)}</p>${schema.map((field, index) => `<div class="question"><label for="answer-${index}">${escapeHtml(field.label || `Question ${index + 1}`)}</label>${field.type === 'text' ? `<input id="answer-${index}" name="${escapeHtml(field.key)}" required>` : `<textarea id="answer-${index}" name="${escapeHtml(field.key)}" required></textarea>`}</div>`).join('')}<div class="workspace-actions"><button class="button primary" type="submit">Build my prompt</button><button id="clearBuilder" class="button subtle" type="button">Clear and restart</button></div></form><div><div class="panel"><p class="eyebrow">Your engineered prompt</p><h3>Ready to use</h3><p class="muted">Complete the guided questions, then copy or save the result.</p><div id="promptOutput" class="output">Your finished prompt will appear here.</div><div class="workspace-actions"><button id="copyPrompt" class="button subtle" type="button">Copy prompt</button><button id="saveOutput" class="button primary" type="button" disabled>Save output</button></div></div><div class="market-callout"><small>Future Marketplace upgrade</small><h4>${escapeHtml(categoryOf(prompt).name)} Agent</h4><p>${escapeHtml(prompt.marketplace_upgrade_message || 'Connect saved business context, automation, and ongoing recommendations in a future D9Network Marketplace upgrade.')}</p></div></div></div>`;
  $('#builderForm').addEventListener('submit', async (event) => {
    event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); let output = prompt.user_prompt_template;
    Object.entries(values).forEach(([key, value]) => output = output.replaceAll(`{{${key}}}`, String(value).trim())); $('#promptOutput').textContent = output;
    state.currentOutput = { prompt_id: prompt.id, title: prompt.title, input_payload: values, output_text: output }; $('#saveOutput').disabled = false;
    state.history.unshift({ title: prompt.title, category: categoryOf(prompt).name, time: new Date().toLocaleString() }); renderHistory();
    try { await api('member-workspace', { method: 'POST', body: JSON.stringify({ action: 'record_generation', ...state.currentOutput }) }); } catch (error) { toast(`Prompt created, but usage could not be recorded: ${error.message}`, true); }
  });
  go('workspace');
}

function go(name) { $$('.page').forEach((page) => page.classList.toggle('active', page.id === `page-${name}`)); $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.page === name)); const titles = { library: 'Prompt library', saved: 'Saved outputs', history: 'Recent activity', profile: 'Business profile', workspace: 'Guided workflow', admin: 'Admin console', import: 'Member synchronization' }; $('#pageTitle').textContent = titles[name] || 'AI Growth Kit'; $('.sidebar').classList.remove('open'); window.scrollTo(0, 0); }

function renderAdmin() {
  if (!state.admin) return; const stats = state.admin.stats || {};
  $('#adminStats').innerHTML = [['Active members', stats.members], ['Catalog prompts', stats.prompts], ['Published', stats.published], ['Administrators', stats.administrators], ['Recent generations', stats.generations]].map(([label, value]) => `<div class="stat"><span>${label}</span><b>${value || 0}</b></div>`).join('');
  renderAdminPrompts();
  $('#roleList').innerHTML = (state.admin.roles || []).map((role) => `<div class="role-row"><div><b>${escapeHtml(role.email)}</b><span>${escapeHtml(role.role.replaceAll('_', ' '))}</span></div><button class="text-button" data-remove-role="${role.id}" data-email="${escapeHtml(role.email)}" data-role="${role.role}">Remove</button></div>`).join('') || '<p class="muted">No roles assigned.</p>';
  $('#categoryList').innerHTML = (state.admin.categories || []).map((cat) => `<div class="role-row"><div><b>${escapeHtml(cat.name)}</b><span>${escapeHtml(cat.slug)}</span></div><button class="text-button" data-edit-category="${cat.id}">Edit</button></div>`).join('');
  $('#editorForm [name=category_id]').innerHTML = (state.admin.categories || []).map((cat) => `<option value="${cat.id}">${escapeHtml(cat.name)}</option>`).join('');
  renderAdminMembers();
  const usage = new Map(); (state.admin.generations || []).forEach((item) => { const title = item.prompts?.title || 'Unknown prompt'; usage.set(title, (usage.get(title) || 0) + 1); });
  $('#usageAnalytics').innerHTML = [...usage.entries()].sort((a,b) => b[1]-a[1]).slice(0,8).map(([title,count]) => `<div class="metric-row"><b>${escapeHtml(title)}</b><span>${count} use${count === 1 ? '' : 's'}</span></div>`).join('') || '<p class="muted">No prompt usage recorded yet.</p>';
  $('#recentImports').innerHTML = (state.admin.imports || []).map((item) => `<div class="metric-row"><div><b>${escapeHtml(item.filename)}</b><br><span>${new Date(item.created_at).toLocaleString()}</span></div><span>${item.accepted_rows}/${item.total_rows} accepted</span></div>`).join('') || '<p class="muted">No member imports recorded yet.</p>';
}
function renderAdminPrompts() {
  const query = ($('#adminSearch').value || '').toLowerCase(); const list = (state.admin?.prompts || []).filter((prompt) => `${prompt.title} ${prompt.description}`.toLowerCase().includes(query));
  $('#promptTable').innerHTML = `<table class="data-table"><thead><tr><th>Prompt</th><th>Tier</th><th>Status</th><th></th></tr></thead><tbody>${list.map((prompt) => `<tr><td><b>${escapeHtml(prompt.title)}</b><br><span class="muted">${escapeHtml(prompt.prompt_categories?.name || 'Uncategorized')}</span></td><td>${tierNames[prompt.minimum_tier_rank]}</td><td><span class="status ${prompt.status === 'published' ? 'published' : 'draft'}">${escapeHtml(prompt.status || 'draft')}</span></td><td><button class="text-button" data-edit-prompt="${prompt.id}">Edit</button></td></tr>`).join('')}</tbody></table>`;
}
function renderAdminMembers() { const query = ($('#memberSearch').value || '').toLowerCase(); const list = (state.admin?.members || []).filter((member) => `${member.email} ${member.first_name || ''} ${member.last_name || ''} ${member.company || ''}`.toLowerCase().includes(query)); $('#memberTable').innerHTML = `<table class="data-table"><thead><tr><th>Member</th><th>BD ID</th><th>Tier</th><th>Access</th><th></th></tr></thead><tbody>${list.map((member) => { const enabled = member.access_enabled && member.source_active; return `<tr><td><b>${escapeHtml([member.first_name,member.last_name].filter(Boolean).join(' ') || member.email)}</b><br><span class="muted">${escapeHtml(member.email)}</span></td><td>${escapeHtml(member.bd_user_id)}</td><td>${escapeHtml(member.growth_kit_tier)}</td><td><span class="member-state ${enabled ? 'enabled' : 'disabled'}">${enabled ? 'Enabled' : 'Disabled'}</span></td><td><button class="text-button" data-member-access="${member.id}" data-enabled="${enabled}">${enabled ? 'Disable' : 'Enable'}</button></td></tr>`; }).join('')}</tbody></table>`; }
async function reloadAdmin() { state.admin = await api('admin-console'); renderAdmin(); }

function openPromptEditor(id) {
  const form = $('#editorForm'); form.reset(); const item = id ? state.admin.prompts.find((prompt) => prompt.id === id) : null;
  $('#editorTitle').textContent = item ? 'Edit prompt' : 'Create prompt'; form.elements.id.value = item?.id || ''; form.elements.title.value = item?.title || ''; form.elements.slug.value = item?.slug || ''; form.elements.category_id.value = item?.category_id || state.admin.categories?.[0]?.id || ''; form.elements.minimum_tier.value = tierNames[item?.minimum_tier_rank] || 'Bronze'; form.elements.description.value = item?.description || ''; form.elements.user_prompt_template.value = item?.user_prompt_template || ''; form.elements.marketplace_upgrade_message.value = item?.marketplace_upgrade_message || ''; form.elements.estimated_minutes.value = item?.estimated_minutes || 10; form.elements.is_featured.checked = Boolean(item?.is_featured); form.elements.status.value = item?.status || 'draft'; form.elements.questions.value = (item?.form_schema || []).map((field) => `${field.key}|${field.label}`).join('\n'); $('#deletePrompt').classList.toggle('hidden', !item); $('#editorDialog').showModal();
}
$('#editorForm').addEventListener('submit', async (event) => {
  event.preventDefault(); const form = event.currentTarget; const raw = Object.fromEntries(new FormData(form));
  const prompt = { ...raw, is_featured: form.elements.is_featured.checked, form_schema: raw.questions.split('\n').map((line, index) => { const [key, ...label] = line.split('|'); return line.trim() ? { key: (label.length ? key : `answer${index + 1}`).trim(), label: (label.length ? label.join('|') : key).trim(), type: 'textarea' } : null; }).filter(Boolean) }; delete prompt.questions;
  setBusy(form, true); try { await api('admin-console', { method: 'POST', body: JSON.stringify({ action: 'save_prompt', prompt }) }); $('#editorDialog').close(); await reloadAdmin(); toast('Prompt saved.'); } catch (error) { message(form, error.message); } finally { setBusy(form, false); }
});

function openCategoryEditor(id) { const form = $('#categoryForm'); form.reset(); const item = id ? state.admin.categories.find((cat) => cat.id === id) : null; ['id', 'name', 'slug', 'description', 'sort_order'].forEach((key) => form.elements[key].value = item?.[key] ?? (key === 'sort_order' ? 0 : '')); $('#deleteCategory').classList.toggle('hidden', !item); $('#categoryDialog').showModal(); }
$('#categoryForm').addEventListener('submit', async (event) => { event.preventDefault(); const form = event.currentTarget; setBusy(form, true); try { await api('admin-console', { method: 'POST', body: JSON.stringify({ action: 'save_category', category: Object.fromEntries(new FormData(form)) }) }); $('#categoryDialog').close(); await reloadAdmin(); toast('Category saved.'); } catch (error) { message(form, error.message); } finally { setBusy(form, false); } });
$('#roleForm').addEventListener('submit', async (event) => { event.preventDefault(); const form = event.currentTarget; setBusy(form, true); try { await api('admin-console', { method: 'POST', body: JSON.stringify({ action: 'add_role', ...Object.fromEntries(new FormData(form)) }) }); $('#roleDialog').close(); form.reset(); await reloadAdmin(); toast('Administrator role assigned.'); } catch (error) { message(form, error.message); } finally { setBusy(form, false); } });
$('#profileForm').addEventListener('submit', async (event) => { event.preventDefault(); const form = event.currentTarget; setBusy(form, true); message(form, ''); try { const result = await api('member-workspace', { method: 'POST', body: JSON.stringify({ action: 'save_profile', profile: Object.fromEntries(new FormData(form)) }) }); state.workspace.profile = result.profile; message(form, 'Business profile saved.', true); toast('Business profile saved.'); } catch (error) { message(form, error.message); } finally { setBusy(form, false); } });

function fileToBase64(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); }); }
$('#memberFile').addEventListener('change', (event) => $('#fileName').textContent = event.target.files[0]?.name || 'No file selected');
$('#importForm').addEventListener('submit', async (event) => { event.preventDefault(); const form = event.currentTarget, file = $('#memberFile').files[0]; if (!file) return; setBusy(form, true); try { state.importPayload = { filename: file.name, mime_type: file.type, file_base64: await fileToBase64(file) }; const result = await api('admin-member-import', { method: 'POST', body: JSON.stringify({ ...state.importPayload, preview: true }) }); renderImportPreview(result); } catch (error) { toast(error.message, true); } finally { setBusy(form, false); } });
function renderImportPreview(result) { const t = result.totals; $('#importPreview').innerHTML = `<h3>Preview results</h3><div class="summary-grid"><div><b>${t.accepted}</b><span>Accepted</span></div><div><b>${t.ignored}</b><span>Ignored</span></div><div><b>${t.rejected}</b><span>Rejected</span></div><div><b>${t.duplicates}</b><span>Duplicates</span></div></div>${t.ignored ? '<p class="warning">Bronze II (Claim) and Ambassador records were ignored.</p>' : ''}${t.rejected ? '<p class="warning">Rejected rows have missing or unsupported required values.</p>' : ''}${t.duplicates ? '<p class="warning">Duplicate emails were resolved to the highest supported tier and will remain in the audit report.</p>' : ''}<button id="commitImport" class="button primary">Commit ${t.accepted} member records</button>`; }

document.addEventListener('click', async (event) => {
  const target = event.target.closest('button'); if (!target) return;
  if (target.dataset.signout !== undefined) return signOut(); if (target.dataset.page) return go(target.dataset.page);
  if (target.dataset.category) { state.category = target.dataset.category; $('#categoryFilter').value = state.category; renderLibrary(); return; }
  if (target.dataset.openPrompt) return openPrompt(target.dataset.openPrompt);
  if (target.id === 'copyPrompt') { await navigator.clipboard.writeText($('#promptOutput').textContent); return toast('Prompt copied.'); }
  if (target.id === 'clearBuilder') { $('#builderForm').reset(); $('#promptOutput').textContent = 'Your finished prompt will appear here.'; $('#saveOutput').disabled = true; state.currentOutput = null; return; }
  if (target.id === 'saveOutput') { if (!state.currentOutput) return; target.disabled = true; try { const result = await api('member-workspace', { method: 'POST', body: JSON.stringify({ action: 'save_output', ...state.currentOutput }) }); state.workspace.outputs.unshift(result.output); renderSaved(); toast('Output saved.'); } catch (error) { toast(error.message, true); target.disabled = false; } return; }
  if (target.dataset.copyOutput) { const item = state.workspace.outputs.find((output) => output.id === target.dataset.copyOutput); if (item) await navigator.clipboard.writeText(item.output_text); return toast('Saved output copied.'); }
  if (target.dataset.deleteOutput) { if (!confirm('Delete this saved output?')) return; try { await api('member-workspace', { method: 'POST', body: JSON.stringify({ action: 'delete_output', id: target.dataset.deleteOutput }) }); state.workspace.outputs = state.workspace.outputs.filter((item) => item.id !== target.dataset.deleteOutput); renderSaved(); toast('Saved output deleted.'); } catch (error) { toast(error.message, true); } return; }
  if (target.id === 'menuButton') return $('.sidebar').classList.toggle('open');
  if (target.id === 'newPrompt') return openPromptEditor(); if (target.dataset.editPrompt) return openPromptEditor(target.dataset.editPrompt);
  if (target.id === 'newRole') return $('#roleDialog').showModal(); if (target.id === 'newCategory') return openCategoryEditor(); if (target.dataset.editCategory) return openCategoryEditor(target.dataset.editCategory);
  if (target.value === 'cancel' && target.closest('dialog')) { event.preventDefault(); return target.closest('dialog').close(); }
  if (target.dataset.removeRole) { if (!confirm(`Remove ${target.dataset.role.replaceAll('_', ' ')} from ${target.dataset.email}?`)) return; try { await api('admin-console', { method: 'POST', body: JSON.stringify({ action: 'remove_role', email: target.dataset.email, role: target.dataset.role }) }); await reloadAdmin(); toast('Administrator role removed.'); } catch (error) { toast(error.message, true); } return; }
  if (target.dataset.memberAccess) { const enabled = target.dataset.enabled !== 'true'; try { await api('admin-console', { method: 'POST', body: JSON.stringify({ action: 'set_member_access', id: target.dataset.memberAccess, enabled }) }); await reloadAdmin(); toast(`Member access ${enabled ? 'enabled' : 'disabled'}.`); } catch (error) { toast(error.message, true); } return; }
  if (target.id === 'deletePrompt' || target.id === 'deleteCategory') { const form = target.closest('form'), kind = target.id === 'deletePrompt' ? 'prompt' : 'category'; if (!confirm(`Delete this ${kind}? This cannot be undone.`)) return; try { await api('admin-console', { method: 'POST', body: JSON.stringify({ action: `delete_${kind}`, id: form.elements.id.value }) }); target.closest('dialog').close(); await reloadAdmin(); toast(`${kind[0].toUpperCase() + kind.slice(1)} deleted.`); } catch (error) { toast(error.message, true); } return; }
  if (target.id === 'commitImport') { target.disabled = true; try { const result = await api('admin-member-import', { method: 'POST', body: JSON.stringify({ ...state.importPayload, preview: false }) }); toast(`${result.totals.accepted} member records synchronized.`); state.importPayload = null; $('#importForm').reset(); $('#fileName').textContent = 'No file selected'; $('#importPreview').innerHTML = '<h3>Synchronization complete</h3><p class="muted">The import and its exceptions were recorded in the audit trail.</p>'; await reloadAdmin(); } catch (error) { toast(error.message, true); target.disabled = false; } }
});

$('#searchInput').addEventListener('input', renderPromptResults); $('#categoryFilter').addEventListener('change', (event) => { state.category = event.target.value; renderLibrary(); }); $('#adminSearch').addEventListener('input', renderAdminPrompts); $('#memberSearch').addEventListener('input', renderAdminMembers);

(async function boot() { try { const stored = JSON.parse(sessionStorage.getItem('d9-session')); if (stored?.access_token) { state.session = stored; await enterApp(); } } catch { signOut(); } })();
