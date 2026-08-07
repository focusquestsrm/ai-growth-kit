const { activateInvitation, authenticatedUser, ensurePlatformOwner, normalizeEmail, parseJson, preflight, response, sb } = require('./_shared');

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
  if (body.action === 'logout') {
    const token = String(event.headers?.authorization || event.headers?.Authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return response(200, { success:true });
    try {
      const result = await fetch(`${url}/auth/v1/logout`, { method:'POST', headers:{ apikey:anon, Authorization:`Bearer ${token}` } });
      if (!result.ok && result.status !== 401) return response(502, { error:'Unable to end the server session.' });
      return response(200, { success:true });
    } catch {
      return response(503, { error:'Unable to end the server session.' });
    }
  }
  if (body.action === 'complete_invitation') {
    const password = String(body.password || '');
    if (password.length < 8) return response(400, { error: 'Choose a password with at least 8 characters.' });
    try {
      const user = await authenticatedUser(event);
      if (!user) return response(401, { error: 'This invitation link is invalid or has expired. Ask an administrator to resend it.' });
      const token = String(event.headers?.authorization || event.headers?.Authorization || '').replace(/^Bearer\s+/i, '');
      const result = await fetch(`${url}/auth/v1/user`, { method:'PUT', headers:{ apikey:anon, Authorization:`Bearer ${token}`, 'Content-Type':'application/json' }, body:JSON.stringify({ password }) });
      if (!result.ok) return response(result.status === 401 ? 401 : 400, { error: result.status === 401 ? 'This invitation link is invalid or has expired. Ask an administrator to resend it.' : 'Your password could not be saved. Choose a stronger password and try again.' });
      const updatedUser = await result.json();
      await ensurePlatformOwner(updatedUser);
      await activateInvitation(updatedUser);
      const metadata = updatedUser.user_metadata || {};
      return response(200, { success:true, user:{ id:updatedUser.id, email:updatedUser.email, user_metadata:{ first_name:metadata.first_name || null, full_name:metadata.full_name || null } } });
    } catch (error) {
      console.error('invitation completion failed', { name:error.name, message:error.message });
      return response(503, { error:'Unable to finish account setup right now. Please try again.' });
    }
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
    await ensurePlatformOwner(session.user);
    try { await sb(`user_roles?normalized_email=eq.${encodeURIComponent(normalizeEmail(session.user.email))}`, { method:'PATCH', headers:{ Prefer:'return=minimal' }, body:JSON.stringify({ last_login_at:new Date().toISOString() }) }); } catch {}
    const metadata = session.user.user_metadata || {};
    return response(200, { access_token: session.access_token, refresh_token: session.refresh_token, expires_in: session.expires_in, user: { id: session.user.id, email: session.user.email, user_metadata: { first_name: metadata.first_name || null, full_name: metadata.full_name || null } } });
  } catch (error) {
    console.error('auth-session', error);
    return response(503, { error: 'Unable to sign in right now.' });
  }
};
