const { authenticatedUser, normalizeEmail, normalizeMembership, parseJson, preflight, response, sb } = require('./_shared');

const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function limited(key, now = Date.now()) {
  const recent = (attempts.get(key) || []).filter((time) => now - time < WINDOW_MS);
  recent.push(now);
  attempts.set(key, recent);
  return recent.length > MAX_ATTEMPTS;
}

exports.handler = async (event) => {
  const pf = preflight(event, ['POST']);
  if (pf) return pf;
  const ip = event.headers['x-nf-client-connection-ip'] || event.headers['x-forwarded-for'] || 'unknown';
  if (limited(String(ip).split(',')[0])) return response(429, { eligible: false, error: 'Too many attempts. Please try again later.' }, { 'Retry-After': '900' });

  try {
    const user = await authenticatedUser(event);
    if (!user) return response(401, { eligible: false, error: 'Authentication required' });
    const body = parseJson(event);
    const email = normalizeEmail(body?.email);
    const bdUserId = String(body?.user_id || '').trim();
    const tier = normalizeMembership(body?.membership);
    if (!email || !bdUserId || !tier || email !== normalizeEmail(user.email)) {
      return response(400, { eligible: false, error: 'We could not verify those membership details.' });
    }

    const query = `member_app_access?normalized_email=eq.${encodeURIComponent(email)}&bd_user_id=eq.${encodeURIComponent(bdUserId)}&growth_kit_tier=eq.${tier[0]}&access_enabled=eq.true&select=id,first_name,last_name,company,growth_kit_tier,growth_kit_tier_rank`;
    const rows = await sb(query);
    if (!Array.isArray(rows) || rows.length !== 1) {
      return response(403, { eligible: false, error: 'We could not verify those membership details.' });
    }
    await sb(`member_app_access?id=eq.${rows[0].id}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ auth_user_id: user.id, updated_at: new Date().toISOString() })
    });
    return response(200, { eligible: true, member: rows[0] });
  } catch (error) {
    console.error('member-eligibility', error);
    return response(500, { eligible: false, error: 'Unable to verify access right now.' });
  }
};

exports._test = { limited, attempts };
