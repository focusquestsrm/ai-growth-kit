const { canUseMemberExperience, parseJson, preflight, response, sb } = require('./_shared');

const INDUSTRIES = ['Accounting & Financial Services','Advertising, Marketing & Public Relations','Agriculture & Food Production','Arts, Entertainment & Media','Automotive & Transportation Services','Beauty, Personal Care & Wellness','Business Consulting & Professional Services','Childcare & Family Services','Construction & Skilled Trades','Consumer Products & Retail','Education & Training','Energy & Utilities','Engineering & Technical Services','Event Planning & Hospitality','Food & Beverage','Government & Public Sector Services','Healthcare & Medical Services','Home Services & Property Maintenance','Human Resources & Staffing','Information Technology & Cybersecurity','Insurance','Legal Services','Logistics, Distribution & Supply Chain','Manufacturing','Nonprofit & Community Services','Real Estate & Property Management','Restaurants & Catering','Security & Protective Services','Sports, Fitness & Recreation','Telecommunications','Travel & Tourism','Transportation & Delivery','Other'];
const STAGES = ['Idea','Startup','Established','Scaling','Mature'];
const GEOGRAPHIC_MARKETS = ['Local','Regional','Statewide','Multi-State','National','International','Online / Location-Independent'];
const CHALLENGES = ['Marketing & Visibility','Finding New Customers','Increasing Sales','Access to Capital','Operations & Efficiency','Hiring & Talent','Government Contracting','Corporate Partnerships','Technology & Digital Transformation','Leadership & Strategy','Other'];
const CERTIFICATIONS = ['Small Business / SBA-qualified','Minority Business Enterprise (MBE)','Women-Owned Small Business (WOSB)','Veteran-Owned / Service-Disabled Veteran-Owned','HUBZone','8(a) Business Development Program','Disadvantaged Business Enterprise (DBE)','State or Local Minority Business Certification','Other Certification','None','Not Sure'];
const clean = (value) => String(value || '').trim() || null;
const validUrl = (value) => { if (!value) return true; try { return ['http:','https:'].includes(new URL(value).protocol); } catch { return false; } };

