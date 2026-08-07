const { canUseMemberExperience, preflight, response, sb } = require('./_shared');

exports.handler = async (event) => {
  const pf = preflight(event, ['GET']);
  if (pf) return pf;
  const access = await canUseMemberExperience(event);
  if (!access.allowed) return response(access.statusCode, { error: access.error });
  try {
    const [categories, items] = await Promise.all([
      sb('marketplace_categories?active=eq.true&select=id,name,slug,description,display_order,active,coming_soon&order=display_order.asc,name.asc'),
      sb('marketplace_items?active=eq.true&select=id,name,slug,description,who_it_is_for,helps_with,key_capabilities,profile_context,expected_inputs,potential_outputs,is_premium,thumbnail_url,cta_label,pricing_status,pricing_model,price,currency,billing_interval,credit_cost,included_runs,trial_available,purchase_url,active,display_order,marketplace_categories(id,name,slug)&order=display_order.asc,name.asc')
    ]);
    return response(200, { categories: categories || [], items: items || [] });
  } catch (error) {
    console.error('marketplace-list', { message: error.message, ownerId: access.ownerId });
    return response(503, { error: 'Business Growth Marketplace setup is not available yet' });
  }
};
