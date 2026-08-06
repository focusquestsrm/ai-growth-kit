const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const tierNames = { 1: 'Bronze', 2: 'Silver', 3: 'Gold', 4: 'Platinum' };
const state = { session: null, member: null, prompts: [], admin: null, category: 'all', favorites: new Set(JSON.parse(localStorage.getItem('d9-favorites') || '[]')), history: [], importPayload: null };

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
    const data = await api('prompts-list'); state.member = data.member; state.prompts = data.prompts || [];
    $('#authView').classList.add('hidden'); $('#appView').classList.remove('hidden'); renderMember(); renderLibrary(); go('library');
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
  const cat = categoryOf(prompt), saved = state.favorites.has(prompt.id);
  return `<article class="prompt-card"><div class="prompt-top"><span class="category-tag">${escapeHtml(cat.name)}</span><button class="favorite" data-favorite="${prompt.id}" aria-label="${saved ? 'Remove from saved prompts' : 'Save prompt'}">${saved ? '★' : '☆'}</button></div><h4>${escapeHtml(prompt.title)}</h4><p>${escapeHtml(prompt.description)}</p><div class="prompt-foot"><span>${prompt.estimated_minutes || 10} min · ${tierNames[prompt.minimum_tier_rank]}+</span><button class="button subtle" data-open-prompt="${prompt.id}">Open workflow</button></div></article>`;
}
function renderLibrary() {
  const categories = [...new Map(state.prompts.map((prompt) => [categoryOf(prompt).slug, categoryOf(prompt)])).values()];
  $('#categoryFilter').innerHTML = '<option value="all">All categories</option>' + categories.map((cat) => `<option value="${escapeHtml(cat.slug)}">${escapeHtml(cat.name)}</option>`).join('');
  $('#categoryFilter').value = state.category;
  $('#categoryCards').innerHTML = `<button class="category-chip ${state.category === 'all' ? 'active' : ''}" data-category="all">All workflows</button>` + categories.map((cat) => `<button class="category-chip ${state.category === cat.slug ? 'active' : ''}" data-category="${escapeHtml(cat.slug)}">${escapeHtml(cat.name)}</button>`).join('');
  renderPromptResults(); renderSaved(); renderHistory();
}
function renderPromptResults() { const list = filteredPrompts(); $('#resultCount').textContent = `${list.length} result${list.length === 1 ? '' : 's'}`; $('#promptGrid').innerHTML = list.length ? list.map(promptCard).join('') : '<div class="empty">No prompts match those filters.</div>'; }
function renderSaved() { const list = state.prompts.filter((prompt) => state.favorites.has(prompt.id)); $('#savedGrid').innerHTML = list.length ? list.map(promptCard).join('') : '<div class="empty">Save a prompt from the library to find it here.</div>'; }
function renderHistory() { $('#historyList').innerHTML = state.history.length ? state.history.map((item) => `<div class="history-row"><div><b>${escapeHtml(item.title)}</b><span>${escapeHtml(item.category)}</span></div><time>${escapeHtml(item.time)}</time></div>`).join('') : '<div class="empty">No prompts generated in this session.</div>'; }

function openPrompt(id) {
  const prompt = state.prompts.find((item) => item.id === id); if (!prompt) return;
  const schema = Array.isArray(prompt.form_schema) ? prompt.form_schema : [];
  $('#workspace').innerHTML = `<div class="workspace"><form id="builderForm" class="panel"><p class="eyebrow">${escapeHtml(categoryOf(prompt).name)}</p><h3>${escapeHtml(prompt.title)}</h3><p class="muted">${escapeHtml(prompt.description)}</p>${schema.map((field, index) => `<div class="question"><label for="answer-${index}">${escapeHtml(field.label || `Question ${index + 1}`)}</label>${field.type === 'text' ? `<input id="answer-${index}" name="${escapeHtml(field.key)}" required>` : `<textarea id="answer-${index}" name="${escapeHtml(field.key)}" required></textarea>`}</div>`).join('')}<button class="button primary" type="submit">Build my prompt</button></form><div class="panel"><p class="eyebrow">Your engineered prompt</p><h3>Ready to use</h3><p class="muted">Complete the guided questions, then copy the result into your preferred AI assistant.</p><div id="promptOutput" class="output">Your finished prompt will appear here.</div><div class="workspace-actions"><button id="copyPrompt" class="button subtle" type="button">Copy prompt</button></div></div></div>`;
  $('#builderForm').addEventListener('submit', (event) => {
    event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); let output = prompt.user_prompt_template;
    Object.entries(values).forEach(([key, value]) => output = output.replaceAll(`{{${key}}}`, String(value).trim())); $('#promptOutput').textContent = output;
    state.history.unshift({ title: prompt.title, category: categoryOf(prompt).name, time: new Date().toLocaleString() }); renderHistory();
  });
  go('workspace');
}

