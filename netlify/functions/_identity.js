const INVALID_FIRST_NAMES = new Set(['your', 'user', 'null', 'undefined']);

function validFirstName(value) {
  const name = String(value ?? '').trim();
  if (!name || INVALID_FIRST_NAMES.has(name.toLowerCase())) return '';
  return name;
}

function firstNameFromFullName(value) {
  const fullName = String(value ?? '').trim();
  return fullName ? validFirstName(fullName.split(/\s+/)[0]) : '';
}

function resolveFirstName(profile = {}, user = {}) {
  const metadata = user.user_metadata || user.metadata || {};
  return validFirstName(profile.first_name)
    || validFirstName(metadata.first_name)
    || firstNameFromFullName(profile.full_name)
    || firstNameFromFullName(metadata.full_name || user.full_name);
}

module.exports = { INVALID_FIRST_NAMES, firstNameFromFullName, resolveFirstName, validFirstName };
