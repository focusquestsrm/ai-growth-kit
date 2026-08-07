const { PLATFORM_ROLES, audit, hasPermission, inviteAuthUser, normalizeEmail, parseJson, preflight, requireAdmin, response, sb } = require('./_shared');

const TIER_RANKS = { Bronze: 1, Silver: 2, Gold: 3, Platinum: 4 };
const ACCOUNT_TYPES = ['internal', 'member', 'partner', 'external_tester'];
const ACCOUNT_STATUSES = ['invited', 'pending_activation', 'active', 'suspended', 'archived'];
const MEMBERSHIP_STATUSES = ['member', 'non_member', 'pending', 'inactive'];
const INVITABLE_ROLES = PLATFORM_ROLES.filter((role) => role !== 'platform_admin');
const allowed = (admin, permission) => hasPermission(admin.permissions, permission);
function invitationDeliveryResponse(error) {
  const detail = `${error.code || ''} ${error.message || ''}`.toLowerCase();
  if (error.status === 429) return response(429, { error:'Invitation email limit reached. Please wait and try again.' });
  if (/already|registered|exists|duplicate/.test(detail)) return response(409, { error:'An authentication account already exists for this email. Ask the user to sign in or reset their password.' });
  console.error('invitation delivery failed', { status:error.status, code:error.code, message:error.message });
  return response(502, { error:'The invitation could not be delivered. Check the Supabase email settings and try again.' });
}

