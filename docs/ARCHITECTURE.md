# Architecture

## Boundaries

The D9Network AI Business Growth Platform is a static single-page member application backed by Netlify Functions and Supabase. The separate Intelligence Dashboard is administrative and is never exposed to ordinary members.

The browser handles presentation and guided data entry. Netlify Functions are the authorization boundary. Supabase stores membership access, roles, content, profiles, activity, saved strategies, favorites, assessments, feedback, imports, and audit events.

## Authorization

Authentication uses Supabase Auth access tokens. Functions validate tokens directly with Supabase and then perform one of two independent checks:

- Member access: one active `member_app_access` record matching normalized email or linked Auth user. The server supplies the authoritative tier rank.
- Administrative access: one or more allowed `user_roles` records matching normalized email or linked Auth user.

Membership tiers do not confer administrative privileges. A valid administrative role does not invent member eligibility. Multiple administrators and multiple roles per person are supported.

## Data model

- `membership_tiers`: Bronze through Platinum ranks and limits
- `member_app_access`: normalized Brilliant Directories eligibility records
- `user_roles`: independently assigned administrative roles
- `prompt_categories`, `prompts`, `prompt_questions`: internal content engine for Business Growth Categories and Tools
- `business_profiles`: reusable member context
- `prompt_generations`: Growth Activity
- `saved_outputs`: Saved Strategies
- `favorite_tools`: member shortcuts
- `business_health_assessments`: six-area snapshots and overall score
- `platform_feedback`: ratings, suggestions, and issue reports
- `import_batches`, `import_errors`, `audit_logs`: controlled administration and traceability

The internal `prompt_*` names are retained as stable schema identifiers. Member-facing language uses Business Growth Tool, Business Growth Library, Generate Strategy, Business Growth Recommendations, Saved Strategies, and Growth Activity.

## Member synchronization

CSV/XLSX files are parsed only by the protected import function. Eligibility requires normalized email, Brilliant Directories user ID, and a supported membership. Bronze II (Claim) and Ambassador are ignored. Duplicate normalized emails resolve to the highest supported tier. The review action is read-only; commit performs the upsert and audit writes.

## Extensibility

The current model supports future modules without weakening access boundaries: Opportunity Center, Business Intelligence, Referral Network, Government Contracting, Partnership Discovery, Marketplace, AI Agents, and Executive Dashboard. These modules should consume authenticated server APIs and add their own explicit authorization rules.

## Security controls

- Supabase service credentials stay in Netlify Functions only.
- Data tables use row-level security and revoke direct browser access.
- Every content, member, import, role, and feedback mutation is authorized server-side.
- Member input is escaped before insertion into HTML.
- API responses use no-store, content-type, origin, and referrer headers.
- `.env` and secrets are excluded from version control.
