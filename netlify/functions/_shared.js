const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
const { resolveFirstName } = require('./_identity');

const APP_ORIGIN = process.env.APP_BASE_URL || '*';
const headers = {
  'Access-Control-Allow-Origin': APP_ORIGIN,
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Impersonation-Session, X-Preview-Tier',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin'
};

const PLATFORM_ROLES = ['platform_admin', 'content_admin', 'data_admin', 'member'];
const ADMIN_ROLES = ['platform_admin', 'content_admin', 'data_admin'];
const DEFAULT_ROLE_PERMISSIONS = {
  platform_admin: ['admin.*'],
  content_admin: ['admin.dashboard.read', 'admin.content.manage', 'admin.feedback.manage', 'admin.reporting.read'],
  data_admin: ['admin.dashboard.read', 'admin.members.read', 'admin.members.manage', 'admin.imports.manage'],
  // Kept while existing installations migrate their assignments.
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
  if (!res.ok) {
    const error = new Error(`Supabase request failed (${res.status})`);
    error.status = res.status;
    throw error;
  }
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

function hasRole(subject, role) {
  const roles = Array.isArray(subject) ? subject : (subject?.roles || []);
  return roles.includes(role);
}

function canAccessAdmin(subject) {
  return ADMIN_ROLES.some((role) => hasRole(subject, role));
}

function canAccessPlatform(subject) {
  return hasRole(subject, 'platform_admin') || hasRole(subject, 'super_admin');
}

function memberExperienceEligible(subject) {
  const supportedMembership = Boolean(subject?.member && normalizeMembership(subject.member.growth_kit_tier));
  return Boolean(subject?.user && (supportedMembership || canAccessPlatform(subject)));
}

async function audit(actor, action, entityType, entityId, details = {}) {
  await sb('audit_logs', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({
    actor_auth_user_id: actor.user?.id || null,
    actor_email: actor.email || null,
    action, entity_type: entityType, entity_id: entityId || null, details
  }) });
}

