# The D9Network AI Business Growth Platform

The D9Network AI Business Growth Platform is a secure, member-facing SaaS application that turns guided business inputs and a reusable Business Profile into practical growth recommendations. It is separate from the D9Network Intelligence Dashboard; regular members cannot access that administrative product.

## Included capabilities

- Personalized member dashboard with assessment status, priorities, recommendations, recent work, and next actions
- Tier-controlled Business Growth Library for Bronze, Silver, Gold, and Platinum members
- Expanded Business Profile reused automatically by every Business Growth Tool
- Saved Strategies with copy, duplicate, export, and delete actions
- Favorite tools, compact dashboard activity, member feedback, and the qualitative Business Growth Assessment
- Five-item grouped member navigation and a completely separate role-specific administration workspace
- Opportunity Center roadmap for contracts, partnerships, supplier diversity, grants, and speaking opportunities
- Role-protected admin console for tools, categories, administrators, members, usage, imports, and feedback
- CSV/XLSX Brilliant Directories synchronization with validation and audit reporting
- Server-side membership authorization and Supabase authentication

## Local setup

1. Install Node.js 20 or later.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and provide your own values. Never commit `.env`.
4. Apply the Supabase migrations in numeric order through the Supabase SQL Editor:
   - `001_initial_schema.sql`
   - `002_security_seed.sql`
   - `003_complete_growth_kit.sql`
   - `004_business_growth_platform.sql`
   - `005_business_growth_assessment.sql`
   - `006_identity_administration.sql`
5. Run `npm run dev` for the Netlify development server.

Required server environment variables:

```text
SUPABASE_URL
SUPABASE_ANON_KEY (or SUPABASE_PUBLISHABLE_KEY)
SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY)
APP_BASE_URL
PLATFORM_OWNER_EMAIL
PLATFORM_OWNER_FIRST_NAME
PLATFORM_OWNER_LAST_NAME
```

The service-role/secret key is server-only and is not the same credential as the anon/publishable key.

## Access model

Member eligibility is matched by normalized email, Brilliant Directories `user_id`, and supported membership. Supported memberships are Bronze, Silver, Gold, and Platinum. `Bronze II (Claim)` and `Ambassador` records are ignored. Tool availability is determined on the server by membership rank.

Administrative access is assigned separately through `platform_accounts` and `platform_role_assignments`. The supported platform roles are `super_admin`, `admin`, `staff`, `executive_viewer`, `member`, `partner_admin`, `tester`, and `read_only`. Staff access requires explicit permission keys. Membership status and simulated tier are separate fields; simulation never changes a real membership record.

Members sign in at `/login`. Authorized administrators sign in at `/admin/login`. Configure the three `PLATFORM_OWNER_*` values as protected environment variables, invite the platform owner through Supabase Authentication, and sign in once at `/admin/login`. That first authenticated sign-in creates the active internal `super_admin` account and stores the configured name in the database. No password is stored in source or environment configuration.

## Member synchronization

Administrators upload CSV or XLSX exports through Member Synchronization. Files are limited to 5 MB and 10,000 data rows. The review step performs no database writes. Commit upserts eligible members, captures ignored/rejected/duplicate details, and records an audit trail. Duplicate normalized emails retain the highest eligible tier.

## Checks

```bash
npm test
npm run build
npm run check
```

`npm run check` validates configuration names without displaying secret values.

## Deployment

Netlify publishes `public/` and exposes functions from `netlify/functions/`. API routes are mapped from `/api/*` before the single-page application fallback. Configure all four environment variables in Netlify for the relevant deploy contexts, then redeploy.

See [PRODUCT_VISION.md](PRODUCT_VISION.md) for the roadmap and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for technical boundaries.

The proposed Intelligence Dashboard shared-member integration is documented in [docs/SHARED_MEMBER_DATA_DESIGN.md](docs/SHARED_MEMBER_DATA_DESIGN.md). It is intentionally awaiting approval before implementation.
