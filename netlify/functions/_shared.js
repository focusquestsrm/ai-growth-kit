const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

const APP_ORIGIN = process.env.APP_BASE_URL || '*';
const headers = {
  'Access-Control-Allow-Origin': APP_ORIGIN,
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Impersonation-Session',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin'
};

const PLATFORM_ROLES = ['super_admin', 'admin', 'staff', 'executive_viewer', 'member', 'partner_admin', 'tester', 'read_only'];
const ADMIN_ROLES = ['super_admin', 'admin', 'staff'];
const DEFAULT_ROLE_PERMISSIONS = {
  super_admin: ['admin.*'],
  admin: ['admin.dashboard.read', 'admin.members.read', 'admin.members.manage', 'admin.invitations.manage', 'admin.roles.manage', 'admin.imports.manage', 'admin.content.manage', 'admin.feedback.manage', 'admin.audit.read', 'admin.reporting.read'],
  staff: [], executive_viewer: [], member: [], partner_admin: [], tester: [], read_only: []
};

function response(statusCode, body, extraHeaders = {}) {
  return { statusCode, headers: { ...headers, ...extraHeaders }, body: JSON.stringify(body) };
}

function preflight(event, allowed = ['GET', 'POST', 'PATCH', 'DELETE']) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (!allowed.includes(event.httpMethod)) return response(405, { error: 'Method not allowed' });
  return null;
}

function normalizeEmail(value) { return String(value || '').trim().toLowerCase(); }
function normalizeMembership(value) {
  const tier = String(value || '').trim().toLowerCase();
  const map = { bronze: ['Bronze', 1], silver: ['Silver', 2], gold: ['Gold', 3], platinum: ['Platinum', 4] };
  return map[tier] || null;
}
function ignoredMembership(value) {
  const tier = String(value || '').trim().toLowerCase();
  return tier === 'bronze ii (claim)' || tier === 'ambassador';
}
function canAccessPrompt(memberRank, minimumTierRank) { return Number.isInteger(Number(memberRank)) && Number.isInteger(Number(minimumTierRank)) && Number(memberRank) >= Number(minimumTierRank); }
function filterPromptsByTier(prompts, memberRank) { return (prompts || []).filter((prompt) => prompt.status === 'published' && canAccessPrompt(memberRank, prompt.minimum_tier_rank)); }

async function sb(path, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error('Supabase is not configured');
  const serviceHeaders = { apikey: SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json' };
  if (!String(SUPABASE_SERVICE_KEY).startsWith('sb_secret_')) serviceHeaders.Authorization = `Bearer ${SUPABASE_SERVICE_KEY}`;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...options, headers: { ...serviceHeaders, ...(options.headers || {}) } });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase request failed (${res.status})`);
  return text ? JSON.parse(text) : null;
}

function bearerToken(event) {
  const value = event.headers?.authorization || event.headers?.Authorization || '';
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}
async function authenticatedUser(event) {
  const token = bearerToken(event);
  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const user = await res.json();
  return user?.id && user?.email ? user : null;
}

async function audit(actor, action, entityType, entityId, details = {}) {
  await sb('audit_logs', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({
    actor_auth_user_id: actor.user?.id || null,
    actor_email: actor.email || null,
    action, entity_type: entityType, entity_id: entityId || null, details
  }) });
}

async function ensurePlatformOwner(user) {
  const ownerEmail = normalizeEmail(process.env.PLATFORM_OWNER_EMAIL);
  if (!ownerEmail || normalizeEmail(user.email) !== ownerEmail) return;
  const firstName = String(process.env.PLATFORM_OWNER_FIRST_NAME || user.user_metadata?.first_name || '').trim();
  const lastName = String(process.env.PLATFORM_OWNER_LAST_NAME || user.user_metadata?.last_name || '').trim();
  if (!firstName || !lastName) throw new Error('Platform owner identity is not configured');
  const accounts = await sb(`platform_accounts?normalized_email=eq.${encodeURIComponent(ownerEmail)}&select=id,auth_user_id`);
  let account = accounts?.[0];
  const payload = { auth_user_id: user.id, email: user.email, normalized_email: ownerEmail, first_name: firstName, last_name: lastName, organization: 'D9Network', account_type: 'internal', account_status: 'active', membership_status: 'non_member', member_access_id: null, simulated_tier: null, account_designation: 'Platform Administrator', updated_at: new Date().toISOString() };
  if (account) {
    const updated = await sb(`platform_accounts?id=eq.${account.id}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) });
    account = updated?.[0] || { ...account, ...payload };
  } else {
    const created = await sb('platform_accounts', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) });
    account = created?.[0];
  }
  if (!account?.id) throw new Error('Unable to create the platform owner account');
  await sb('platform_role_assignments?on_conflict=account_id,role,scope', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ account_id: account.id, role: 'super_admin', permissions: ['admin.*'], scope: 'd9network', is_active: true }) });
}

