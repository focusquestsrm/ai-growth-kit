const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateAssessment } = require('../netlify/functions/assessment');

const sections = [
  { id:'brand', title:'Brand and Market Position', display_order:10 },
  { id:'marketing', title:'Marketing', display_order:20 },
  { id:'leadership', title:'Leadership and Growth Planning', display_order:30 }
];
const questions = sections.flatMap((section) => [1,2,3,4].map((n) => ({ id:`${section.id}-${n}`, section_id:section.id })));
const mappings = [
  { section_id:'brand', priority:10, prompts:{ id:'bronze-brand', title:'Business Profile Enhancer', slug:'business-profile-enhancer', minimum_tier_rank:1, prompt_categories:{name:'Profile & Branding'} } },
  { section_id:'brand', priority:20, prompts:{ id:'silver-brand', title:'Professional Business Bio', slug:'professional-business-bio', minimum_tier_rank:2, prompt_categories:{name:'Profile & Branding'} } },
  { section_id:'marketing', priority:10, prompts:{ id:'silver-marketing', title:'7-Day Content Calendar', slug:'seven-day-content-calendar', minimum_tier_rank:2, prompt_categories:{name:'Marketing & Content'} } },
  { section_id:'leadership', priority:10, prompts:{ id:'platinum-growth', title:'Growth Roadmap', slug:'growth-roadmap', minimum_tier_rank:4, prompt_categories:{name:'Leadership & Growth'} } },
  { section_id:'leadership', priority:20, prompts:{ id:'bronze-swot', title:'Basic SWOT Analysis', slug:'basic-swot-analysis', minimum_tier_rank:1, prompt_categories:{name:'Strategy & Operations'} } }
];

test('assessment completion identifies strengths and ranks improvement areas', () => {
  const answers = Object.fromEntries(questions.map((q) => [q.id, q.section_id === 'brand' ? 'yes' : q.section_id === 'marketing' ? 'partially' : 'no']));
  const result = calculateAssessment(sections, questions, mappings, answers, 1);
  assert.deepEqual(result.strengths, ['Brand and Market Position']);
  assert.deepEqual(result.priorities.slice(0,2), ['Leadership and Growth Planning','Marketing']);
  assert.equal(result.actions30.length, 2);
  assert.equal(result.actions90.length, 2);
});

test('recommendations respect membership and mark protected tools as locked', () => {
  const answers = Object.fromEntries(questions.map((q) => [q.id, 'no']));
  const bronze = calculateAssessment(sections, questions, mappings, answers, 1);
  const locked = bronze.recommendations.find((item) => item.prompt_id === 'platinum-growth');
  assert.equal(locked.is_locked, true);
  assert.equal(locked.required_tier_rank, 4);
  assert.equal(locked.alternative_title, 'Basic SWOT Analysis');
  const platinum = calculateAssessment(sections, questions, mappings, answers, 4);
  assert.equal(platinum.recommendations.find((item) => item.prompt_id === 'platinum-growth').is_locked, false);
});
