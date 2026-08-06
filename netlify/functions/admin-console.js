const { ADMIN_ROLES, normalizeEmail, parseJson, preflight, requireRoles, response, sb } = require('./_shared');

const EDITOR_ROLES = ['organization_leader', 'content_admin', 'platform_admin'];
const TIER_RANKS = { Bronze: 1, Silver: 2, Gold: 3, Platinum: 4 };
const ROLE_VALUES = ['member', ...ADMIN_ROLES];

async function audit(admin, action, entityType, entityId, details = {}) {
  await sb('audit_events', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({
    actor_auth_user_id: admin.user.id, actor_email: admin.email, action,
    entity_type: entityType, entity_id: entityId || null, details
  }) });
}

exports.handler = async (event) => {
  const pf = preflight(event, ['GET', 'POST', 'PATCH', 'DELETE']);
  if (pf) return pf;
  const admin = await requireRoles(event);
  if (!admin) return response(403, { error: 'Administrator access required' });
  try {
    if (event.httpMethod === 'GET') {
      const [prompts, categories, roles, imports, members] = await Promise.all([
        sb('prompts?select=*,prompt_categories(id,name,slug)&order=updated_at.desc'),
        sb('prompt_categories?select=*&order=sort_order.asc,name.asc'),
        sb(`user_roles?role=in.(${ADMIN_ROLES.join(',')})&select=id,email,normalized_email,role,organization_id,created_at&order=created_at.desc`),
        sb('import_batches?select=id,filename,uploaded_by,total_rows,accepted_rows,ignored_rows,rejected_rows,created_at&order=created_at.desc&limit=10'),
        sb('member_app_access?access_enabled=eq.true&select=growth_kit_tier_rank')
      ]);
      return response(200, { admin: { email: admin.email, roles: admin.roles }, prompts, categories, roles, imports,
        stats: { members: members?.length || 0, prompts: prompts?.length || 0, published: prompts?.filter((p) => p.is_published).length || 0, administrators: roles?.length || 0 }
      });
    }

    const body = parseJson(event);
    if (!body?.action) return response(400, { error: 'Action is required' });
    if (body.action === 'save_prompt') {
      if (!admin.roles.some((role) => EDITOR_ROLES.includes(role))) return response(403, { error: 'Content administrator access required' });
      const item = body.prompt || {};
      if (!item.title || !item.slug || !item.description || !item.user_prompt_template || !TIER_RANKS[item.minimum_tier]) return response(400, { error: 'Prompt fields are incomplete' });
      const payload = { category_id: item.category_id || null, title: String(item.title).trim(), slug: String(item.slug).trim().toLowerCase(),
        description: String(item.description).trim(), system_prompt: String(item.system_prompt || '').trim() || null,
        user_prompt_template: String(item.user_prompt_template).trim(), form_schema: Array.isArray(item.form_schema) ? item.form_schema : [],
        minimum_tier_rank: TIER_RANKS[item.minimum_tier], estimated_minutes: Math.max(1, Number(item.estimated_minutes) || 10),
        tags: Array.isArray(item.tags) ? item.tags : [], is_featured: Boolean(item.is_featured), is_published: Boolean(item.is_published), updated_at: new Date().toISOString() };
      const path = item.id ? `prompts?id=eq.${encodeURIComponent(item.id)}` : 'prompts';
      const saved = await sb(path, { method: item.id ? 'PATCH' : 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) });
      await audit(admin, item.id ? 'prompt.updated' : 'prompt.created', 'prompt', saved?.[0]?.id || item.id, { title: payload.title });
      return response(200, { prompt: saved?.[0] });
    }
    if (body.action === 'save_category') {
      if (!admin.roles.some((role) => EDITOR_ROLES.includes(role))) return response(403, { error: 'Content administrator access required' });
      const item = body.category || {};
      if (!item.name || !item.slug) return response(400, { error: 'Category name and slug are required' });
      const payload = { name: String(item.name).trim(), slug: String(item.slug).trim().toLowerCase(), description: String(item.description || '').trim() || null,
        sort_order: Number(item.sort_order) || 0, is_active: item.is_active !== false };
      const saved = await sb(item.id ? `prompt_categories?id=eq.${encodeURIComponent(item.id)}` : 'prompt_categories', {
        method: item.id ? 'PATCH' : 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload)
      });
      await audit(admin, item.id ? 'category.updated' : 'category.created', 'prompt_category', saved?.[0]?.id || item.id, { name: payload.name });
      return response(200, { category: saved?.[0] });
    }
    if (body.action === 'delete_prompt' || body.action === 'delete_category') {
      if (!admin.roles.some((role) => EDITOR_ROLES.includes(role))) return response(403, { error: 'Content administrator access required' });
      if (!body.id) return response(400, { error: 'Record id is required' });
      const isPrompt = body.action === 'delete_prompt';
      await sb(`${isPrompt ? 'prompts' : 'prompt_categories'}?id=eq.${encodeURIComponent(body.id)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
      await audit(admin, isPrompt ? 'prompt.deleted' : 'category.deleted', isPrompt ? 'prompt' : 'prompt_category', body.id);
      return response(200, { success: true });
    }
    if (body.action === 'add_role' || body.action === 'remove_role') {
      if (!admin.roles.includes('platform_admin')) return response(403, { error: 'Platform administrator access required' });
      const email = normalizeEmail(body.email);
      if (!email || !ROLE_VALUES.includes(body.role) || body.role === 'member') return response(400, { error: 'Valid administrator email and role are required' });
      if (body.action === 'add_role') await sb('user_roles?on_conflict=normalized_email,role,organization_id', {
        method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ email, normalized_email: email, role: body.role, organization_id: body.organization_id || 'd9network' })
      });
      else await sb(`user_roles?normalized_email=eq.${encodeURIComponent(email)}&role=eq.${body.role}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
      await audit(admin, `role.${body.action === 'add_role' ? 'assigned' : 'removed'}`, 'user_role', null, { email, role: body.role });
      return response(200, { success: true });
    }
    return response(400, { error: 'Unsupported action' });
  } catch (error) {
    console.error('admin-console', error);
    return response(500, { error: 'Unable to complete the administrative request' });
  }
};