async function activateInvitation(user) {
  const email = normalizeEmail(user.email);
  const invitations = await sb(`platform_invitations?normalized_email=eq.${encodeURIComponent(email)}&accepted_at=is.null&order=created_at.desc&limit=1&select=*`);
  const invitation = invitations?.[0];
  if (!invitation) return;
  const existing = await sb(`platform_accounts?normalized_email=eq.${encodeURIComponent(email)}&select=id`);
  const payload = {
    auth_user_id: user.id, email: user.email, normalized_email: email,
    first_name: invitation.first_name || user.user_metadata?.first_name || null,
    last_name: invitation.last_name || user.user_metadata?.last_name || null,
    organization: 'D9Network', account_type: invitation.account_type,
    account_status: 'active', membership_status: invitation.membership_status,
    simulated_tier: invitation.simulated_tier || null,
    account_designation: invitation.role === 'admin' ? 'Platform Administrator' : invitation.role.replaceAll('_', ' '),
    updated_at: new Date().toISOString()
  };
  const saved = existing?.[0]
    ? await sb(`platform_accounts?id=eq.${existing[0].id}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) })
    : await sb('platform_accounts', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) });
  const account = saved?.[0];
  if (!account?.id) return;
  await sb('platform_role_assignments?on_conflict=account_id,role,scope', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ account_id: account.id, role: invitation.role, permissions: invitation.permissions || [], scope: 'd9network', is_active: true, assigned_by: invitation.invited_by }) });
  await sb(`platform_invitations?id=eq.${invitation.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ account_status: 'active', accepted_at: new Date().toISOString() }) });
}

function permissionSet(assignments) {
  const values = new Set();
  for (const assignment of assignments || []) {
    for (const permission of DEFAULT_ROLE_PERMISSIONS[assignment.role] || []) values.add(permission);
    for (const permission of Array.isArray(assignment.permissions) ? assignment.permissions : []) values.add(permission);
  }
  return values;
}
function hasPermission(permissionValues, required) {
  if (!required) return [...permissionValues].some((value) => value === 'admin.*' || value.startsWith('admin.'));
  return permissionValues.has('admin.*') || permissionValues.has(required) || [...permissionValues].some((value) => value.endsWith('.*') && required.startsWith(value.slice(0, -1)));
}

async function requireAdmin(event, requiredPermission) {
  const user = await authenticatedUser(event);
  if (!user) return null;
  await ensurePlatformOwner(user);
  await activateInvitation(user);
  const email = normalizeEmail(user.email);
  const accounts = await sb(`platform_accounts?or=(auth_user_id.eq.${encodeURIComponent(user.id)},normalized_email.eq.${encodeURIComponent(email)})&account_status=eq.active&select=id,auth_user_id,first_name,last_name,organization,account_type,account_status,membership_status,simulated_tier,account_designation`);
  const account = accounts?.[0];
  if (!account) return null;
  const assignments = await sb(`platform_role_assignments?account_id=eq.${account.id}&is_active=eq.true&select=id,role,permissions,scope`);
  const roles = (assignments || []).map((item) => item.role);
  const permissions = permissionSet(assignments);
  const primaryAllowed = roles.some((role) => ADMIN_ROLES.includes(role));
  const exceptionalAllowed = (roles.includes('executive_viewer') && (requiredPermission === 'admin.reporting.read' || (!requiredPermission && hasPermission(permissions, 'admin.reporting.read')))) || (roles.includes('partner_admin') && (requiredPermission?.startsWith('admin.partner.') || (!requiredPermission && [...permissions].some((value) => value.startsWith('admin.partner.')))));
  if ((!primaryAllowed && !exceptionalAllowed) || !hasPermission(permissions, requiredPermission)) return null;
  return { user, email, account, assignments, roles, permissions };
}

// Compatibility export. New code should request a concrete permission with requireAdmin.
async function requireRoles(event) { return requireAdmin(event); }

async function requireMember(event) {
  const user = await authenticatedUser(event);
  if (!user) return null;
  const email = normalizeEmail(user.email);
  const members = await sb(`member_app_access?or=(auth_user_id.eq.${encodeURIComponent(user.id)},normalized_email.eq.${encodeURIComponent(email)})&access_enabled=eq.true&source_active=eq.true&select=id,first_name,last_name,company,d9_affiliation,growth_kit_tier,growth_kit_tier_rank`);
  if (!Array.isArray(members) || members.length !== 1) return null;
  return { user, email, member: members[0] };
}

async function inviteAuthUser(email) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error('Supabase is not configured');
  const redirectTo = `${String(process.env.APP_BASE_URL || '').replace(/\/$/, '')}/admin/login`;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/invite`, { method: 'POST', headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, data: { invited_to: 'd9network-platform' }, redirect_to: redirectTo }) });
  if (!res.ok) throw new Error('Unable to send the secure invitation');
  return res.json();
}

async function isReadOnlyImpersonation(event, admin) {
  const id = event.headers?.['x-impersonation-session'] || event.headers?.['X-Impersonation-Session'];
  if (!id) return false;
  const sessions = await sb(`impersonation_sessions?id=eq.${encodeURIComponent(id)}&actor_account_id=eq.${admin.account.id}&ended_at=is.null&select=id,is_read_only`);
  if (!sessions?.[0]) throw new Error('Invalid impersonation session');
  return sessions[0].is_read_only !== false;
}

function parseJson(event) { try { return JSON.parse(event.body || '{}'); } catch { return null; } }

module.exports = {
  ADMIN_ROLES, PLATFORM_ROLES, DEFAULT_ROLE_PERMISSIONS, audit, authenticatedUser, canAccessPrompt, filterPromptsByTier,
  hasPermission, ignoredMembership, inviteAuthUser, isReadOnlyImpersonation, normalizeEmail, normalizeMembership, parseJson, permissionSet,
  preflight, requireAdmin, requireMember, requireRoles, response, sb
};
