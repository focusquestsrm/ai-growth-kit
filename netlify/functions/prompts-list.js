const { preflight, requireMember, response, sb } = require('./_shared');

exports.handler = async (event) => {
  const pf = preflight(event, ['GET']);
  if (pf) return pf;
  try {
    const access = await requireMember(event);
    if (!access) return response(403, { error: 'Member access required' });
    const member = access.member;
    const prompts = await sb(`prompts?status=eq.published&minimum_tier_rank=lte.${member.growth_kit_tier_rank}&select=id,title,slug,description,minimum_tier_rank,estimated_minutes,output_type,tags,is_featured,form_schema,user_prompt_template,marketplace_upgrade_message,prompt_categories(id,name,slug,description),prompt_questions(field_key,label,field_type,placeholder,sort_order,is_required)&order=sort_order.asc,title.asc`);
    return response(200, { member, prompts: prompts || [] });
  } catch (error) {
    console.error('prompts-list', error);
    return response(500, { error: 'Unable to load prompts' });
  }
};
