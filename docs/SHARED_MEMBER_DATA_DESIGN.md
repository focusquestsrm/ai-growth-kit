# Shared Member Data and Intelligence Dashboard Integration Proposal

Status: **Proposed for approval — not yet implemented**

## Decision boundary

The D9Network Intelligence Dashboard remains the only administrative entry point for Excel member imports. The Business Growth Platform will not provide a separate upload action. Both applications will use the same master records through a shared Supabase project or a secured service API.

No import schema, matching automation, invitation workflow, or integration endpoint described below should be deployed until the data owner approves this design and the open decisions at the end of this document.

## Ownership and system boundaries

| Capability | System of record / owner |
| --- | --- |
| Workbook upload, validation, corrections, and import review | Intelligence Dashboard |
| Original workbook and raw rows | Private audit storage managed by Intelligence Dashboard |
| Master person/member identity | Shared database |
| Authentication identity and invitations | Supabase Auth, orchestrated by a protected server service |
| Membership relationship and tier | Shared database, updated by approved imports/admin actions |
| Platform roles | Shared database, independent of membership |
| Business Profile and completeness | Business Growth Platform tables in the shared database |
| Tool entitlements | Server-side policy derived from active access, role, and membership tier simulation where authorized |
| Import, invitation, role, membership, and administrative audit history | Shared append-only audit records |

## Proposed schema

All tenant-owned tables include `tenant_id`. All primary identifiers are UUIDs. Source-system identifiers are attributes, never primary keys.

### Identity and tenancy

`tenants`

- `id uuid primary key`
- `name text`
- `status text`

`organizations`

- `id uuid primary key`
- `tenant_id uuid`
- `name text`
- `normalized_name text`
- `external_id text nullable`

`chapters`

- `id uuid primary key`
- `tenant_id uuid`
- `organization_id uuid nullable`
- `name text`
- `normalized_name text`
- `external_id text nullable`

`people`

- `id uuid primary key` — permanent internal member/person identifier
- `tenant_id uuid`
- `first_name text`
- `last_name text`
- `primary_email text nullable`
- `normalized_email text nullable`
- `primary_phone text nullable`
- `normalized_phone text nullable`
- `organization_id uuid nullable`
- `chapter_id uuid nullable`
- `source_system text nullable`
- `source_system_id text nullable`
- `created_at`, `updated_at`
- unique `(tenant_id, source_system, source_system_id)` when a source ID exists

`user_accounts`

- `id uuid primary key`
- `tenant_id uuid`
- `person_id uuid nullable`
- `auth_user_id uuid unique nullable`
- `account_status text` constrained to `invited`, `pending_activation`, `pending_profile`, `trial`, `active`, `complimentary`, `internal`, `external_tester`, `suspended`, `expired`, or `archived`
- `invited_at`, `activated_at`, `suspended_at`, `archived_at`, `last_login_at`

Staff and testers may have a user account without a D9Network membership record.

### Membership and access

`memberships`

- `id uuid primary key`
- `tenant_id uuid`
- `person_id uuid`
- `membership_status text` — proposed initial values: `prospect`, `current`, `grace`, `lapsed`, `terminated`, `non_member`
- `membership_tier_id uuid nullable`
- `organization_id uuid nullable`
- `chapter_id uuid nullable`
- `effective_at`, `expires_at`
- `source_import_row_id uuid nullable`
- `updated_at`

`membership_tiers`

- retain Bronze, Silver, Gold, and Platinum
- add `id uuid` or preserve the existing rank as a stable entitlement key
- add `is_approved_plan boolean`
- do not automatically grant Business Growth Platform access to unapproved plans

`account_entitlements`

- `id uuid primary key`
- `tenant_id uuid`
- `user_account_id uuid`
- `application_key text`
- `access_status text`
- `actual_tier_id uuid nullable`
- `simulated_tier_id uuid nullable`
- `simulation_expires_at timestamptz nullable`
- `activation_rule_version text`
- `activated_by uuid nullable`