function go(name) { $$('.page').forEach((page) => page.classList.toggle('active', page.id === `page-${name}`)); $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.page === name)); const titles = { library: 'Prompt library', saved: 'Saved prompts', history: 'Recent activity', workspace: 'Guided workflow', admin: 'Admin console', import: 'Member synchronization' }; $('#pageTitle').textContent = titles[name] || 'AI Growth Kit'; $('.sidebar').classList.remove('open'); window.scrollTo(0, 0); }

function renderAdmin() {
  if (!state.admin) return; const stats = state.admin.stats || {};
  $('#adminStats').innerHTML = [['Active members', stats.members], ['Catalog prompts', stats.prompts], ['Published', stats.published], ['Administrators', stats.administrators]].map(([label, value]) => `<div class="stat"><span>${label}</span><b>${value || 0}</b></div>`).join('');
  renderAdminPrompts();
  $('#roleList').innerHTML = (state.admin.roles || []).map((role) => `<div class="role-row"><div><b>${escapeHtml(role.email)}</b><span>${escapeHtml(role.role.replaceAll('_', ' '))}</span></div><button class="text-button" data-remove-role="${role.id}" data-email="${escapeHtml(role.email)}" data-role="${role.role}">Remove</button></div>`).join('') || '<p class="muted">No roles assigned.</p>';
  $('#categoryList').innerHTML = (state.admin.categories || []).map((cat) => `<div class="role-row"><div><b>${escapeHtml(cat.name)}</b><span>${escapeHtml(cat.slug)}</span></div><button class="text-button" data-edit-category="${cat.id}">Edit</button></div>`).join('');
  $('#editorForm [name=category_id]').innerHTML = (state.admin.categories || []).map((cat) => `<option value="${cat.id}">${escapeHtml(cat.name)}</option>`).join('');
}
function renderAdminPrompts() {
  const query = ($('#adminSearch').value || '').toLowerCase(); const list = (state.admin?.prompts || []).filter((prompt) => `${prompt.title} ${prompt.description}`.toLowerCase().includes(query));
  $('#promptTable').innerHTML = `<table class="data-table"><thead><tr><th>Prompt</th><th>Tier</th><th>Status</th><th></th></tr></thead><tbody>${list.map((prompt) => `<tr><td><b>${escapeHtml(prompt.title)}</b><br><span class="muted">${escapeHtml(prompt.prompt_categories?.name || 'Uncategorized')}</span></td><td>${tierNames[prompt.minimum_tier_rank]}</td><td><span class="status ${prompt.is_published ? 'published' : 'draft'}">${prompt.is_published ? 'Published' : 'Draft'}</span></td><td><button class="text-button" data-edit-prompt="${prompt.id}">Edit</button></td></tr>`).join('')}</tbody></table>`;
}
async function reloadAdmin() { state.admin = await api('admin-console'); renderAdmin(); }

