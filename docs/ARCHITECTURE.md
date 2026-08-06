# Architecture

## Experiences

- **AI Growth Kit:** eligible Bronze, Silver, Gold, and Platinum members.
- **Intelligence Dashboard:** organization leaders and authorized administrators only.
- **Admin Console:** authorized data, content, and platform administrators.

All experiences may share one Supabase project, but route access and API authorization are separate.

## Data flow

1. Tina exports members from Brilliant Directories.
2. Tina uploads CSV/XLSX through the leader/admin workflow.
3. The importer validates and normalizes rows.
4. `Bronze II (Claim)` and `Ambassador` are ignored.
5. Bronze, Silver, Gold, and Platinum records are upserted into `member_app_access`.
6. A member verifies with email, Brilliant Directories user ID, and membership.
7. The server grants a session and returns only prompts within the member's tier.

## Authorization rule

- `membership_tier_rank` controls prompt access.
- `user_roles` controls admin and leader access.
- A high membership tier never grants administrative privileges.

## Runtime boundaries

The static member application authenticates through `auth-session`, which exchanges credentials with Supabase Auth. It stores the short-lived access token in session storage and sends it as a bearer token. Netlify Functions validate the token with Supabase Auth before using the service-role key for database access.

Member verification binds the authenticated user to a single `member_app_access` record after email, Brilliant Directories user ID, membership tier, and enabled status match. `prompts-list` ignores client-supplied tiers and filters published prompts using the synchronized tier rank.

The admin console independently queries `user_roles`. Supported administrative roles are `organization_leader`, `data_admin`, `content_admin`, and `platform_admin`; multiple assignments and multiple administrators are supported. Platform administrators manage role assignments. Data administrators synchronize members. Content administrators manage prompts and categories.

Direct `anon` and `authenticated` access to application tables is revoked. The service-role key exists only in the server environment.

## Import behavior

The upload endpoint accepts CSV and XLSX files up to 5 MB and 10,000 rows. It validates the extension, MIME type, required headers, supported memberships, email shape, and required identifiers. `Bronze II (Claim)` and `Ambassador` are reported as ignored. Unsupported or incomplete records are rejected. Duplicate normalized emails are all reported, while the highest supported tier is selected for the upsert.

Preview performs no database writes. Commit upserts eligible members, stores the full exception report in `import_batches`, and writes an `audit_events` entry.
