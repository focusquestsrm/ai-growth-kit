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
   - `007_business_profile_experience.sql`
   - `008_visual_growth_experience.sql`
   - `009_platform_admin_member_experience.sql`
5. Run `npm run dev` for the Netlify development server.

Required server environment variables:

```text
SUPABASE_URL
SUPABASE_ANON_KEY (or SUPABASE_PUBLISHABLE_KEY)
SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY)
APP_BASE_URL
INITIAL_PLATFORM_ADMIN_EMAIL
```

The service-role/secret key is server-only and is not the same credential as the anon/publishable key.

### Invitation redirects

`APP_BASE_URL` is the single server-side application URL used to build invitation callbacks. Set it to `https://ai-growth-kit.netlify.app` in Netlify's production context. Local development may use `http://localhost:3000`; never use a localhost value in production. Invitations are sent to `/auth/callback`, where the SPA removes the Supabase session fragment from the address bar, validates the session, lets the invited user choose a password, and then continues to the appropriate member or administration page.

In Supabase, open **Authentication > URL Configuration** and set:

```text
Site URL: https://ai-growth-kit.netlify.app
Additional Redirect URLs:
https://ai-growth-kit.netlify.app/**
http://localhost:3000/**
```

The localhost redirect is for development only. In **Authentication > Email Templates > Invite user**, keep the invitation link based on `{{ .ConfirmationURL }}`. That generated URL carries the `redirect_to` supplied by the server. If a custom link is used, it must preserve `{{ .RedirectTo }}`; do not replace it with a hard-coded `{{ .SiteURL }}`. Password-reset and confirmation templates do not need to change.

## Access model

Member eligibility is matched by normalized email, Brilliant Directories `user_id`, and supported membership. Supported memberships are Bronze, Silver, Gold, and Platinum. `Bronze II (Claim)` and `Ambassador` records are ignored. Tool availability is determined on the server by membership rank.

Administrative access is assigned separately from Brilliant Directories membership. The canonical roles are `platform_admin`, `content_admin`, `data_admin`, and `member`. Only `platform_admin` automatically receives access to the member experience; content and data administrators still need a supported active membership.

Members sign in at `/login`. Authorized administrators can open `/platform` or `/admin/login`. Configure `INITIAL_PLATFORM_ADMIN_EMAIL` as a protected, server-only environment variable and create that identity through Supabase Authentication. On the first successful sign-in by the exact email, the server idempotently assigns and audits `platform_admin`; no password or administrator email is shipped to the browser. Apply migration `009_platform_admin_member_experience.sql` before testing Member View. Platform preview tiers are request-scoped and never change membership or role records.

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

Netlify publishes `public/` and exposes functions from `netlify/functions/`. API routes are mapped from `/api/*` before the single-page application fallback. Configure the required environment variables in Netlify for the relevant deploy contexts, including production `APP_BASE_URL=https://ai-growth-kit.netlify.app`, then redeploy. Supabase secret/service-role values remain function-only and must never be prefixed or otherwise exposed to browser code.

See [PRODUCT_VISION.md](PRODUCT_VISION.md) for the roadmap and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for technical boundaries.

The proposed Intelligence Dashboard shared-member integration is documented in [docs/SHARED_MEMBER_DATA_DESIGN.md](docs/SHARED_MEMBER_DATA_DESIGN.md). It is intentionally awaiting approval before implementation.
