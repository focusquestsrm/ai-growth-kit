# Architecture

## Boundaries

The D9Network AI Business Growth Platform is a static single-page member application backed by Netlify Functions and Supabase. The separate Intelligence Dashboard is administrative and is never exposed to ordinary members.

The browser handles presentation and guided data entry. Netlify Functions are the authorization boundary. Supabase stores membership access, roles, content, profiles, activity, saved strategies, favorites, assessments, feedback, imports, and audit events.

## Authorization

Authentication uses Supabase Auth access tokens. Functions validate tokens directly with Supabase and then perform one of two independent checks:

- Member access: one active `member_app_access` record matching normalized email or linked Auth user. The server supplies the authoritative tier rank.
- Administrative access: an active `platform_accounts` identity plus active `platform_role_assignments`. Staff require explicit permissions; executive viewers and partner administrators can enter only their specifically authorized read-only or partner scopes.

Membership tiers do not confer administrative privileges. A valid administrative role does not invent member eligibility. Multiple administrators and multiple roles per person are supported.

Temporary V1 Review Mode is an environment-gated access/session layer in front of these same authorization rules. A signed, expiring review token contains only the selected tier or Admin view. Functions resolve `REVIEW_MEMBER_ID` server-side and always use that fixed `member_app_access.id` as the owner; the browser cannot choose an owner ID. Member Review writes remain attached to the designated member, while Review Admin data-changing operations are disabled because Review Mode is not production authentication. Setting `REVIEW_MODE=false` returns immediately to the unchanged Supabase Auth path.

## Data model

- `membership_tiers`: Bronze through Platinum ranks and limits
- `member_app_access`: normalized Brilliant Directories eligibility records
- `platform_accounts`: master platform identity, account state, actual membership state, optional member link, and independent tier simulation
- `platform_role_assignments`: independently assigned roles and permission scopes
- `platform_invitations`: secure invitations without passwords
- `impersonation_sessions`: audited, read-only super-administrator testing sessions
- `user_roles`: legacy administrative assignments migrated by migration 006
- `prompt_categories`, `prompts`, `prompt_questions`: internal content engine for Business Growth Categories and Tools
- `business_profiles`: reusable member context
- `prompt_generations`: compact recent activity shown on the Dashboard
- `saved_strategies`: canonical Saved Strategies repository
- `saved_outputs`: legacy compatibility storage migrated into Saved Strategies
- `favorite_tools`: member shortcuts
- `assessment_versions`, `assessment_sections`, `assessment_questions`: versioned qualitative assessment configuration
- `assessment_responses`, `assessment_results`, `assessment_recommendations`: private member responses, priority results, and tier-aware recommendations
- `assessment_tool_mappings`: administrator-controlled section-to-tool recommendation rules
- `platform_feedback`: ratings, suggestions, and issue reports
- `import_batches`, `import_errors`, `audit_logs`: controlled administration and traceability

The internal `prompt_*` names are retained as stable schema identifiers. Member-facing language uses Business Growth Tool, AI Business Tools, Generate Strategy, Business Growth Recommendations, Saved Strategies, Business Growth Assessment, and recent activity.

Member-owned records use `member_access_id` to reference `member_app_access.id`: Business Profile, prompt/tool activity, Saved Strategies, favorites, feedback, onboarding, assessment responses/results/recommendations, and derived dashboard personalization. Entitlements are calculated separately from the effective tier rank. Review Mode changes only that request-scoped effective rank, so changing views cannot create a profile, replace an assessment, move strategies, or update the member's stored tier.

## Navigation and routes

Member navigation has five primary items: Dashboard, My Business, AI Business Tools, Opportunities, and Account. Nested desktop menus become mobile navigation sections. The SPA maps clean paths such as `/business/profile`, `/business/assessment`, `/strategies`, `/tools/:category`, and `/opportunities` back to the static application.

Members authenticate at `/login`; administrators authenticate at `/admin/login`. Administrative destinations use `/admin/*` and load a separate workspace. The member client never requests the admin API and does not expose an admin-view selector. Navigation visibility is derived from server-confirmed permissions, while every API independently enforces a concrete permission. An unauthorized admin URL is redirected to the member dashboard without administrative data.

The initial platform owner is bootstrapped only when the authenticated email matches the protected `PLATFORM_OWNER_EMAIL` setting. The configured first and last name are written to `platform_accounts`, and the role is written to `platform_role_assignments`. Password creation and reset remain entirely in Supabase Authentication.

## Member synchronization

CSV/XLSX files are parsed only by the protected import function. Eligibility requires normalized email, Brilliant Directories user ID, and a supported membership. Bronze II (Claim) and Ambassador are ignored. Duplicate normalized emails resolve to the highest supported tier. The review action is read-only; commit performs the upsert and audit writes.

The importer writes only membership eligibility and import/audit records. It cannot assign platform roles, alter internal accounts, update authentication, or turn non-member staff/test accounts into members. A future Intelligence Dashboard integration must resolve to the same `member_app_access`/`platform_accounts.member_access_id` identity boundary.

## Extensibility

The current model supports future modules without weakening access boundaries: Opportunity Center, Business Intelligence, Referral Network, Government Contracting, Partnership Discovery, Marketplace, AI Agents, and Executive Dashboard. These modules should consume authenticated server APIs and add their own explicit authorization rules.

## Security controls

- Supabase service credentials stay in Netlify Functions only.
- Data tables use row-level security and revoke direct browser access.
- Every administrative read and mutation is authorized server-side and administrative access is audited.
- View-as-user sessions are super-admin-only, persistent, audited, and read-only; authenticated passwords are never exposed.
- Member input is escaped before insertion into HTML.
- API responses use no-store, content-type, origin, and referrer headers.
- `.env` and secrets are excluded from version control.