exports.handler = async (event) => {
  const pf = preflight(event, ['GET', 'POST', 'PATCH', 'DELETE']);
  if (pf) return pf;
  const admin = await requireAdmin(event);
  if (!admin) return response(403, { error: 'Administrator access required' });
  try {
    if (event.httpMethod === 'GET') {
      const isPlatform = admin.roles.includes('platform_admin') || admin.roles.includes('super_admin');
      const canContent = allowed(admin, 'admin.content.manage');
      const canData = allowed(admin, 'admin.members.read');
      const canDashboard = allowed(admin, 'admin.dashboard.read');
      const canRoles = allowed(admin, 'admin.roles.manage');
      const canInvite = allowed(admin, 'admin.invitations.manage');
      const canAudit = allowed(admin, 'admin.audit.read');
      const canReport = allowed(admin, 'admin.reporting.read');
      const optional = async (request, fallback) => { try { return await request; } catch { return fallback; } };
      const [prompts, categories, accounts, assignments, invitations, imports, members, generations, feedback, assessmentVersions, assessmentSections, assessmentQuestions, assessmentMappings, assessmentResults, marketplaceCategories, marketplaceItems, auditLogs] = await Promise.all([
        canContent || isPlatform ? sb('prompts?select=*,prompt_categories(id,name,slug)&order=updated_at.desc') : Promise.resolve([]),
        canContent || isPlatform ? sb('prompt_categories?select=*&order=sort_order.asc,name.asc') : Promise.resolve([]),
        canRoles || canInvite ? optional(sb('platform_accounts?select=id,email,first_name,last_name,organization,account_type,account_status,membership_status,simulated_tier,account_designation,created_at,updated_at&order=created_at.desc'), []) : Promise.resolve([]),
        canRoles ? optional(sb('platform_role_assignments?select=id,account_id,role,permissions,scope,is_active,assigned_at&order=assigned_at.desc'), []) : Promise.resolve([]),
        canInvite ? optional(sb('platform_invitations?select=id,email,first_name,last_name,role,permissions,account_type,account_status,membership_status,simulated_tier,auth_invited_at,accepted_at,created_at&order=created_at.desc&limit=100'), []) : Promise.resolve([]),
        canData ? sb('import_batches?select=id,filename,uploaded_by,total_rows,accepted_rows,ignored_rows,rejected_rows,created_at&order=created_at.desc&limit=10') : Promise.resolve([]),
        canData ? sb('member_app_access?select=id,bd_user_id,email,first_name,last_name,company,growth_kit_tier,growth_kit_tier_rank,access_enabled,source_active,updated_at&order=updated_at.desc&limit=500') : Promise.resolve([]),
        canReport ? sb('prompt_generations?select=id,created_at,prompts(title)&order=created_at.desc&limit=1000') : Promise.resolve([]),
        canContent ? optional(sb('platform_feedback?select=id,page,rating,feedback_type,comments,status,created_at,member_app_access(email)&order=created_at.desc&limit=100'), []) : Promise.resolve([]),
        canContent ? optional(sb('assessment_versions?select=*&order=created_at.desc'), []) : Promise.resolve([]),
        canContent ? optional(sb('assessment_sections?select=*&order=display_order.asc'), []) : Promise.resolve([]),
        canContent ? optional(sb('assessment_questions?select=*&order=display_order.asc'), []) : Promise.resolve([]),
        canContent ? optional(sb('assessment_tool_mappings?select=*,prompts(id,title,minimum_tier_rank)&order=priority.asc'), []) : Promise.resolve([]),
        canContent ? optional(sb('assessment_results?select=improvement_areas,priority_ranking,created_at&order=created_at.desc&limit=1000'), []) : Promise.resolve([]),
        canContent ? optional(sb('marketplace_categories?select=*&order=display_order.asc,name.asc'), []) : Promise.resolve([]),
        canContent ? optional(sb('marketplace_items?select=id,name,slug,description,is_premium,active,thumbnail_url,cta_label,pricing_status,pricing_model,price,currency,billing_interval,credit_cost,included_runs,trial_available,purchase_url,display_order,marketplace_categories(name,slug)&order=display_order.asc,name.asc'), []) : Promise.resolve([]),
        canAudit ? optional(sb('audit_logs?select=*&order=created_at.desc&limit=100'), []) : Promise.resolve([])
      ]);
      const activeMembers = members?.filter((member) => member.access_enabled && member.source_active).length || 0;
      if (!admin.reviewMode) await audit(admin, 'admin.accessed', 'admin_workspace', null, { path: event.path || '/admin/dashboard' });
      return response(200, { admin: { account: admin.account, roles: admin.roles, permission_values: [...admin.permissions], permissions: { platform:isPlatform, dashboard:canDashboard, content:canContent, data:canData, roles:canRoles, invitations:canInvite, audit:canAudit, reporting:canReport } }, prompts, categories, accounts, assignments, invitations, imports, members, generations, feedback, assessment: { versions:assessmentVersions, sections:assessmentSections, questions:assessmentQuestions, mappings:assessmentMappings, results:assessmentResults }, marketplace:{categories:marketplaceCategories,items:marketplaceItems}, audit_logs:auditLogs,
        stats: { members: activeMembers, prompts: prompts?.length || 0, published: prompts?.filter((p) => p.status === 'published').length || 0, administrators: assignments?.filter((item) => item.is_active && ['platform_admin','content_admin','data_admin','super_admin','admin','staff'].includes(item.role)).length || 0, generations: generations?.length || 0 }
      });
    }

    const body = parseJson(event);
    if (!body?.action) return response(400, { error: 'Action is required' });
    if (admin.reviewMode) return response(403, { error:'Administrative changes are disabled in Review Mode.' });
    const impersonationId = event.headers?.['x-impersonation-session'] || event.headers?.['X-Impersonation-Session'];
    if (impersonationId && !['end_impersonation'].includes(body.action)) {
      const sessions = await sb(`impersonation_sessions?id=eq.${encodeURIComponent(impersonationId)}&actor_account_id=eq.${admin.account.id}&ended_at=is.null&select=id,is_read_only`);
      if (!sessions?.[0]) return response(403, { error: 'The view-as-user session is invalid or expired' });
      if (sessions[0].is_read_only) return response(403, { error: 'Changes are disabled while viewing as another user' });
    }
    if (body.action === 'save_prompt') {
      if (!allowed(admin, 'admin.content.manage')) return response(403, { error: 'Content administrator access required' });
      const item = body.prompt || {};
      if (!item.title || !item.slug || !item.description || !item.task_template || !item.required_output || !item.guardrails || !TIER_RANKS[item.minimum_tier]) return response(400, { error: 'Prompt fields are incomplete' });
      const thumbnailUrl=String(item.thumbnail_url||'').trim();
      if(thumbnailUrl){try{if(!['http:','https:'].includes(new URL(thumbnailUrl).protocol))throw new Error();}catch{return response(400,{error:'Thumbnail URL must use http or https'});}}
      const contextFields = (Array.isArray(item.context_fields) ? item.context_fields : String(item.context_fields || '').split(/[\n,]/)).map((field) => String(field).trim()).filter((field) => /^[a-z][a-z0-9_]*$/.test(field));
      const promptVersion = String(item.prompt_version || '1.0').trim();
      if (!/^\d+\.\d+$/.test(promptVersion)) return response(400, { error: 'Version must use a number such as 1.1' });
      const payload = { category_id: item.category_id || null, title: String(item.title).trim(), slug: String(item.slug).trim().toLowerCase(),
        description: String(item.description).trim(), system_prompt: String(item.system_prompt || '').trim() || null,
        user_prompt_template: String(item.user_prompt_template || item.task_template).trim(), form_schema: Array.isArray(item.form_schema) ? item.form_schema : [],
        minimum_tier_rank: TIER_RANKS[item.minimum_tier], estimated_minutes: Math.max(1, Number(item.estimated_minutes) || 10),
        tags: Array.isArray(item.tags) ? item.tags : [], is_featured: Boolean(item.is_featured), status: ['draft','published','archived'].includes(item.status) ? item.status : 'draft',
        is_published: item.status === 'published', marketplace_upgrade_message: String(item.marketplace_upgrade_message || '').trim() || null,
        output_format: String(item.output_format || '').trim() || null, context_fields: contextFields, task_template: String(item.task_template || item.user_prompt_template).trim(),
        required_output: String(item.required_output || item.output_format || '').trim(), guardrails: String(item.guardrails || '').trim(), prompt_version: promptVersion,
        thumbnail_url:thumbnailUrl||null, thumbnail_type:['custom','category'].includes(item.thumbnail_type)?item.thumbnail_type:null, updated_at: new Date().toISOString() };
      const path = item.id ? `prompts?id=eq.${encodeURIComponent(item.id)}` : 'prompts';
      const saved = await sb(path, { method: item.id ? 'PATCH' : 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) });
      const promptId = saved?.[0]?.id || item.id;
      if (promptId) {
        await sb(`prompt_questions?prompt_id=eq.${encodeURIComponent(promptId)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
        if (payload.form_schema.length) await sb('prompt_questions', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(payload.form_schema.map((question, index) => ({ prompt_id: promptId, field_key: String(question.key || `answer${index + 1}`), label: String(question.label || `Question ${index + 1}`), field_type: question.type === 'text' ? 'text' : 'textarea', sort_order: index + 1, is_required: true }))) });
      }
      await audit(admin, item.id ? 'prompt.updated' : 'prompt.created', 'prompt', promptId, { title: payload.title });
      return response(200, { prompt: saved?.[0] });
    }
    if (body.action === 'save_category') {
      if (!allowed(admin, 'admin.content.manage')) return response(403, { error: 'Content administrator access required' });
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
      if (!allowed(admin, 'admin.content.manage')) return response(403, { error: 'Content administrator access required' });
      if (!body.id) return response(400, { error: 'Record id is required' });
      const isPrompt = body.action === 'delete_prompt';
      await sb(`${isPrompt ? 'prompts' : 'prompt_categories'}?id=eq.${encodeURIComponent(body.id)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
      await audit(admin, isPrompt ? 'prompt.deleted' : 'category.deleted', isPrompt ? 'prompt' : 'prompt_category', body.id);
      return response(200, { success: true });
    }
    if (body.action === 'invite_account') {
      if (!allowed(admin, 'admin.invitations.manage')) return response(403, { error: 'Invitation permission required' });
      const email = normalizeEmail(body.email), role = String(body.role || ''), accountType = String(body.account_type || ''), accountStatus = String(body.account_status || ''), membershipStatus = String(body.membership_status || '');
      const simulatedTier = body.simulated_tier && body.simulated_tier !== 'none' ? body.simulated_tier : null;
      const permissions = Array.isArray(body.permissions) ? body.permissions.filter((item) => /^admin\.[a-z_.]+$/.test(item)) : [];
      if (!email || !INVITABLE_ROLES.includes(role) || !ACCOUNT_TYPES.includes(accountType) || !ACCOUNT_STATUSES.includes(accountStatus) || !MEMBERSHIP_STATUSES.includes(membershipStatus) || (simulatedTier && !TIER_RANKS[simulatedTier])) return response(400, { error: 'Complete every account and access selection' });
      const existing = await sb(`platform_invitations?normalized_email=eq.${encodeURIComponent(email)}&order=created_at.desc&limit=1&select=id,accepted_at,auth_invited_at`);
      if (existing?.[0]?.accepted_at) return response(409, { error: 'This user has already accepted an invitation.' });
      if (existing?.[0]?.auth_invited_at) return response(409, { error: 'A secure invitation has already been sent to this email.' });
      const invitationPayload = { email, normalized_email: email, first_name: String(body.first_name || '').trim() || null, last_name: String(body.last_name || '').trim() || null, role, permissions, account_type: accountType, account_status: accountStatus, membership_status: membershipStatus, simulated_tier: simulatedTier, invited_by: admin.account.id };
      let created;
      try {
        created = existing?.[0]
          ? await sb(`platform_invitations?id=eq.${existing[0].id}`, { method:'PATCH', headers:{ Prefer:'return=representation' }, body:JSON.stringify(invitationPayload) })
          : await sb('platform_invitations', { method:'POST', headers:{ Prefer:'return=representation' }, body:JSON.stringify(invitationPayload) });
      } catch (error) {
        if (error.status === 409) return response(409, { error:'An invitation for this email is already being processed.' });
        throw error;
      }
      try {
        await inviteAuthUser(email, role === 'member' ? '/login' : '/admin/login');
        await sb(`platform_invitations?id=eq.${created?.[0]?.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ auth_invited_at: new Date().toISOString() }) });
      } catch (error) {
        await audit(admin, 'invitation.delivery_failed', 'platform_invitation', created?.[0]?.id, { role, account_type: accountType });
        return invitationDeliveryResponse(error);
      }
      await audit(admin, 'invitation.sent', 'platform_invitation', created?.[0]?.id, { role, account_type: accountType, membership_status: membershipStatus, simulated_tier: simulatedTier });
      return response(200, { success: true, invitation_id: created?.[0]?.id });
    }
    if (body.action === 'resend_invitation') {
      if (!allowed(admin, 'admin.invitations.manage')) return response(403, { error:'Invitation permission required' });
      if (!body.id) return response(400, { error:'Invitation id is required' });
      const invitations = await sb(`platform_invitations?id=eq.${encodeURIComponent(body.id)}&select=id,email,role,accepted_at`);
      const invitation = invitations?.[0];
      if (!invitation) return response(404, { error:'Invitation not found' });
      if (invitation.accepted_at) return response(409, { error:'Accepted invitations cannot be resent.' });
      try {
        await inviteAuthUser(invitation.email, invitation.role === 'member' ? '/login' : '/admin/login');
      } catch (error) {
        await audit(admin, 'invitation.resend_failed', 'platform_invitation', invitation.id, { role:invitation.role });
        return invitationDeliveryResponse(error);
      }
      await sb(`platform_invitations?id=eq.${invitation.id}`, { method:'PATCH', headers:{ Prefer:'return=minimal' }, body:JSON.stringify({ auth_invited_at:new Date().toISOString() }) });
      await audit(admin, 'invitation.resent', 'platform_invitation', invitation.id, { role:invitation.role });
      return response(200, { success:true });
    }
    if (body.action === 'delete_invitation') {
      if (!allowed(admin, 'admin.invitations.manage')) return response(403, { error:'Invitation permission required' });
      if (!body.id) return response(400, { error:'Invitation id is required' });
      const invitations = await sb(`platform_invitations?id=eq.${encodeURIComponent(body.id)}&select=id,email,role,auth_invited_at,accepted_at`);
      const invitation = invitations?.[0];
      if (!invitation) return response(404, { error:'Invitation not found' });
      if (invitation.accepted_at || invitation.auth_invited_at) return response(409, { error:'Only invitations that failed before delivery can be removed.' });
      await sb(`platform_invitations?id=eq.${invitation.id}`, { method:'DELETE', headers:{ Prefer:'return=minimal' } });
      await audit(admin, 'invitation.deleted', 'platform_invitation', invitation.id, { email:invitation.email, role:invitation.role });
      return response(200, { success:true });
    }
    if (body.action === 'set_role_active') {
      if (!allowed(admin, 'admin.roles.manage')) return response(403, { error: 'Role-management permission required' });
      if (!body.id || typeof body.active !== 'boolean') return response(400, { error: 'Role id and state are required' });
      const targetRoles = await sb(`platform_role_assignments?id=eq.${encodeURIComponent(body.id)}&select=id,account_id,role`);
      if (!targetRoles?.[0]) return response(404, { error: 'Role assignment not found' });
      if (targetRoles[0].role === 'platform_admin' && (!admin.roles.includes('platform_admin') || (targetRoles[0].account_id === admin.account.id && body.active === false))) return response(403, { error: 'The platform owner role cannot be changed by this account' });
      await sb(`platform_role_assignments?id=eq.${encodeURIComponent(body.id)}`, { method:'PATCH', headers:{ Prefer:'return=minimal' }, body:JSON.stringify({ is_active:body.active }) });
      await audit(admin, body.active ? 'role.activated' : 'role.deactivated', 'platform_role_assignment', body.id);
      return response(200, { success:true });
    }
    if (body.action === 'set_account') {
      if (!allowed(admin, 'admin.members.manage')) return response(403, { error: 'Account-management permission required' });
      if (!body.id) return response(400, { error: 'Account id is required' });
      const protectedRoles = await sb(`platform_role_assignments?account_id=eq.${encodeURIComponent(body.id)}&role=eq.platform_admin&is_active=eq.true&select=id`);
      if (protectedRoles?.length && !admin.roles.includes('platform_admin')) return response(403, { error: 'Only a platform administrator can change this account' });
      const changes = {};
      if (ACCOUNT_STATUSES.includes(body.account_status)) changes.account_status = body.account_status;
      if (MEMBERSHIP_STATUSES.includes(body.membership_status)) changes.membership_status = body.membership_status;
      if (body.simulated_tier === 'none' || body.simulated_tier === null) changes.simulated_tier = null;
      else if (TIER_RANKS[body.simulated_tier]) changes.simulated_tier = body.simulated_tier;
      if (!Object.keys(changes).length) return response(400, { error: 'No valid account changes were provided' });
      await sb(`platform_accounts?id=eq.${encodeURIComponent(body.id)}`, { method:'PATCH', headers:{ Prefer:'return=minimal' }, body:JSON.stringify({ ...changes, updated_at:new Date().toISOString() }) });
      await audit(admin, 'account.updated', 'platform_account', body.id, changes);
      return response(200, { success:true });
    }
    if (body.action === 'start_impersonation') {
      if (!admin.roles.includes('platform_admin')) return response(403, { error: 'Platform administrator access required' });
      if (body.target_account_id === admin.account.id || !PLATFORM_ROLES.includes(body.viewed_role) || (body.simulated_tier && !TIER_RANKS[body.simulated_tier])) return response(400, { error: 'Select a valid user, role, and tier' });
      const target = await sb(`platform_accounts?id=eq.${encodeURIComponent(body.target_account_id)}&select=id,first_name,last_name`);
      if (!target?.[0]) return response(404, { error: 'The selected account was not found' });
      const session = await sb('impersonation_sessions', { method:'POST', headers:{ Prefer:'return=representation' }, body:JSON.stringify({ actor_account_id:admin.account.id, target_account_id:target[0].id, viewed_role:body.viewed_role, simulated_tier:body.simulated_tier || null, is_read_only:true }) });
      await audit(admin, 'impersonation.started', 'impersonation_session', session?.[0]?.id, { target_account_id:target[0].id, viewed_role:body.viewed_role, simulated_tier:body.simulated_tier || null });
      return response(200, { session: { id:session?.[0]?.id, target_name:[target[0].first_name,target[0].last_name].filter(Boolean).join(' '), viewed_role:body.viewed_role, simulated_tier:body.simulated_tier || null, read_only:true } });
    }
    if (body.action === 'end_impersonation') {
      if (!admin.roles.includes('platform_admin') || !body.id) return response(403, { error: 'Platform administrator access required' });
      await sb(`impersonation_sessions?id=eq.${encodeURIComponent(body.id)}&actor_account_id=eq.${admin.account.id}&ended_at=is.null`, { method:'PATCH', headers:{ Prefer:'return=minimal' }, body:JSON.stringify({ ended_at:new Date().toISOString(), ended_by:admin.account.id }) });
      await audit(admin, 'impersonation.ended', 'impersonation_session', body.id);
      return response(200, { success:true });
    }
    if (body.action === 'set_member_access') {
      if (!allowed(admin, 'admin.members.manage')) return response(403, { error: 'Member-management permission required' });
      if (!body.id || typeof body.enabled !== 'boolean') return response(400, { error: 'Member id and enabled state are required' });
      await sb(`member_app_access?id=eq.${encodeURIComponent(body.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ access_enabled: body.enabled, updated_at: new Date().toISOString() }) });
      await audit(admin, body.enabled ? 'member.enabled' : 'member.disabled', 'member_app_access', body.id);
      return response(200, { success: true });
    }
    if (body.action === 'set_feedback_status') {
      if (!allowed(admin, 'admin.feedback.manage')) return response(403, { error: 'Feedback-management permission required' });
      if (!body.id || !['new','reviewed','resolved'].includes(body.status)) return response(400, { error: 'Feedback id and status are required' });
      await sb(`platform_feedback?id=eq.${encodeURIComponent(body.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: body.status }) });
      await audit(admin, 'feedback.status_updated', 'platform_feedback', body.id, { status: body.status });
      return response(200, { success: true });
    }
    if (['save_assessment_section','save_assessment_question','save_assessment_mapping'].includes(body.action)) {
      if (!allowed(admin, 'admin.content.manage')) return response(403, { error: 'Content administrator access required' });
      const configs = {
        save_assessment_section: { table:'assessment_sections', item:body.section, allowed:['version_id','slug','title','description','display_order','is_active'] },
        save_assessment_question: { table:'assessment_questions', item:body.question, allowed:['section_id','question_text','answer_type','display_order','is_active'] },
        save_assessment_mapping: { table:'assessment_tool_mappings', item:body.mapping, allowed:['section_id','prompt_id','priority','is_active'] }
      };
      const config = configs[body.action], item = config.item || {};
      const payload = Object.fromEntries(config.allowed.filter((key) => item[key] !== undefined).map((key) => [key,item[key]]));
      const saved = await sb(item.id ? `${config.table}?id=eq.${encodeURIComponent(item.id)}` : config.table, { method:item.id?'PATCH':'POST', headers:{ Prefer:'return=representation' }, body:JSON.stringify(payload) });
      await audit(admin, `${config.table}.${item.id?'updated':'created'}`, config.table, saved?.[0]?.id || item.id);
      return response(200, { item:saved?.[0] });
    }
    return response(400, { error: 'Unsupported action' });
  } catch (error) {
    console.error('admin-console', error);
    return response(500, { error: 'Unable to complete the administrative request' });
  }
};
