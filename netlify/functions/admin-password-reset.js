const { audit, normalizeEmail, parseJson, preflight, requireAdmin, response } = require('./_shared');

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

function serviceHeaders() {
  return { apikey:SUPABASE_SERVICE_KEY, Authorization:`Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type':'application/json' };
}

async function findAuthUserByEmail(email) {
  for (let page = 1; page <= 20; page += 1) {
    const result = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=1000`, { headers:serviceHeaders() });
    if (!result.ok) throw Object.assign(new Error('Unable to query authentication users'), { status:result.status });
    const body = await result.json();
    const users = Array.isArray(body?.users) ? body.users : [];
    const match = users.find((user) => normalizeEmail(user.email) === email);
    if (match) return match;
    if (users.length < 1000) break;
  }
  return null;
}

async function updateAuthPassword(userId, password) {
  const result = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, { method:'PUT', headers:serviceHeaders(), body:JSON.stringify({ password }) });
  if (!result.ok) throw Object.assign(new Error('Unable to update authentication password'), { status:result.status });
  return result.json();
}

exports.handler = async (event) => {
  const pf = preflight(event, ['POST']);
  if (pf) return pf;
  const admin = await requireAdmin(event);
  if (!admin?.roles?.includes('platform_admin')) return response(403, { error:'Platform administrator access required' });
  if (event.headers?.['x-impersonation-session'] || event.headers?.['X-Impersonation-Session']) return response(403, { error:'Changes are disabled while viewing as another user' });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return response(503, { error:'Authentication administration is not configured' });
  const body = parseJson(event);
  const email = normalizeEmail(body?.email), password = String(body?.password || '');
  if (!email || password.length < 12) return response(400, { error:'Enter a valid email and a password with at least 12 characters.' });
  try {
    const target = await findAuthUserByEmail(email);
    if (!target?.id) return response(404, { error:'No Supabase Auth user was found for this email.' });
    await updateAuthPassword(target.id, password);
    const timestamp = new Date().toISOString();
    try {
      await audit(admin, 'password_reset', 'auth_user', target.id, { requesting_admin_user_id:admin.user.id, target_auth_user_id:target.id, target_email:email, action:'password_reset', timestamp });
    } catch (error) {
      console.error('password reset audit failed', { name:error.name, target_auth_user_id:target.id });
      return response(500, { error:'Password updated, but audit logging failed. Do not retry; contact platform support.' });
    }
    return response(200, { success:true, message:'Password updated successfully.' });
  } catch (error) {
    console.error('password reset failed', { name:error.name, status:error.status || null });
    if (error.status === 400 || error.status === 422) return response(400, { error:'Supabase rejected the password. Choose a stronger password and try again.' });
    return response(502, { error:'Unable to update the Supabase Auth password right now.' });
  }
};

exports.findAuthUserByEmail = findAuthUserByEmail;
exports.updateAuthPassword = updateAuthPassword;
