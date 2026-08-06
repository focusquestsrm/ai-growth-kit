const { normalizeEmail, parseJson, preflight, response, sb } = require('./_shared');

exports.handler = async (event) => {
  const pf = preflight(event, ['POST']);
  if (pf) return pf;
  const body = parseJson(event);
  if (!body) return response(400, { error: 'Invalid request' });
  const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const anon = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anon) {
    const missing = [!url && 'SUPABASE_URL', !anon && 'SUPABASE_ANON_KEY or SUPABASE_PUBLISHABLE_KEY'].filter(Boolean);
    console.error('auth-session configuration missing', missing);
    return response(503, { error: `Authentication is not configured. Missing: ${missing.join(', ')}` });
  }
  const isRefresh = body.action === 'refresh';
  const payload = isRefresh ? { refresh_token: body.refresh_token } : { email: String(body.email || '').trim(), password: String(body.password || '') };
  if ((!isRefresh && (!payload.email || !payload.password)) || (isRefresh && !payload.refresh_token)) return response(400, { error: 'Sign-in details are required' });
  try {
    const grant = isRefresh ? 'refresh_token' : 'password';
    const result = await fetch(`${url}/auth/v1/token?grant_type=${grant}`, {
      method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    if (!result.ok) return response(401, { error: 'The email or password is incorrect.' });
    const session = await result.json();
    try { await sb(`user_roles?normalized_email=eq.${encodeURIComponent(normalizeEmail(session.user.email))}`, { method:'PATCH', headers:{ Prefer:'return=minimal' }, body:JSON.stringify({ last_login_at:new Date().toISOString() }) }); } catch {}
    return response(200, { access_token: session.access_token, refresh_token: session.refresh_token, expires_in: session.expires_in, user: { id: session.user.id, email: session.user.email } });
  } catch (error) {
    console.error('auth-session', error);
    return response(503, { error: 'Unable to sign in right now.' });
  }
};
