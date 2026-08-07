const { createReviewSession, parseJson, preflight, response, reviewModeEnabled } = require('./_shared');

const MEMBER_TIERS = { bronze:1, silver:2, gold:3, platinum:4 };

exports.handler = async (event) => {
  const pf = preflight(event, ['GET', 'POST']);
  if (pf) return pf;
  if (event.httpMethod === 'GET') return response(200, { enabled:reviewModeEnabled() });
  if (!reviewModeEnabled()) return response(404, { error:'Review mode is not enabled.' });

  const selection = String(parseJson(event)?.selection || '').trim().toLowerCase();
  const isAdmin = selection === 'admin';
  const tierRank = MEMBER_TIERS[selection] || null;
  if (!isAdmin && !tierRank) return response(400, { error:'Select a valid review experience.' });

  try {
    const token = createReviewSession(isAdmin ? 'admin' : 'member', tierRank);
    return response(200, { token, view:isAdmin ? 'admin' : 'member', tier_rank:tierRank, label:isAdmin ? 'Admin' : `${selection[0].toUpperCase()}${selection.slice(1)}` });
  } catch {
    return response(503, { error:'Review mode is not fully configured.' });
  }
};

