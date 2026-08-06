# Implementation brief

Build and maintain **The D9Network AI Business Growth Platform** as a polished, secure member application. The separate D9Network Intelligence Dashboard remains administrative; regular members must not receive access to it.

## Non-negotiable business rules

1. Supported member tiers are Bronze, Silver, Gold, and Platinum.
2. Ignore Brilliant Directories memberships `Bronze II (Claim)` and `Ambassador`.
3. Validate eligibility with normalized email, Brilliant Directories user ID, and membership.
4. Membership tier controls Business Growth Tool access.
5. Administrative roles control administrative access separately and support multiple administrators.
6. CSV/XLSX uploads are the initial membership synchronization method.
7. Store Business Growth Tools and Categories in Supabase; enforce access in server functions.
8. Do not expose service credentials, commit `.env`, or display third-party implementation branding.

## Official member-facing language

- Product: The D9Network AI Business Growth Platform
- Content item: Business Growth Tool
- Catalog: Business Growth Library
- Group: Business Growth Category
- Primary action: Generate Strategy or Generate Recommendations
- Result: Business Growth Recommendations
- History: Growth Activity
- Saved work: Saved Strategies

Internal schema identifiers such as `prompts` may remain stable.

## Experience requirements

Provide a personalized dashboard, expanded reusable Business Profile, tier-aware recommendations, tool favorites, Saved Strategies with duplicate/export, Growth Activity, feedback on every page, Business Health assessment, Opportunity Center roadmap, and a complete role-protected admin console. Use responsive, accessible layouts, clear loading/success/error/empty states, and restrained D9Network styling.

See `PRODUCT_VISION.md` and `docs/ARCHITECTURE.md` for roadmap and implementation boundaries.
