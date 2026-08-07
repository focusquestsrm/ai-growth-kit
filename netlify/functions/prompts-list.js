const { canUseMemberExperience, preflight, response, sb } = require('./_shared');

exports.handler = async (event) => {
  const pf = preflight(event, ['GET']);
  if (pf) return pf;
  try {
    const access = await canUseMemberExperience(event);
    if (!access.allowed) return response(access.statusCode, { error: access.error });
    const member = access.member || { id: null, first_name: access.user.user_metadata?.first_name || null, last_name: access.user.user_metadata?.last_name || null, company: null, growth_kit_tier: ['','Bronze','Silver','Gold','Platinum'][access.tierRank], growth_kit_tier_rank: access.tierRank, platform_preview: true };
    const prompts = await sb(`prompts?status=eq.published&minimum_tier_rank=lte.${access.tierRank}&select=id,title,slug,description,minimum_tier_rank,estimated_minutes,output_type,tags,is_featured,form_schema,system_prompt,user_prompt_template,output_format,marketplace_upgrade_message,thumbnail_url,thumbnail_type,prompt_categories(id,name,slug,description,category_default_thumbnail),prompt_questions(field_key,label,field_type,placeholder,sort_order,is_required)&order=sort_order.asc,title.asc`);
    return response(200, { member: { ...member, growth_kit_tier_rank: access.tierRank }, platform_admin: access.isPlatformAdmin, prompts: prompts || [] });
  } catch (error) {
    console.error('prompts-list', error);
    return response(500, { error: 'Unable to load prompts' });
  }
};
