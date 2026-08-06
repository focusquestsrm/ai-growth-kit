# D9Network AI Business Growth Kit

A white-labeled, tier-aware prompt workspace for D9Network members, with a separate role-protected administration console. Membership tier controls prompt access; administrative roles control administration. Ordinary members never receive administrative access.

## Features

- Supabase email/password authentication and one-time member-record verification
- Server-side prompt access for Bronze, Silver, Gold, and Platinum members
- Responsive prompt library, saved prompts, guided prompt builder, and session history
- Database-backed prompt and category management with draft/published workflow
- Multiple administrators with data, content, platform, or organization-leader roles
- Brilliant Directories CSV/XLSX preview and commit workflow
- Email normalization, excluded-plan handling, duplicate reporting, and highest-tier resolution
- Import and role/content audit events

`Bronze II (Claim)` and `Ambassador` records are ignored during synchronization. Admin roles are assigned separately and never inferred from membership tier.

## Windows setup

```powershell
cd C:\Users\danie
git clone https://github.com/focusquestsrm/ai-growth-kit.git
cd ai-growth-kit
npm install
Copy-Item .env.example .env
```

Fill in `.env` with values from Supabase. The service-role key is used only by server-side Netlify Functions and must never be placed in browser code or committed.

```dotenv
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
APP_BASE_URL=http://localhost:8888
```

Apply both SQL migrations in order using the Supabase CLI or SQL editor:

1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_security_seed.sql`

Create Supabase Auth users for members who will sign in. Imports provision eligibility records; they do not create passwords.

Bootstrap the first platform administrator after creating their Auth user:

```sql
insert into user_roles(email, normalized_email, auth_user_id, role, organization_id)
values ('admin@example.com', 'admin@example.com', 'SUPABASE_AUTH_USER_UUID', 'platform_admin', 'd9network');
```

Additional administrators can then be assigned from the admin console.

## Run and verify

```powershell
npm run dev
npm test
npm run build
```

Local development is available at `http://localhost:8888` through Netlify Dev.

## API routes

- `POST /api/auth-session` — Supabase password or refresh-token exchange
- `POST /api/member-eligibility` — authenticated email, BD user ID, and tier verification
- `GET /api/prompts-list` — authenticated, server-filtered published prompt catalog
- `GET|POST /api/admin-console` — role-protected content, category, and role operations
- `POST /api/admin-member-import` — role-protected CSV/XLSX preview and commit

All member and admin routes use a Supabase access token. Direct browser access to application tables is revoked; server functions use the service-role key after authenticating and authorizing each request.

## Member import format

The first worksheet or CSV must contain `user_id`, `email`, and `subscription_name`. Optional fields are `first_name`, `last_name`, `company`, and `d9_affiliation`. Aliases documented in the importer are accepted for the required columns.

Files are limited to CSV/XLSX, 5 MB, and 10,000 data rows. Preview is required in the UI before commit. Duplicate normalized emails are reported, and the highest supported membership tier is retained.

## Security notes

- Never commit `.env`; it is ignored by Git.
- Generic authentication and membership failures avoid leaking member records.
- Membership verification is rate-limited per client instance.
- UI visibility is not an authorization control; every protected API performs server-side checks.
- Membership tier never grants an administrative role.
- This application contains no member route to the separate Intelligence Dashboard.