Test-tier simulation remains separate from actual membership.

### Roles

`role_definitions`

- `key text primary key`
- seed `super_admin`, `admin`, `staff`, `executive_viewer`, `member`, `partner_admin`, `tester`, `read_only`
- include permission metadata rather than deriving access from tier

`user_role_assignments`

- `id uuid primary key`
- `tenant_id uuid`
- `user_account_id uuid`
- `role_key text`
- `scope_type text` and `scope_id uuid nullable`
- `is_active boolean`
- `assigned_by uuid`
- `assigned_at`, `revoked_at`

### Profile

`business_profiles`

- use `person_id` or `user_account_id` as the owner
- retain the approved business fields already implemented
- add `profile_completeness smallint`
- add `completeness_version text`
- calculate completeness server-side from actual supplied fields; do not hardcode a completion percentage in the UI

### Imports and matching

`import_batches`

- `id uuid primary key`
- `tenant_id uuid`
- `source_system text`
- `source_file_id uuid`
- `filename text`
- `uploaded_by uuid`
- `status text` constrained to `uploaded`, `validating`, `review_required`, `approved`, `processing`, `completed`, or `failed`
- `total_rows`, `valid_rows`, `created_rows`, `updated_rows`, `exception_rows`, `invited_rows`
- `mapping_version text`
- `activation_rule_version text`
- `started_at`, `completed_at`, `created_at`

`import_source_files`

- `id uuid primary key`
- `tenant_id uuid`
- `storage_bucket text` and `storage_path text`
- `sha256 text`
- `mime_type text`, `byte_size bigint`
- `retention_until timestamptz nullable`
- original files remain in a private bucket; signed access is limited to authorized staff

`import_rows`

- `id uuid primary key`
- `batch_id uuid`
- `row_number integer`
- `raw_data jsonb`
- `standardized_data jsonb`
- `validation_status text`
- `match_status text`
- `matched_person_id uuid nullable`
- `processing_status text`
- `created_at`, `processed_at`

`identity_match_candidates`

- `id uuid primary key`
- `import_row_id uuid`
- `candidate_person_id uuid`
- `match_rule text`
- `confidence text` constrained to `certain`, `probable`, or `uncertain`
- `evidence jsonb`
- `decision text nullable`
- `reviewed_by uuid nullable`, `reviewed_at timestamptz nullable`

`import_exceptions`

- `id uuid primary key`
- `import_row_id uuid`
- `exception_code text`
- `severity text`
- `field_name text nullable`
- `message text`
- `status text` constrained to `new`, `in_review`, `corrected`, `approved`, `rejected`, or `ignored`
- `correction jsonb nullable`
- `resolved_by uuid nullable`, `resolved_at timestamptz nullable`

### Invitations and audits

`account_invitations`

- `id uuid primary key`
- `tenant_id uuid`
- `person_id uuid nullable`
- `email text`
- `account_status_before text`
- `invitation_status text` constrained to `authorized`, `queued`, `sent`, `accepted`, `expired`, `cancelled`, or `failed`
- `authorized_by uuid`, `sent_at`, `accepted_at`, `expires_at`
- never store invitation tokens in plaintext

`audit_events`

- append-only record with `tenant_id`, actor account, action, entity type/id, before/after summaries, request correlation ID, timestamp, and source application
- dedicated action types cover imports, match decisions, invitations, role changes, membership changes, account suspension/reactivation, and administrative access

## Proposed Excel-to-database mapping

The Intelligence Dashboard will show the detected column, standardized destination, transformation, and any mapping error before an import may be approved.