exports.handler = async (event) => {
  const pf = preflight(event, ['GET', 'POST', 'DELETE']);
  if (pf) return pf;
  const access = await canUseMemberExperience(event);
  if (!access.allowed) return response(access.statusCode, { error: access.error });
  const ownerFilter = `${access.ownerColumn}=eq.${encodeURIComponent(access.ownerId)}`;
  const ownerPayload = { [access.ownerColumn]: access.ownerId };
  try {
    if (event.httpMethod === 'GET') {
      const optional = async (request, fallback) => { try { return await request; } catch { return fallback; } };
      const loadStrategies = async () => { try { return await sb(`saved_strategies?${ownerFilter}&select=id,title,strategy_text,input_payload,is_favorite,created_at,updated_at,prompts(title,slug)&order=updated_at.desc&limit=100`); } catch { const legacy = await sb(`saved_outputs?${ownerFilter}&select=id,title,output_text,input_payload,created_at,updated_at,prompts(title,slug)&order=updated_at.desc&limit=100`); return (legacy || []).map((item) => ({ ...item, strategy_text:item.output_text, is_favorite:false })); } };
      const [profile, outputs, generations, favorites, health] = await Promise.all([
        sb(`business_profiles?${ownerFilter}&select=*`),
        loadStrategies(),
        sb(`prompt_generations?${ownerFilter}&select=id,status,created_at,prompts(title,slug,prompt_categories(name))&order=created_at.desc&limit=20`),
        optional(sb(`favorite_tools?${ownerFilter}&select=prompt_id,created_at`), []),
        optional(sb(`business_health_assessments?${ownerFilter}&select=*&order=created_at.desc&limit=1`), [])
      ]);
      return response(200, { profile: profile?.[0] || null, outputs: outputs || [], generations: generations || [], favorites: favorites || [], health: health?.[0] || null });
    }
    const body = parseJson(event);
    if (!body?.action) return response(400, { error: 'Action is required' });
    if (body.action === 'record_generation' || body.action === 'record_tool_use' || body.action === 'save_output') {
      const prompts = await sb(`prompts?id=eq.${encodeURIComponent(body.prompt_id)}&status=eq.published&minimum_tier_rank=lte.${access.tierRank}&select=*`);
      if (prompts?.length !== 1) return response(403, { error: 'Prompt access denied' });
      const versionedInputPayload = { ...(body.input_payload || {}), prompt_version: prompts[0].prompt_version || body.input_payload?.prompt_version || '1.0' };
      if (body.action === 'record_generation' || body.action === 'record_tool_use') {
        const copiedOnly = body.action === 'record_tool_use';
        const created = await sb('prompt_generations', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ ...ownerPayload, prompt_id: prompts[0].id, input_payload: versionedInputPayload, output_text: copiedOnly ? null : String(body.output_text || ''), status: copiedOnly ? 'prompt_copied' : 'completed' }) });
        return response(200, { generation: created?.[0] });
      }
      if (!String(body.output_text || '').trim()) return response(400, { error: 'Output is required' });
      let saved;
      try { saved = await sb('saved_strategies', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ ...ownerPayload, prompt_id: prompts[0].id, title: String(body.title || prompts[0].title).trim(), input_payload: versionedInputPayload, strategy_text: String(body.output_text).trim() }) }); }
      catch { saved = await sb('saved_outputs', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ ...ownerPayload, prompt_id: prompts[0].id, title: String(body.title || prompts[0].title).trim(), input_payload: versionedInputPayload, output_text: String(body.output_text).trim() }) }); }
      return response(200, { output: saved?.[0] });
    }
    if (body.action === 'save_profile') {
      const input = body.profile || {};
      const industry = clean(input.industry), stage = clean(input.business_stage), geographicMarket = clean(input.geographic_market);
      if (!INDUSTRIES.includes(industry)) return response(400, { error: 'Select a valid Industry' });
      if (stage && !STAGES.includes(stage)) return response(400, { error: 'Select a valid Business Stage' });
      if (geographicMarket && !GEOGRAPHIC_MARKETS.includes(geographicMarket)) return response(400, { error: 'Select a valid Geographic Market' });
      const challenges = [...new Set(Array.isArray(input.primary_business_challenges) ? input.primary_business_challenges.map(clean).filter(Boolean) : [])];
      if (challenges.some((value) => !CHALLENGES.includes(value))) return response(400, { error: 'Select valid Primary Business Challenges' });
      if (industry === 'Other' && !clean(input.other_industry_name)) return response(400, { error: 'Other Industry Name is required' });
      if (challenges.includes('Other') && !clean(input.other_business_challenge)) return response(400, { error: 'Other Business Challenge is required' });
      const certifications = [...new Set(Array.isArray(input.business_certifications) ? input.business_certifications.map(clean).filter(Boolean) : [])];
      if (certifications.some((value) => !CERTIFICATIONS.includes(value))) return response(400, { error: 'Select valid Business Certifications & Designations' });
      if ((certifications.includes('None') || certifications.includes('Not Sure')) && certifications.length > 1) return response(400, { error: 'None and Not Sure cannot be combined with other certifications' });
      if (certifications.includes('Other Certification') && !clean(input.other_certification_name)) return response(400, { error: 'Other Certification Name is required' });
      const interested = clean(input.interested_in_certifications);
      if (interested && !['Yes','No','Not Sure'].includes(interested)) return response(400, { error: 'Select a valid certification interest' });
      const urlKeys = ['website','social_linkedin','social_facebook','social_instagram','social_x','social_other'];
      if (urlKeys.some((key) => !validUrl(clean(input[key])))) return response(400, { error: 'Website and social links must use valid http or https URLs' });
      const allowed = ['business_name','website','industry','other_industry_name','business_description','products','services','target_market','ideal_customer','business_goals','business_stage','geographic_market','primary_markets_served','markets_to_enter','other_business_challenge','other_certification_name','interested_in_certifications','social_linkedin','social_facebook','social_instagram','social_x','social_other'];
      const profile = Object.fromEntries(allowed.map((key) => [key, clean(input[key])]));
      if (industry !== 'Other') profile.other_industry_name = null;
      if (!challenges.includes('Other')) profile.other_business_challenge = null;
      if (!certifications.includes('Other Certification')) profile.other_certification_name = null;
      profile.business_certifications = certifications;
      profile.primary_business_challenges = challenges;
      profile.years_in_business = input.years_in_business === '' || input.years_in_business == null ? null : Math.max(0, Number(input.years_in_business) || 0);
      Object.assign(profile, ownerPayload); profile.updated_at = new Date().toISOString();
      const saved = await sb(`business_profiles?on_conflict=${access.ownerColumn}`, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(profile) });
      return response(200, { profile: saved?.[0] });
    }
    if (body.action === 'delete_output') {
      try { await sb(`saved_strategies?id=eq.${encodeURIComponent(body.id)}&${ownerFilter}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); }
      catch { await sb(`saved_outputs?id=eq.${encodeURIComponent(body.id)}&${ownerFilter}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); }
      return response(200, { success: true });
    }
    if (body.action === 'duplicate_output') {
      let legacy=false,rows; try { rows = await sb(`saved_strategies?id=eq.${encodeURIComponent(body.id)}&${ownerFilter}&select=prompt_id,title,input_payload,strategy_text`); } catch { legacy=true; rows=await sb(`saved_outputs?id=eq.${encodeURIComponent(body.id)}&${ownerFilter}&select=prompt_id,title,input_payload,output_text`); if(rows?.[0])rows[0].strategy_text=rows[0].output_text; }
      if (rows?.length !== 1) return response(404, { error: 'Saved strategy not found' });
      const original = rows[0];
      const payload={ ...ownerPayload,prompt_id:original.prompt_id,title:`${original.title} (Copy)`,input_payload:original.input_payload,[legacy?'output_text':'strategy_text']:original.strategy_text };
      const saved = await sb(legacy?'saved_outputs':'saved_strategies', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) });
      return response(200, { output: saved?.[0] });
    }
    if (body.action === 'update_strategy') {
      const title = String(body.title || '').trim();
      const strategyText = String(body.strategy_text || '').trim();
      if (!body.id || !title || !strategyText) return response(400, { error: 'Strategy title and content are required' });
      let saved; try { saved = await sb(`saved_strategies?id=eq.${encodeURIComponent(body.id)}&${ownerFilter}`, { method:'PATCH', headers:{ Prefer:'return=representation' }, body:JSON.stringify({ title, strategy_text:strategyText, is_favorite:Boolean(body.is_favorite), updated_at:new Date().toISOString() }) }); }
      catch { saved = await sb(`saved_outputs?id=eq.${encodeURIComponent(body.id)}&${ownerFilter}`, { method:'PATCH', headers:{ Prefer:'return=representation' }, body:JSON.stringify({ title, output_text:strategyText, updated_at:new Date().toISOString() }) }); }
      if (!saved?.length) return response(404, { error: 'Saved strategy not found' });
      return response(200, { output:saved[0] });
    }
    if (body.action === 'set_favorite') {
      const prompts = await sb(`prompts?id=eq.${encodeURIComponent(body.prompt_id)}&status=eq.published&minimum_tier_rank=lte.${access.tierRank}&select=id`);
      if (prompts?.length !== 1) return response(403, { error: 'Business Growth Tool access denied' });
      if (body.favorite) await sb(`favorite_tools?on_conflict=${access.ownerColumn},prompt_id`, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ ...ownerPayload, prompt_id: body.prompt_id }) });
      else await sb(`favorite_tools?${ownerFilter}&prompt_id=eq.${encodeURIComponent(body.prompt_id)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
      return response(200, { success: true });
    }
    if (body.action === 'submit_feedback') {
      const rating = body.rating == null || body.rating === '' ? null : Number(body.rating);
      if (rating != null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) return response(400, { error: 'Rating must be between 1 and 5' });
      const type = ['suggestion','strategy_rating','issue'].includes(body.feedback_type) ? body.feedback_type : 'suggestion';
      const comments = String(body.comments || '').trim();
      if (!comments && rating == null) return response(400, { error: 'Add a rating or comment' });
      await sb('platform_feedback', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ ...ownerPayload, page: String(body.page || 'dashboard').slice(0, 80), prompt_id: body.prompt_id || null, saved_output_id: body.saved_output_id || null, rating, feedback_type: type, comments: comments || null }) });
      return response(200, { success: true });
    }
    if (body.action === 'save_health') {
      const keys = ['marketing_score','sales_score','operations_score','networking_score','leadership_score','financial_readiness_score'];
      const scores = Object.fromEntries(keys.map((key) => [key, Number(body[key])]));
      if (keys.some((key) => !Number.isInteger(scores[key]) || scores[key] < 1 || scores[key] > 5)) return response(400, { error: 'All health scores must be between 1 and 5' });
      scores.overall_score = Number((keys.reduce((sum, key) => sum + scores[key], 0) / keys.length).toFixed(2));
      const saved = await sb('business_health_assessments', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ ...ownerPayload, ...scores }) });
      return response(200, { health: saved?.[0] });
    }
    return response(400, { error: 'Unsupported action' });
  } catch (error) {
    console.error('member-workspace', { message: error.message, ownerId: access.ownerId, method: event.httpMethod });
    return response(500, { error: 'Unable to update the member workspace' });
  }
};
