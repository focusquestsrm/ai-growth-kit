const { parseJson, preflight, requireMember, requireRoles, response, sb } = require('./_shared');

const VALID_ANSWERS = ['yes', 'partially', 'no', 'not_applicable'];
const ANSWER_WEIGHT = { yes: 0, partially: 1, no: 2, not_applicable: 0 };

function calculateAssessment(sections, questions, mappings, answers, memberRank) {
  const bySection = new Map(sections.map((section) => [section.id, { ...section, strength: 0, improvement: 0, answered: 0 }]));
  questions.forEach((question) => {
    const answer = answers[question.id];
    const section = bySection.get(question.section_id);
    if (!section || !VALID_ANSWERS.includes(answer) || answer === 'not_applicable') return;
    section.answered += 1;
    if (answer === 'yes') section.strength += 1;
    else section.improvement += ANSWER_WEIGHT[answer];
  });
  const ranked = [...bySection.values()].filter((section) => section.answered).sort((a,b) => b.improvement - a.improvement || a.display_order - b.display_order);
  const priorities = ranked.filter((section) => section.improvement > 0).slice(0,3);
  const strengths = ranked.filter((section) => section.strength >= Math.max(2, section.answered - 1)).map((section) => section.title);
  const improvementAreas = ranked.filter((section) => section.improvement > 0).map((section) => section.title);
  const recommendations = [];
  priorities.forEach((section, sectionIndex) => {
    const candidates = mappings.filter((mapping) => mapping.section_id === section.id).sort((a,b) => a.priority - b.priority);
    const accessible = candidates.find((mapping) => Number(mapping.prompts.minimum_tier_rank) <= Number(memberRank));
    candidates.slice(0,3).forEach((mapping) => {
      if (recommendations.some((item) => item.prompt_id === mapping.prompts.id)) return;
      const locked = Number(mapping.prompts.minimum_tier_rank) > Number(memberRank);
      recommendations.push({ prompt_id: mapping.prompts.id, title: mapping.prompts.title, slug: mapping.prompts.slug, category: mapping.prompts.prompt_categories?.name || '', required_tier_rank: mapping.prompts.minimum_tier_rank, is_locked: locked, alternative_prompt_id: locked ? accessible?.prompts.id || null : null, alternative_title: locked ? accessible?.prompts.title || null : null, priority: sectionIndex + 1, reason: `Supports ${section.title}` });
    });
  });
  const priorityTitles = priorities.map((section) => section.title);
  return {
    strengths: strengths.length ? strengths : ['Assessment completed with clear areas to build on'],
    improvementAreas,
    priorities: priorityTitles,
    recommendations,
    actions30: priorityTitles.map((title) => `Choose one practical action to strengthen ${title} and assign an owner.`),
    actions90: priorityTitles.map((title) => `Review evidence of action taken in ${title} and document the outcome achieved.`),
    futureAgents: priorityTitles.map((title) => `${title} Agent for ongoing monitoring and recommendations`)
  };
}

async function assessmentDefinition() {
  const versions = await sb('assessment_versions?is_active=eq.true&select=id,version_label,title,description&order=created_at.desc&limit=1');
  const version = versions?.[0];
  if (!version) return null;
  const sections = await sb(`assessment_sections?version_id=eq.${version.id}&is_active=eq.true&select=id,slug,title,description,display_order&order=display_order.asc`);
  const ids = (sections || []).map((section) => section.id);
  const questions = ids.length ? await sb(`assessment_questions?section_id=in.(${ids.join(',')})&is_active=eq.true&select=id,section_id,question_text,answer_type,display_order&order=display_order.asc`) : [];
  const mappings = ids.length ? await sb(`assessment_tool_mappings?section_id=in.(${ids.join(',')})&is_active=eq.true&select=section_id,priority,prompts(id,title,slug,minimum_tier_rank,prompt_categories(name))&order=priority.asc`) : [];
  return { version, sections: sections || [], questions: questions || [], mappings: mappings || [] };
}

exports.handler = async (event) => {
  const pf = preflight(event, ['GET','POST']);
  if (pf) return pf;
  let access = await requireMember(event);
  let platformPreview = false;
  if (!access) {
    const platform = await requireRoles(event, ['platform_admin']);
    if (!platform) return response(403, { error: 'Member access required' });
    platformPreview = true;
    access = { member: { id:null, growth_kit_tier_rank:4 } };
  }
  try {
    const definition = await assessmentDefinition();
    if (!definition) return response(404, { error: 'No active assessment is available' });
    if (event.httpMethod === 'GET') {
      const responses = platformPreview ? [] : await sb(`assessment_responses?member_access_id=eq.${access.member.id}&version_id=eq.${definition.version.id}&select=id,answers,completed_at&order=completed_at.desc&limit=1`);
      let latest = null;
      if (responses?.[0]) {
        const results = await sb(`assessment_results?response_id=eq.${responses[0].id}&select=*`);
        const recommendations = await sb(`assessment_recommendations?response_id=eq.${responses[0].id}&select=priority,is_locked,required_tier_rank,reason,prompts!assessment_recommendations_prompt_id_fkey(id,title,slug,prompt_categories(name)),alternative:prompts!assessment_recommendations_alternative_prompt_id_fkey(id,title,slug)&order=priority.asc`);
        latest = { response: responses[0], result: results?.[0] || null, recommendations: recommendations || [] };
      }
      return response(200, { ...definition, mappings: undefined, latest });
    }
    const body = parseJson(event);
    if (body?.action !== 'complete') return response(400, { error: 'Unsupported assessment action' });
    const answers = body.answers || {};
    const missing = definition.questions.filter((question) => !VALID_ANSWERS.includes(answers[question.id]));
    if (missing.length) return response(400, { error: 'Answer every assessment question before completing the assessment' });
    const previewRank = Math.min(4,Math.max(1,Number(body.preview_tier_rank)||4));
    const calculated = calculateAssessment(definition.sections, definition.questions, definition.mappings, answers, platformPreview ? previewRank : access.member.growth_kit_tier_rank);
    if (platformPreview) return response(200, { completed_at:new Date().toISOString(), preview:true, result:calculated });
    const created = await sb('assessment_responses', { method:'POST', headers:{ Prefer:'return=representation' }, body:JSON.stringify({ member_access_id:access.member.id, version_id:definition.version.id, answers }) });
    const responseId = created?.[0]?.id;
    await sb('assessment_results', { method:'POST', headers:{ Prefer:'return=minimal' }, body:JSON.stringify({ response_id:responseId, identified_strengths:calculated.strengths, improvement_areas:calculated.improvementAreas, priority_ranking:calculated.priorities, actions_30_day:calculated.actions30, actions_90_day:calculated.actions90, future_agent_recommendations:calculated.futureAgents }) });
    if (calculated.recommendations.length) await sb('assessment_recommendations', { method:'POST', headers:{ Prefer:'return=minimal' }, body:JSON.stringify(calculated.recommendations.map((item) => ({ response_id:responseId, prompt_id:item.prompt_id, priority:item.priority, is_locked:item.is_locked, required_tier_rank:item.required_tier_rank, alternative_prompt_id:item.alternative_prompt_id, reason:item.reason }))) });
    return response(200, { completed_at:created?.[0]?.completed_at, result:calculated });
  } catch (error) {
    console.error('assessment', { message:error.message, memberId:access.member.id });
    return response(500, { error: 'Unable to load or complete the Business Growth Assessment' });
  }
};

exports.calculateAssessment = calculateAssessment;
exports.VALID_ANSWERS = VALID_ANSWERS;
