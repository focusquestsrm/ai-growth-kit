const { authenticatedUser, normalizeEmail, preflight, response, sb } = require('./_shared');

exports.handler = async (event) => {
  const pf = preflight(event, ['GET']);
  if (pf) return pf;
  try {
    const user = await authenticatedUser(event);
    if (!user) return response(401, { error: 'Authentication required' });
    const email = normalizeEmail(user.email);
    const members = await sb(`member_app_access?or=(auth_user_id.eq.${encodeURIComponent(user.id)},normalized_email.eq.${encodeURIComponent(email)})&access_enabled=eq.true&select=id,first_name,last_name,company,growth_kit_tier,growth_kit_tier_rank`);
    if (!Array.isArray(members) || members.length !== 1) return response(403, { error: 'Member access required' });
    const member = members[0];
    const prompts = await sb(`prompts?is_published=eq.true&minimum_tier_rank=lte.${member.growth_kit_tier_rank}&select=id,title,slug,description,minimum_tier_rank,estimated_minutes,output_type,tags,is_featured,form_schema,user_prompt_template,prompt_categories(id,name,slug,description)&order=sort_order.asc,title.asc`);
    return response(200, { member, prompts: prompts || [] });
  } catch (error) {
    console.error('prompts-list', error);
    return response(500, { error: 'Unable to load prompts' });
  }
};