function openPromptEditor(id) {
  const form = $('#editorForm'); form.reset(); const item = id ? state.admin.prompts.find((prompt) => prompt.id === id) : null;
  $('#editorTitle').textContent = item ? 'Edit prompt' : 'Create prompt'; form.elements.id.value = item?.id || ''; form.elements.title.value = item?.title || ''; form.elements.slug.value = item?.slug || ''; form.elements.category_id.value = item?.category_id || state.admin.categories?.[0]?.id || ''; form.elements.minimum_tier.value = tierNames[item?.minimum_tier_rank] || 'Bronze'; form.elements.description.value = item?.description || ''; form.elements.user_prompt_template.value = item?.user_prompt_template || ''; form.elements.estimated_minutes.value = item?.estimated_minutes || 10; form.elements.is_featured.checked = Boolean(item?.is_featured); form.elements.is_published.checked = Boolean(item?.is_published); form.elements.questions.value = (item?.form_schema || []).map((field) => `${field.key}|${field.label}`).join('\n'); $('#deletePrompt').classList.toggle('hidden', !item); $('#editorDialog').showModal();
}
$('#editorForm').addEventListener('submit', async (event) => {
  event.preventDefault(); const form = event.currentTarget; const raw = Object.fromEntries(new FormData(form));
  const prompt = { ...raw, is_featured: form.elements.is_featured.checked, is_published: form.elements.is_published.checked, form_schema: raw.questions.split('\n').map((line, index) => { const [key, ...label] = line.split('|'); return line.trim() ? { key: (label.length ? key : `answer${index + 1}`).trim(), label: (label.length ? label.join('|') : key).trim(), type: 'textarea' } : null; }).filter(Boolean) }; delete prompt.questions;
  setBusy(form, true); try { await api('admin-console', { method: 'POST', body: JSON.stringify({ action: 'save_prompt', prompt }) }); $('#editorDialog').close(); await reloadAdmin(); toast('Prompt saved.'); } catch (error) { message(form, error.message); } finally { setBusy(form, false); }
});

function openCategoryEditor(id) { const form = $('#categoryForm'); form.reset(); const item = id ? state.admin.categories.find((cat) => cat.id === id) : null; ['id', 'name', 'slug', 'description', 'sort_order'].forEach((key) => form.elements[key].value = item?.[key] ?? (key === 'sort_order' ? 0 : '')); $('#deleteCategory').classList.toggle('hidden', !item); $('#categoryDialog').showModal(); }
$('#categoryForm').addEventListener('submit', async (event) => { event.preventDefault(); const form = event.currentTarget; setBusy(form, true); try { await api('admin-console', { method: 'POST', body: JSON.stringify({ action: 'save_category', category: Object.fromEntries(new FormData(form)) }) }); $('#categoryDialog').close(); await reloadAdmin(); toast('Category saved.'); } catch (error) { message(form, error.message); } finally { setBusy(form, false); } });
$('#roleForm').addEventListener('submit', async (event) => { event.preventDefault(); const form = event.currentTarget; setBusy(form, true); try { await api('admin-console', { method: 'POST', body: JSON.stringify({ action: 'add_role', ...Object.fromEntries(new FormData(form)) }) }); $('#roleDialog').close(); form.reset(); await reloadAdmin(); toast('Administrator role assigned.'); } catch (error) { message(form, error.message); } finally { setBusy(form, false); } });

function fileToBase64(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); }); }
$('#memberFile').addEventListener('change', (event) => $('#fileName').textContent = event.target.files[0]?.name || 'No file selected');
$('#importForm').addEventListener('submit', async (event) => { event.preventDefault(); const form = event.currentTarget, file = $('#memberFile').files[0]; if (!file) return; setBusy(form, true); try { state.importPayload = { filename: file.name, mime_type: file.type, file_base64: await fileToBase64(file) }; const result = await api('admin-member-import', { method: 'POST', body: JSON.stringify({ ...state.importPayload, preview: true }) }); renderImportPreview(result); } catch (error) { toast(error.message, true); } finally { setBusy(form, false); } });
function renderImportPreview(result) { const t = result.totals; $('#importPreview').innerHTML = `<h3>Preview results</h3><div class="summary-grid"><div><b>${t.accepted}</b><span>Accepted</span></div><div><b>${t.ignored}</b><span>Ignored</span></div><div><b>${t.rejected}</b><span>Rejected</span></div><div><b>${t.duplicates}</b><span>Duplicates</span></div></div>${t.ignored ? '<p class="warning">Bronze II (Claim) and Ambassador records were ignored.</p>' : ''}${t.rejected ? '<p class="warning">Rejected rows have missing or unsupported required values.</p>' : ''}${t.duplicates ? '<p class="warning">Duplicate emails were resolved to the highest supported tier and will remain in the audit report.</p>' : ''}<button id="commitImport" class="button primary">Commit ${t.accepted} member records</button>`; }

