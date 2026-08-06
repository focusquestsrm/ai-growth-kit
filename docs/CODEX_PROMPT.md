# Codex implementation prompt

Work in `C:\Users\danie\ai-growth-kit` and use the GitHub repository `focusquestsrm/ai-growth-kit`.

Build the D9Network AI Business Growth Kit as a separate member-facing application that shares Supabase data with the existing D9Network Intelligence Dashboard. Do not expose the Intelligence Dashboard to ordinary members.

## Non-negotiable business rules

1. Supported member tiers are only Bronze, Silver, Gold, and Platinum.
2. Ignore `Bronze II (Claim)` and `Ambassador` during member access provisioning.
3. Admin access is separate from membership and supports multiple team members.
4. Member validation uses the synchronized Brilliant Directories `user_id`, normalized email, and membership tier.
5. Do not require members to select their tier. Access is derived from imported data.
6. Tina's current CSV/XLSX upload is the primary membership synchronization mechanism.
7. The Growth Kit is white labeled as D9Network. Do not show Nexx Jenn Technologies in the member UI.
8. Membership tier controls prompt access. Roles control admin and Intelligence Dashboard access.

## First actions

1. Inspect all repository files before changing anything.
2. Run `git status`, identify the current branch, and create a feature branch named `feature/member-access-foundation`.
3. Review `README.md`, `docs/ARCHITECTURE.md`, `supabase/migrations/001_initial_schema.sql`, and all functions.
4. Produce a concise plan, then implement without rebuilding working pieces unnecessarily.

## MVP scope

- Professional D9Network member login and verification screen.
- Verification requires email, Brilliant Directories user ID, and membership tier.
- Server validates all three fields against `member_app_access`.
- Prompt library grouped by category and filtered by member tier.
- Four tiers only: Bronze=1, Silver=2, Gold=3, Platinum=4.
- Admin console supporting multiple administrators and roles.
- Admin member import for CSV/XLSX with preview, validation, commit, and error reporting.
- Import extracts `user_id`, `email`, `subscription_name`, `first_name`, `last_name`, `company`, and `d9_affiliation` from Brilliant Directories exports.
- Ignore Bronze II (Claim) and Ambassador records.
- Resolve duplicate normalized emails by choosing the highest supported tier, but report every duplicate.
- Prompt/category CRUD with draft and published status.
- Server-side prompt filtering. Never rely only on hidden UI elements.
- Audit trail for imports and admin role changes.
- Responsive, accessible design based on `public/prototype-reference.html`, but keep the revised professional design already in the repository if present.

## Security

- Never expose the Supabase service role key to the browser.
- Replace temporary `X-Admin-Email` authorization with real authenticated role checks before production.
- Add rate limiting to member verification.
- Use generic login failure messages.
- Validate uploaded file size, MIME type, headers, and row counts.
- Add tests for tier mapping, ignored plans, duplicate emails, and unauthorized prompt access.

## Deliverables

- Working local app via `npm install` and `npm run dev`.
- Database migrations and seed data.
- Member and admin UIs.
- Netlify functions/API routes.
- Tests.
- `.env.example` with no secrets.
- Updated README with Windows setup commands.
- Commit work in logical increments and do not push until tests pass.