async function ensurePlatformOwner(user) {
  const ownerEmail = normalizeEmail(process.env.INITIAL_PLATFORM_ADMIN_EMAIL);
  if (!ownerEmail || normalizeEmail(user.email) !== ownerEmail) return;
  const existingRoles = await sb(`user_roles?auth_user_id=eq.${encodeURIComponent(user.id)}&role=eq.platform_admin&is_active=eq.true&select=id`);
  if (!existingRoles?.length) {
    await sb('user_roles', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ auth_user_id: user.id, email: user.email, normalized_email: ownerEmail, role: 'platform_admin', is_active: true, assigned_by: 'INITIAL_PLATFORM_ADMIN_EMAIL' }) });
    await audit({ user, email: ownerEmail }, 'platform_admin.bootstrap', 'user_role', null, { source: 'INITIAL_PLATFORM_ADMIN_EMAIL' });
  }
  const accounts = await sb(`platform_accounts?normalized_email=eq.${encodeURIComponent(ownerEmail)}&select=id,auth_user_id,first_name,last_name`);
  let account = accounts?.[0];
  const firstName = resolveFirstName(account || {}, user) || null;
  const lastName = String(account?.last_name || user.user_metadata?.last_name || '').trim() || null;
  const payload = { auth_user_id: user.id, email: user.email, normalized_email: ownerEmail, first_name: firstName, last_name: lastName, organization: 'D9Network', account_type: 'internal', account_status: 'active', membership_status: 'non_member', member_access_id: null, simulated_tier: null, account_designation: 'Platform Administrator', updated_at: new Date().toISOString() };
  if (account) {
    const updated = await sb(`platform_accounts?id=eq.${account.id}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) });
    account = updated?.[0] || { ...account, ...payload };
  } else {
    const created = await sb('platform_accounts', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) });
    account = created?.[0];
  }
  if (!account?.id) throw new Error('Unable to create the platform owner account');
  await sb('platform_role_assignments?on_conflict=account_id,role,scope', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ account_id: account.id, role: 'platform_admin', permissions: ['admin.*'], scope: 'd9network', is_active: true }) });
}

async function activeRoles(user) {
  const email = normalizeEmail(user.email);
  const roles = await sb(`user_roles?or=(auth_user_id.eq.${encodeURIComponent(user.id)},normalized_email.eq.${encodeURIComponent(email)})&is_active=eq.true&select=role`);
  return [...new Set((roles || []).map((item) => item.role))];
}

function resolvePreviewTierRank(access, requestedTier) {
  if (!canAccessPlatform(access)) return Number(access.member?.growth_kit_tier_rank || 0);
  const names = { bronze: 1, silver: 2, gold: 3, platinum: 4 };
  const requested = String(requestedTier || '').trim().toLowerCase();
  return names[requested] || 4;
}

function previewTierRank(event, access) {
  return resolvePreviewTierRank(access, event.headers?.['x-preview-tier'] || event.headers?.['X-Preview-Tier']);
}

async function canUseMemberExperience(event) {
  const user = await authenticatedUser(event);
  if (!user) return { allowed: false, statusCode: 401, error: 'Please sign in to continue.' };
  await ensurePlatformOwner(user);
  const email = normalizeEmail(user.email);
  const [members, roles, accounts] = await Promise.all([
    sb(`member_app_access?or=(auth_user_id.eq.${encodeURIComponent(user.id)},normalized_email.eq.${encodeURIComponent(email)})&access_enabled=eq.true&source_active=eq.true&growth_kit_tier=in.(Bronze,Silver,Gold,Platinum)&select=id,first_name,last_name,company,d9_affiliation,growth_kit_tier,growth_kit_tier_rank`),
    activeRoles(user),
    sb(`platform_accounts?or=(auth_user_id.eq.${encodeURIComponent(user.id)},normalized_email.eq.${encodeURIComponent(email)})&account_status=eq.active&select=id,first_name,last_name`)
  ]);
  const member = Array.isArray(members) && members.length === 1 ? members[0] : null;
  const account = accounts?.[0] || null;
  const access = { user, email, member, account, roles };
  access.allowed = memberExperienceEligible(access);
  if (!access.allowed) return { ...access, statusCode: 403, error: 'Your account does not currently have access to this feature.' };
  access.isPlatformAdmin = canAccessPlatform(access);
  access.identityProfile = access.isPlatformAdmin ? (account || member || {}) : (member || account || {});
  access.firstName = resolveFirstName(access.identityProfile, user);
  access.tierRank = previewTierRank(event, access);
  access.ownerColumn = access.isPlatformAdmin ? 'auth_user_id' : 'member_access_id';
  access.ownerId = access.ownerColumn === 'auth_user_id' ? user.id : member.id;
  return access;
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
    account_designation: invitation.role.replaceAll('_', ' '),
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

function invitationRedirectUrl(destination = '/admin/login') {
  const configured = String(process.env.APP_BASE_URL || '').trim();
  if (!configured) throw new Error('Application URL is not configured');
  let base;
  try { base = new URL(configured); } catch { throw new Error('Application URL is invalid'); }
  const local = base.hostname === 'localhost' || base.hostname === '127.0.0.1';
  if ((base.protocol !== 'https:' && !(local && base.protocol === 'http:')) || (process.env.CONTEXT === 'production' && local)) throw new Error('Application URL is not safe for invitations');
  const callback = new URL('/auth/callback', base.origin);
  callback.searchParams.set('next', String(destination || '/admin/login').startsWith('/') ? destination : '/admin/login');
  return callback.toString();
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
  const canonicalRoles = await activeRoles(user);
  const roles = [...new Set([...(assignments || []).map((item) => item.role), ...canonicalRoles])];
  const permissions = permissionSet(assignments);
  const primaryAllowed = roles.some((role) => ADMIN_ROLES.includes(role) || role === 'super_admin' || role === 'admin' || role === 'staff');
  const exceptionalAllowed = (roles.includes('executive_viewer') && (requiredPermission === 'admin.reporting.read' || (!requiredPermission && hasPermission(permissions, 'admin.reporting.read')))) || (roles.includes('partner_admin') && (requiredPermission?.startsWith('admin.partner.') || (!requiredPermission && [...permissions].some((value) => value.startsWith('admin.partner.')))));
  if ((!primaryAllowed && !exceptionalAllowed) || !hasPermission(permissions, requiredPermission)) return null;
  return { user, email, account, assignments, roles, permissions };
}

// Compatibility export. New code should request a concrete permission with requireAdmin.
async function requireRoles(event) { return requireAdmin(event); }

async function requireMember(event) {
  const access = await canUseMemberExperience(event);
  return access.allowed ? access : null;
}

async function inviteAuthUser(email, destination = '/admin/login') {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error('Supabase is not configured');
  const payload = { email, data: { invited_to: 'd9network-platform' }, redirect_to: invitationRedirectUrl(destination) };
  const res = await fetch(`${SUPABASE_URL}/auth/v1/invite`, { method: 'POST', headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const error = new Error(String(body.msg || body.message || body.error_description || 'Unable to send the secure invitation'));
    error.status = res.status;
    error.code = body.code || body.error_code || null;
    throw error;
  }
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
  ADMIN_ROLES, PLATFORM_ROLES, DEFAULT_ROLE_PERMISSIONS, audit, authenticatedUser, canAccessAdmin, canAccessPlatform, canAccessPrompt, canUseMemberExperience, filterPromptsByTier, hasRole, memberExperienceEligible,
  activateInvitation, ensurePlatformOwner, hasPermission, ignoredMembership, invitationRedirectUrl, inviteAuthUser, isReadOnlyImpersonation, normalizeEmail, normalizeMembership, parseJson, permissionSet,
  preflight, requireAdmin, requireMember, requireRoles, resolvePreviewTierRank, response, sb
};