| Accepted workbook columns | Standard field | Transformation / validation |
| --- | --- | --- |
| `member_id`, `user_id`, `bd_user_id`, `id` | `people.source_system_id` | Trim; preserve as text; require uniqueness within tenant and source |
| `email`, `user_email`, `email_address` | `people.primary_email` | Trim, lowercase for matching, validate syntax; preserve display value separately if needed |
| `phone`, `mobile`, `phone_number` | `people.primary_phone` | Parse to E.164 when country is known; otherwise flag for review |
| `first_name`, `firstname`, `first` | `people.first_name` | Trim; Unicode-safe capitalization is display-only, not matching evidence |
| `last_name`, `lastname`, `last` | `people.last_name` | Trim; never use name alone for automatic matching |
| `company`, `organization`, `business_name` | `organizations.name` / person affiliation | Normalize whitespace and punctuation; link only on approved exact organization match |
| `chapter`, `chapter_name`, `d9_affiliation` | `chapters.name` / membership affiliation | Map through tenant chapter reference data; unknown value becomes an exception |
| `membership`, `subscription_name`, `membership_category`, `plan` | membership tier/status input | Map through an approved lookup table; Bronze II (Claim) and Ambassador remain non-entitled unless policy changes |
| `membership_status`, `member_status`, `status` | `memberships.membership_status` | Map through an approved status dictionary; never reuse as account status |
| `active`, `is_active` | import evidence only | Parse Boolean; activation still requires all configured rules |
| `expiration_date`, `renewal_date`, `end_date` | `memberships.expires_at` | Parse using declared workbook locale; ambiguous dates become exceptions |
| `website`, `industry`, profile columns | `business_profiles` candidate fields | Import only when approved as authoritative; otherwise present for member confirmation |

Unknown columns remain in `raw_data` and are never silently discarded. Required-column and lookup failures enter the exception queue.

## Duplicate and identity-matching rules

Automatic matching is deliberately conservative and tenant-scoped.

1. **Certain match — automatic:** exact existing source-system ID for the same tenant and source, with no conflicting email or phone.
2. **Certain match — automatic:** exact unique normalized email plus one corroborating field: normalized phone, organization, or chapter.
3. **Probable match — review required:** exact unique normalized email without corroboration; or exact phone plus organization/chapter and compatible name.
4. **Uncertain match — review required:** similar name plus organization/chapter, shared organizational email, reused phone, or more than one candidate.
5. **Conflict — blocked:** source ID points to one person while email/phone points to another, duplicate source IDs in the workbook, or a proposed change crosses tenants.
6. Name alone never causes an automatic match or merge.

The reviewer can link to an existing person, create a new person, correct standardized fields, reject the row, or mark it ignored. Every decision records the evidence, reviewer, and timestamp. A rejected candidate is retained so the same uncertain merge is not repeatedly suggested without new evidence.

## Exception workflow

1. Upload original workbook to private storage and create an `uploaded` batch.
2. Detect/map columns and validate every row without mutating master records.
3. Store raw and standardized row data.
4. Classify rows as valid, certain match, probable/uncertain match, invalid, or blocked conflict.
5. Set the batch to `review_required` when any blocking exception or uncertain match exists.
6. Tina reviews corrections, duplicates, match evidence, and proposed invitation states in the Intelligence Dashboard.
7. Approval freezes a mapping/rule version and starts an idempotent processing job.
8. Upsert by UUID/source identity; never by name. Create new people with `pending_activation` unless an approved activation rule authorizes invitation.
9. Queue invitations separately and record delivery/acceptance status.
10. Finish the batch with counts and immutable audit events. Failed rows remain retryable without replaying completed rows.

## Activation rules

Recommended default: no imported row grants application access merely because it exists.

Access becomes eligible only when all configured rules pass, for example:

- certain identity match or approved new-person decision;
- valid unique email;
- approved membership status and supported tier;
- no suspension/archive flag;
- import batch approved by an authorized administrator;
- invitation explicitly authorized or an existing Auth account securely connected.

New accounts begin as `pending_activation` or `invited`. After invitation acceptance they may move to `pending_profile`; only the appropriate server workflow may move them to `active`.

## Proposed secured API design

### Intelligence Dashboard import APIs

