const { preflight, response } = require('./_shared');

exports.handler = async (event) => {
  const pf = preflight(event, ['GET']);
  if (pf) return pf;
  const configured = Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY) && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY));
  return response(configured ? 200 : 503, { status: configured ? 'ok' : 'configuration_required', service: 'd9-business-growth-platform', timestamp: new Date().toISOString() });
};
