const { parseJson, preflight, requireMember, response, sb } = require('./_shared');

exports.handler = async (event) => {
  const pf = preflight(event, ['GET', 'POST', 'DELETE']);
  if (pf) return pf;
  const access = await requireMember(event);
  if (!access) return response(403, { error: 'Member access required' });
  const memberId = access.member.id;
  try {
    if (event.httpMethod === 'GET') {
      const optional = async (request, fallback) => { try { return await request; } catch { return fallback; } };
      const [profile, outputs, generations, favorites, health] = await Promise.all([
        sb(`business_profiles?member_access_id=eq.${memberId}&select=*`),
        sb(`saved_outputs?member_access_id=eq.${memberId}&select=id,title,output_text,input_payload,created_at,prompts(title,slug)&order=created_at.desc&limit=100`),
        sb(`prompt_generations?member_access_id=eq.${memberId}&select=id,status,created_at,prompts(title,slug,prompt_categories(name))&order=created_at.desc&limit=20`),
        optional(sb(`favorite_tools?member_access_id=eq.${memberId}&select=prompt_id,created_at`), []),
        optional(sb(`business_health_assessments?member_access_id=eq.${memberId}&select=*&order=created_at.desc&limit=1`), [])
      ]);
      return response(200, { profile: profile?.[0] || null, outputs: outputs || [], generations: generations || [], favorites: favorites || [], health: health?.[0] || null });
    }
    const body = parseJson(event);
    if (!body?.action) return response(400, { error: 'Action is required' });
    if (body.action === 'record_generation' || body.action === 'save_output') {
      const prompts = await sb(`prompts?id=eq.${encodeURIComponent(body.prompt_id)}&status=eq.published&minimum_tier_rank=lte.${access.member.growth_kit_tier_rank}&select=id,title`);
      if (prompts?.length !== 1) return response(403, { error: 'Prompt access denied' });
      if (body.action === 'record_generation') {
        const created = await sb('prompt_generations', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ member_access_id: memberId, prompt_id: prompts[0].id, input_payload: body.input_payload || {}, output_text: String(body.output_text || ''), status: 'completed' }) });
        return response(200, { generation: created?.[0] });
      }
      if (!String(body.output_text || '').trim()) return response(400, { error: 'Output is required' });
      const saved = await sb('saved_outputs', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ member_access_id: memberId, prompt_id: prompts[0].id, title: String(body.title || prompts[0].title).trim(), input_payload: body.input_payload || {}, output_text: String(body.output_text).trim() }) });
      return response(200, { output: saved?.[0] });
    }
    if (body.action === 'save_profile') {
      const input = body.profile || {};
      const allowed = ['business_name','website','industry','business_description','products','services','target_market','ideal_customer','business_goals','business_stage','geographic_market','social_media','certifications','minority_owned_status','small_business_status'];
      const profile = Object.fromEntries(allowed.map((key) => [key, String(input[key] || '').trim() || null]));
      profile.years_in_business = input.years_in_business === '' || input.years_in_business == null ? null : Math.max(0, Number(input.years_in_business) || 0);
      profile.member_access_id = memberId; profile.updated_at = new Date().toISOString();
      const saved = await sb('business_profiles?on_conflict=member_access_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(profile) });
      return response(200, { profile: saved?.[0] });
    }
    if (body.action === 'delete_output') {
      await sb(`saved_outputs?id=eq.${encodeURIComponent(body.id)}&member_access_id=eq.${memberId}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
      return response(200, { success: true });
    }
    if (body.action === 'duplicate_output') {
      const rows = await sb(`saved_outputs?id=eq.${encodeURIComponent(body.id)}&member_access_id=eq.${memberId}&select=prompt_id,title,input_payload,output_text`);
      if (rows?.length !== 1) return response(404, { error: 'Saved strategy not found' });
      const original = rows[0];
      const saved = await sb('saved_outputs', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ ...original, member_access_id: memberId, title: `${original.title} (Copy)` }) });
      return response(200, { output: saved?.[0] });
    }
    if (body.action === 'set_favorite') {
      const prompts = await sb(`prompts?id=eq.${encodeURIComponent(body.prompt_id)}&status=eq.published&minimum_tier_rank=lte.${access.member.growth_kit_tier_rank}&select=id`);
      if (prompts?.length !== 1) return response(403, { error: 'Business Growth Tool access denied' });
      if (body.favorite) await sb('favorite_tools?on_conflict=member_access_id,prompt_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ member_access_id: memberId, prompt_id: body.prompt_id }) });
      else await sb(`favorite_tools?member_access_id=eq.${memberId}&prompt_id=eq.${encodeURIComponent(body.prompt_id)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
      return response(200, { success: true });
    }
    if (body.action === 'submit_feedback') {
      const rating = body.rating == null || body.rating === '' ? null : Number(body.rating);
      if (rating != null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) return response(400, { error: 'Rating must be between 1 and 5' });
      const type = ['suggestion','strategy_rating','issue'].includes(body.feedback_type) ? body.feedback_type : 'suggestion';
      const comments = String(body.comments || '').trim();
      if (!comments && rating == null) return response(400, { error: 'Add a rating or comment' });
      await sb('platform_feedback', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ member_access_id: memberId, page: String(body.page || 'dashboard').slice(0, 80), prompt_id: body.prompt_id || null, saved_output_id: body.saved_output_id || null, rating, feedback_type: type, comments: comments || null }) });
      return response(200, { success: true });
    }
    if (body.action === 'save_health') {
      const keys = ['marketing_score','sales_score','operations_score','networking_score','leadership_score','financial_readiness_score'];
      const scores = Object.fromEntries(keys.map((key) => [key, Number(body[key])]));
      if (keys.some((key) => !Number.isInteger(scores[key]) || scores[key] < 1 || scores[key] > 5)) return response(400, { error: 'All health scores must be between 1 and 5' });
      scores.overall_score = Number((keys.reduce((sum, key) => sum + scores[key], 0) / keys.length).toFixed(2));
      const saved = await sb('business_health_assessments', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ member_access_id: memberId, ...scores }) });
      return response(200, { health: saved?.[0] });
    }
    return response(400, { error: 'Unsupported action' });
  } catch (error) {
    console.error('member-workspace', { message: error.message, memberId, method: event.httpMethod });
    return response(500, { error: 'Unable to update the member workspace' });
  }
};