document.addEventListener('click', async (event) => {
  const target = event.target.closest('button'); if (!target) return;
  if (target.dataset.signout !== undefined) return signOut(); if (target.dataset.page) return go(target.dataset.page);
  if (target.dataset.category) { state.category = target.dataset.category; $('#categoryFilter').value = state.category; renderLibrary(); return; }
  if (target.dataset.favorite) { const id = target.dataset.favorite; state.favorites.has(id) ? state.favorites.delete(id) : state.favorites.add(id); localStorage.setItem('d9-favorites', JSON.stringify([...state.favorites])); renderPromptResults(); renderSaved(); return; }
  if (target.dataset.openPrompt) return openPrompt(target.dataset.openPrompt);
  if (target.id === 'copyPrompt') { await navigator.clipboard.writeText($('#promptOutput').textContent); return toast('Prompt copied.'); }
  if (target.id === 'menuButton') return $('.sidebar').classList.toggle('open');
  if (target.id === 'newPrompt') return openPromptEditor(); if (target.dataset.editPrompt) return openPromptEditor(target.dataset.editPrompt);
  if (target.id === 'newRole') return $('#roleDialog').showModal(); if (target.id === 'newCategory') return openCategoryEditor(); if (target.dataset.editCategory) return openCategoryEditor(target.dataset.editCategory);
  if (target.value === 'cancel' && target.closest('dialog')) { event.preventDefault(); return target.closest('dialog').close(); }
  if (target.dataset.removeRole) { if (!confirm(`Remove ${target.dataset.role.replaceAll('_', ' ')} from ${target.dataset.email}?`)) return; try { await api('admin-console', { method: 'POST', body: JSON.stringify({ action: 'remove_role', email: target.dataset.email, role: target.dataset.role }) }); await reloadAdmin(); toast('Administrator role removed.'); } catch (error) { toast(error.message, true); } return; }
  if (target.id === 'deletePrompt' || target.id === 'deleteCategory') { const form = target.closest('form'), kind = target.id === 'deletePrompt' ? 'prompt' : 'category'; if (!confirm(`Delete this ${kind}? This cannot be undone.`)) return; try { await api('admin-console', { method: 'POST', body: JSON.stringify({ action: `delete_${kind}`, id: form.elements.id.value }) }); target.closest('dialog').close(); await reloadAdmin(); toast(`${kind[0].toUpperCase() + kind.slice(1)} deleted.`); } catch (error) { toast(error.message, true); } return; }
  if (target.id === 'commitImport') { target.disabled = true; try { const result = await api('admin-member-import', { method: 'POST', body: JSON.stringify({ ...state.importPayload, preview: false }) }); toast(`${result.totals.accepted} member records synchronized.`); state.importPayload = null; $('#importForm').reset(); $('#fileName').textContent = 'No file selected'; $('#importPreview').innerHTML = '<h3>Synchronization complete</h3><p class="muted">The import and its exceptions were recorded in the audit trail.</p>'; await reloadAdmin(); } catch (error) { toast(error.message, true); target.disabled = false; } }
});

$('#searchInput').addEventListener('input', renderPromptResults); $('#categoryFilter').addEventListener('change', (event) => { state.category = event.target.value; renderLibrary(); }); $('#adminSearch').addEventListener('input', renderAdminPrompts);

(async function boot() { try { const stored = JSON.parse(sessionStorage.getItem('d9-session')); if (stored?.access_token) { state.session = stored; await enterApp(); } } catch { signOut(); } })();
