(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.D9PromptEngine = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const HEADER = 'Use the following reviewed business profile as context. Do not claim an action was taken or an outcome achieved unless the member explicitly provides evidence.';
  const ASSUMPTIONS = 'Base recommendations on the information provided. If important information is missing, identify the assumption rather than inventing facts.';
  const DEFAULT_CONTEXT_FIELDS = ['business_name', 'industry', 'business_stage', 'business_description', 'services', 'target_market', 'ideal_customer', 'business_goals', 'primary_business_challenges'];
  const LABELS = {
    business_name: 'Business', industry: 'Industry', business_stage: 'Business Stage', years_in_business: 'Years in Business',
    business_description: 'Business Description', products: 'Products', services: 'Services', target_market: 'Target Market',
    ideal_customer: 'Ideal Customers', business_goals: 'Business Goals', geographic_market: 'Geographic Market',
    primary_markets_served: 'Primary Markets Served', markets_to_enter: 'Markets You Want to Enter',
    primary_business_challenges: 'Primary Business Challenges', business_certifications: 'Business Certifications',
    website: 'Website', assessment_priorities: 'Assessment Growth Priorities'
  };
  const LIST_CONTEXT_FIELDS = new Set(['products', 'services', 'primary_markets_served', 'markets_to_enter', 'primary_business_challenges', 'business_certifications', 'assessment_priorities']);

  function meaningful(value) {
    if (Array.isArray(value)) return value.map((item) => String(item ?? '').trim()).filter((item) => item && !/^(none|null|undefined)$/i.test(item));
    const text = String(value ?? '').trim();
    return text && !/^(none|null|undefined)$/i.test(text) ? text : '';
  }
  function valueText(value) { return Array.isArray(value) ? value.join(', ') : String(value ?? '').trim(); }
  function block(label, value) {
    const clean = meaningful(value);
    if (!clean || (Array.isArray(clean) && !clean.length)) return '';
    const lines = Array.isArray(clean) ? clean : String(clean).split(/\r?\n|;/).map((item) => item.trim()).filter(Boolean);
    return Array.isArray(clean) || lines.length > 1 ? `${label}:\n${lines.map((item) => `- ${item}`).join('\n')}` : `${label}:\n${clean}`;
  }
  function contextValue(field, value) {
    const clean = meaningful(value);
    if (!LIST_CONTEXT_FIELDS.has(field) || Array.isArray(clean) || !clean) return clean;
    const items = String(clean).split(/\r?\n|;|,/).map((item) => item.trim()).filter(Boolean);
    return items.length > 1 ? items : clean;
  }
  function contextSnapshot(tool, profile = {}, overrides = {}, assessmentPriorities = []) {
    const fields = Array.isArray(tool.context_fields) && tool.context_fields.length ? tool.context_fields : DEFAULT_CONTEXT_FIELDS;
    return Object.fromEntries(fields.map((field) => {
      const value = Object.prototype.hasOwnProperty.call(overrides, field) ? overrides[field] : (field === 'assessment_priorities' ? assessmentPriorities : profile[field]);
      return [field, contextValue(field, value)];
    }).filter(([, value]) => value && (!Array.isArray(value) || value.length)));
  }
  function formatBusinessContext(snapshot) { return Object.entries(snapshot).map(([key, value]) => block(LABELS[key] || key.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()), value)).filter(Boolean).join('\n\n'); }
  function inputSnapshot(schema = [], answers = {}) {
    return Object.fromEntries(schema.map((field) => [field.key, meaningful(answers[field.key])]).filter(([, value]) => value && (!Array.isArray(value) || value.length)));
  }
  function formatToolInputs(schema, snapshot) {
    return schema.map((field) => block(field.label || field.key.replaceAll('_', ' '), snapshot[field.key])).filter(Boolean).join('\n\n');
  }
  function resolveVariables(template, values) {
    return String(template || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => valueText(values[key]) || 'not provided').trim();
  }
  function assemble({ tool, profile = {}, overrides = {}, assessmentPriorities = [], answers = {}, schema = [] }) {
    const businessContext = contextSnapshot(tool, profile, overrides, assessmentPriorities);
    const toolInputs = inputSnapshot(schema, answers);
    const values = { ...profile, ...businessContext, ...toolInputs };
    const task = resolveVariables(tool.task_template || tool.user_prompt_template || `Create a practical ${tool.title || 'business output'} using the context and inputs above.`, values);
    const requiredOutput = resolveVariables(tool.required_output || tool.output_format || 'Provide a concise summary, prioritized recommendations, practical next actions, assumptions, and measures.', values);
    const guardrails = resolveVariables(tool.guardrails || 'Clearly distinguish recommendations, targets, assumptions, and verified results. Do not invent facts, evidence, financial projections, or completed outcomes.', values);
    const sections = [
      HEADER, ASSUMPTIONS,
      `BUSINESS CONTEXT\n\n${formatBusinessContext(businessContext) || 'No relevant saved context was provided.'}`,
      `TOOL-SPECIFIC INPUTS\n\n${formatToolInputs(schema, toolInputs) || 'No additional tool-specific inputs were provided.'}`,
      `TASK\n\n${task}`,
      `REQUIRED OUTPUT\n\n${requiredOutput}`,
      `GUARDRAILS\n\n${guardrails}`
    ];
    const text = sections.join('\n\n');
    return { text, businessContext, toolInputs, version: String(tool.prompt_version || '1.0') };
  }

  return { ASSUMPTIONS, DEFAULT_CONTEXT_FIELDS, HEADER, LABELS, assemble, contextSnapshot, formatBusinessContext, formatToolInputs, meaningful, resolveVariables };
}));
