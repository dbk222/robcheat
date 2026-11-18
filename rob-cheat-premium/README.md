ROB CHEAT — Website implementation

This repository contains the static website in `rob-cheat-premium/`.

## Pages
- `index.html` — public homepage and Stripe checkout entry point
- `account.html` — Supabase registration, sign-in, password reset and password update
- `dashboard.html` — authenticated member area, license/device summary and activity
- `admin.html` — administrator area for licenses, orders and Stripe analytics
- `faq.html` — public FAQ
- `terms.html` — terms of service
- `privacy.html` — privacy policy

## Connected services
- Supabase Auth is used for member and admin sessions.
- The homepage starts Stripe Checkout through the `create-checkout` Edge Function.
- The member dashboard loads account license information through `my-licenses`.
- The admin area uses `admin-licenses` and `stripe-admin-analytics`.

## Release downloads
Release ZIP delivery is not enabled by these pages. Do not place customer release archives in the public `assets/` directory. Before downloads are enabled, configure private object storage, signed download URLs, verified release metadata and server-side entitlement checks.

## Deployment and verification
Changes in `redesign/implementation-phase-1` are implementation work only. Review the branch and run end-to-end checks in a non-production environment before merging to the production branch. Do not treat a successful static JavaScript parse as a substitute for authenticated Supabase and Stripe integration tests.

## Legal pages
The Terms and Privacy pages retain the source wording and unresolved business, provider and retention placeholders. Complete and review those details before relying on the pages as final legal notices.
