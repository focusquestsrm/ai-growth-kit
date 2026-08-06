const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const APP_ORIGIN = process.env.APP_BASE_URL || '*';
const headers = {
  'Access-Control-Allow-Origin': APP_ORIGIN,
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin'
};

function response(statusCode, body, extraHeaders = {}) {
  return { statusCode, headers: { ...headers, ...extraHeaders }, body: JSON.stringify(body) };
}

function preflight(event, allowed = ['GET', 'POST', 'PATCH', 'DELETE']) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (!allowed.includes(event.httpMethod)) return response(405, { error: 'Method not allowed' });
  return null;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeMembership(value) {
  const tier = String(value || '').trim().toLowerCase();
  const map = { bronze: ['Bronze', 1], silver: ['Silver', 2], gold: ['Gold', 3], platinum: ['Platinum', 4] };
  return map[tier] || null;
}

function ignoredMembership(value) {
  const tier = String(value || '').trim().toLowerCase();
  return tier === 'bronze ii (claim)' || tier === 'ambassador';
}

async function sb(path, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error('Supabase is not configured');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase request failed (${res.status})`);
  return text ? JSON.parse(text) : null;
}

function bearerToken(event) {
  const value = event.headers.authorization || event.headers.Authorization || '';
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

async function authenticatedUser(event) {
  const token = bearerToken(event);
  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user?.id && user?.email ? user : null;
}

const ADMIN_ROLES = ['organization_leader', 'data_admin', 'content_admin', 'platform_admin'];

async function requireRoles(event, allowedRoles = ADMIN_ROLES) {
  const user = await authenticatedUser(event);
  if (!user) return null;
  const email = normalizeEmail(user.email);
  const roles = await sb(`user_roles?or=(auth_user_id.eq.${encodeURIComponent(user.id)},normalized_email.eq.${encodeURIComponent(email)})&role=in.(${allowedRoles.join(',')})&select=role`);
  if (!roles?.length) return null;
  return { user, email, roles: roles.map((item) => item.role) };
}

function parseJson(event) {
  try { return JSON.parse(event.body || '{}'); } catch { return null; }
}

module.exports = {
  ADMIN_ROLES, authenticatedUser, ignoredMembership, normalizeEmail, normalizeMembership,
  parseJson, preflight, requireRoles, response, sb
};