- `POST /v1/member-imports` — create batch and obtain a signed private upload target
- `POST /v1/member-imports/{batchId}/validate` — map columns, standardize, and generate exceptions/match candidates
- `GET /v1/member-imports/{batchId}` — counts, processing state, mapping version, invitation summary
- `GET /v1/member-imports/{batchId}/rows` — paginated authorized review data
- `GET /v1/member-imports/{batchId}/exceptions` — paginated exception queue
- `POST /v1/member-imports/{batchId}/exceptions/{id}/resolve` — correction or match decision with optimistic concurrency
- `POST /v1/member-imports/{batchId}/approve` — freeze decisions and authorize idempotent processing
- `POST /v1/member-imports/{batchId}/invitations/authorize` — explicitly authorize selected invitations
- `GET /v1/member-imports/{batchId}/audit` — batch audit history

### Shared member/access APIs used by the Business Growth Platform

- `GET /v1/me` — minimum account, role, membership, account-status, and profile-completeness claims
- `GET /v1/me/entitlements` — tool IDs/tier ranks the current user may access; no protected templates for locked tools
- `GET/PATCH /v1/me/business-profile` — member-owned profile fields
- `GET /v1/members/{memberId}` — restricted staff use; field-level response based on role and tenant
- `POST /v1/admin/accounts/invite` — super-admin invitation for members or non-member staff/testers
- `PATCH /v1/admin/accounts/{id}/status` — suspend/reactivate/archive with audit event
- `POST/DELETE /v1/admin/accounts/{id}/roles` — scoped role changes with audit event
- `PATCH /v1/admin/accounts/{id}/tier-simulation` — time-bound test tier, never actual membership

The Business Growth Platform should either query the same Supabase project through server functions or call these APIs with a short-lived service identity. Browser clients receive only the minimum `/me` and entitlement payloads.

## Security and RLS design

- JWT claims identify `user_account_id` and active tenant; the server revalidates sensitive authorization against current database records.
- Members may access only their own profile, assessment, recommendations, and Saved Strategies.
- Partner administrators are scoped to explicitly assigned organizations/chapters.
- Staff access to member fields is permission- and tenant-scoped.
- Executive viewers receive aggregates, not individual sensitive assessment responses.
- Only super administrators can manage administrative roles, account suspension/reactivation, test tiers, and cross-functional audit history.
- Import raw rows/files are inaccessible to member clients and protected by private storage policies.
- Service-role credentials stay server-side. APIs use request IDs, idempotency keys for processing/invitations, rate limits, and append-only audit writes.
- RLS denies access by default; server-side authorization is required in addition to navigation visibility.

## Migration approach after approval

1. Inventory the Intelligence Dashboard schema and workbook columns without changing data.
2. Confirm whether both applications can share the existing Supabase project; otherwise approve the secured API boundary.
3. Create additive identity/access/import tables and compatibility views for current `member_app_access` consumers.
4. Backfill UUID-linked people, accounts, and memberships with a reviewed reconciliation report.
5. Move upload orchestration into the Intelligence Dashboard and disable the Business Growth Platform import endpoint/UI.
6. Switch eligibility checks to the shared access/entitlement service.
7. Run a parallel reconciliation period, then retire legacy access fields after audit sign-off.

## Approval decisions required

Please approve or revise these items before implementation:

1. Is the existing Intelligence Dashboard Supabase project the canonical shared database, or must integration use a secured API between projects?
2. What are the exact current workbook column headers and data types?
3. Which membership statuses and plans are approved beyond Bronze, Silver, Gold, and Platinum?
4. Should exact unique email without a corroborating field require review, as proposed?
5. Which activation rules authorize an invitation, and who may approve them?
6. Which email/invitation provider should send invitations?
7. What tenant model is required: one D9Network tenant, chapters as scopes, or multiple independent organizations?
8. What retention period applies to original workbooks and raw import rows?
9. Which Business Profile fields, if any, are authoritative from the workbook rather than member-confirmed?
10. Should the current Business Growth Platform import feature be disabled immediately upon approval or only after the Intelligence Dashboard workflow is verified in production?
