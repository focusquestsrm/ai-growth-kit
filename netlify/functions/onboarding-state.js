const { canUseMemberExperience, parseJson, preflight, response, sb } = require('./_shared');

const EMPTY = Object.freeze({
  tour_started:false, tour_completed:false, tour_skipped:false,
  tour_started_at:null, tour_completed_at:null, tour_skipped_at:null,
  profile_completed_at:null, assessment_completed_at:null,
  recommendations_reviewed_at:null, first_tool_used_at:null,
  first_strategy_saved_at:null, checklist_acknowledged_at:null
});

exports.handler = async (event) => {
  const pf = preflight(event, ['GET','POST']);
  if (pf) return pf;
  const access = await canUseMemberExperience(event);
  if (!access.allowed) return response(access.statusCode, { error:access.error });
  const ownerFilter = `${access.ownerColumn}=eq.${encodeURIComponent(access.ownerId)}`;
  const ownerPayload = { [access.ownerColumn]:access.ownerId };
  try {
    const rows = await sb(`member_onboarding?${ownerFilter}&select=*`);
    const current = rows?.[0] || null;
    if (event.httpMethod === 'GET') return response(200, { onboarding:{ ...EMPTY, ...(current || {}) }, is_new:!current });
    const body = parseJson(event);
    const now = new Date().toISOString(), changes = { updated_at:now };
    if (body?.action === 'start_tour') Object.assign(changes, { tour_started:true, tour_skipped:false, tour_started_at:current?.tour_started_at || now });
    else if (body?.action === 'skip_tour') Object.assign(changes, { tour_skipped:true, tour_skipped_at:now });
    else if (body?.action === 'complete_tour') Object.assign(changes, { tour_started:true, tour_completed:true, tour_skipped:false, tour_started_at:current?.tour_started_at || now, tour_completed_at:current?.tour_completed_at || now });
    else if (body?.action === 'acknowledge_checklist') changes.checklist_acknowledged_at = current?.checklist_acknowledged_at || now;
    else if (body?.action === 'review_recommendations') changes.recommendations_reviewed_at = current?.recommendations_reviewed_at || now;
    else if (body?.action === 'sync_milestones') {
      const milestones = {
        profile_complete:'profile_completed_at', assessment_complete:'assessment_completed_at',
        recommendations_reviewed:'recommendations_reviewed_at', first_tool_used:'first_tool_used_at',
        first_strategy_saved:'first_strategy_saved_at'
      };
      Object.entries(milestones).forEach(([key,column]) => { if (body[key] && !current?.[column]) changes[column] = now; });
    } else return response(400, { error:'Unsupported onboarding action' });
    const saved = current
      ? await sb(`member_onboarding?id=eq.${current.id}`, { method:'PATCH', headers:{ Prefer:'return=representation' }, body:JSON.stringify(changes) })
      : await sb('member_onboarding', { method:'POST', headers:{ Prefer:'return=representation' }, body:JSON.stringify({ ...ownerPayload, ...EMPTY, ...changes }) });
    return response(200, { onboarding:{ ...EMPTY, ...(saved?.[0] || current || changes) } });
  } catch (error) {
    console.error('onboarding-state', { message:error.message, ownerId:access.ownerId });
    return response(503, { error:'Onboarding setup is not available yet' });
  }
};

exports.EMPTY = EMPTY;
