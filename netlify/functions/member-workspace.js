const { parseJson, preflight, requireMember, response, sb } = require('./_shared');

exports.handler = async (event) => {
  const pf = preflight(event, ['GET', 'POST', 'DELETE']);
  if (pf) return pf;
  const access = await requireMember(event);
  if (!access) return response(403, { error: 'Member access required' });
  const memberId = access.member.id;
  try {
    if (event.httpMethod === 'GET') {
      const [profile, outputs, generations] = await Promise.all([
        sb(`business_profiles?member_access_id=eq.${memberId}&select=*`),
        sb(`saved_outputs?member_access_id=eq.${memberId}&select=id,title,output_text,input_payload,created_at,prompts(title,slug)&order=created_at.desc&limit=100`),
        sb(`prompt_generations?member_access_id=eq.${memberId}&select=id,status,created_at,prompts(title,slug,prompt_categories(name))&order=created_at.desc&limit=20`)
      ]);
      return response(200, { profile: profile?.[0] || null, outputs: outputs || [], generations: generations || [] });
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
      const allowed = ['business_name','website','industry','audience','products_services','brand_voice','primary_goal'];
      const profile = Object.fromEntries(allowed.map((key) => [key, String(input[key] || '').trim() || null]));
      profile.member_access_id = memberId; profile.updated_at = new Date().toISOString();
      const saved = await sb('business_profiles?on_conflict=member_access_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(profile) });
      return response(200, { profile: saved?.[0] });
    }
    if (body.action === 'delete_output') {
      await sb(`saved_outputs?id=eq.${encodeURIComponent(body.id)}&member_access_id=eq.${memberId}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
      return response(200, { success: true });
    }
    return response(400, { error: 'Unsupported action' });
  } catch (error) {
    console.error('member-workspace', { message: error.message, memberId, method: event.httpMethod });
    return response(500, { error: 'Unable to update the member workspace' });
  }
};
