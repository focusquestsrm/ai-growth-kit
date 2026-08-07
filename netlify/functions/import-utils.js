const { ignoredMembership, normalizeEmail, normalizeMembership } = require('./_shared');

const COLUMN_ALIASES = {
  user_id: ['user_id', 'id'], email: ['email', 'user_email'],
  subscription_name: ['subscription_name', 'membership', 'membership_category'],
  first_name: ['first_name', 'first name', 'firstname'], last_name: ['last_name', 'last name', 'lastname'], company: ['company'], d9_affiliation: ['d9_affiliation'],
  active: ['active', 'is_active', 'status']
};

function normalizedRow(row) {
  const entries = Object.entries(row || {}).map(([key, value]) => [key.trim().toLowerCase(), value]);
  return Object.fromEntries(Object.entries(COLUMN_ALIASES).map(([field, aliases]) => {
    const item = entries.find(([key]) => aliases.includes(key));
    return [field, item ? item[1] : ''];
  }));
}

function processRows(rows) {
  const acceptedByEmail = new Map();
  const ignored = [], rejected = [], duplicates = [];
  rows.forEach((raw, index) => {
    const rowNumber = index + 2;
    const row = normalizedRow(raw);
    const bdUserId = String(row.user_id).trim();
    const email = normalizeEmail(row.email);
    const membership = String(row.subscription_name).trim();
    if (ignoredMembership(membership)) return ignored.push({ row: rowNumber, bd_user_id: bdUserId, email, membership });
    const tier = normalizeMembership(membership);
    if (!bdUserId || !email || !tier || !email.includes('@')) {
      return rejected.push({ row: rowNumber, bd_user_id: bdUserId, email, membership, reason: 'missing_or_unsupported_required_field' });
    }
    const activeValue = String(row.active ?? '').trim().toLowerCase();
    const sourceActive = !['0', 'false', 'no', 'inactive', 'disabled'].includes(activeValue);
    const record = {
      bd_user_id: bdUserId, email, normalized_email: email,
      first_name: String(row.first_name).trim() || null, last_name: String(row.last_name).trim() || null,
      company: String(row.company).trim() || null, d9_affiliation: String(row.d9_affiliation).trim() || null,
      source_subscription_name: membership, growth_kit_tier: tier[0], growth_kit_tier_rank: tier[1],
      access_enabled: sourceActive, source_active: sourceActive, source: 'brilliant_directories_upload', updated_at: new Date().toISOString()
    };
    const existing = acceptedByEmail.get(email);
    if (existing) {
      duplicates.push({ email, rows: [existing._row, rowNumber], kept_tier: existing.growth_kit_tier_rank >= tier[1] ? existing.growth_kit_tier : tier[0] });
      if (tier[1] > existing.growth_kit_tier_rank) acceptedByEmail.set(email, { ...record, _row: rowNumber });
    } else acceptedByEmail.set(email, { ...record, _row: rowNumber });
  });
  const accepted = [...acceptedByEmail.values()].map(({ _row, ...record }) => record);
  return { accepted, ignored, rejected, duplicates };
}

module.exports = { COLUMN_ALIASES, normalizedRow, processRows };
