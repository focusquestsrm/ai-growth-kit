const required = ['SUPABASE_URL', 'APP_BASE_URL', 'INITIAL_PLATFORM_ADMIN_EMAIL'];
const missing = required.filter((key) => !process.env[key]);
if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_SECRET_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY');
if (!process.env.SUPABASE_ANON_KEY && !process.env.SUPABASE_PUBLISHABLE_KEY) missing.push('SUPABASE_ANON_KEY or SUPABASE_PUBLISHABLE_KEY');
if (missing.length) {
  console.error(`Missing environment variables: ${missing.join(', ')}`);
  process.exit(1);
}
console.log('Configuration looks valid.');
