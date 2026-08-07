const { canUseMemberExperience, preflight, response, sb } = require('./_shared');

exports.handler = async (event) => {
  const pf = preflight(event, ['GET']);
  if (pf) return pf;
  try {
    const access = await canUseMemberExperience(event);
    if (!access.allowed) return response(access.statusCode, { error: access.error });
    const member = access.member || { id: null, last_name: access.identityProfile?.last_name || null, company: null, growth_kit_tier: ['','Bronze','Silver','Gold','Platinum'][access.tierRank], growth_kit_tier_rank: access.tierRank, platform_preview: true };
    let prompts;
    try { prompts = await sb(`prompts?status=eq.published&minimum_tier_rank=lte.${access.tierRank}&select=id,title,slug,description,minimum_tier_rank,estimated_minutes,output_type,tags,is_featured,form_schema,user_prompt_template,context_fields,task_template,required_output,guardrails,prompt_version,marketplace_upgrade_message,thumbnail_url,thumbnail_type,prompt_categories(id,name,slug,description,category_default_thumbnail),prompt_questions(field_key,label,field_type,placeholder,sort_order,is_required)&order=sort_order.asc,title.asc`); }
    catch { prompts = await sb(`prompts?status=eq.published&minimum_tier_rank=lte.${access.tierRank}&select=id,title,slug,description,minimum_tier_rank,estimated_minutes,output_type,tags,is_featured,form_schema,user_prompt_template,output_format,marketplace_upgrade_message,thumbnail_url,thumbnail_type,prompt_categories(id,name,slug,description,category_default_thumbnail),prompt_questions(field_key,label,field_type,placeholder,sort_order,is_required)&order=sort_order.asc,title.asc`); }
    return response(200, { member: { ...member, first_name: access.firstName || null, growth_kit_tier_rank: access.tierRank }, platform_admin: access.isPlatformAdmin, prompts: prompts || [] });
  } catch (error) {
    console.error('prompts-list', error);
    return response(500, { error: 'Unable to load prompts' });
  }
};
