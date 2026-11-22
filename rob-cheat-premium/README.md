ROB CHEAT — Website implementation

This repository contains the static website in `rob-cheat-premium/`.

## Pages
- `index.html` — public homepage and Stripe checkout entry point
- `account.html` — Supabase registration, sign-in, password reset and password update
- `dashboard.html` — authenticated member area, licence/device summary, activity and Discord-ticket download requests
- `admin.html` — administrator area for licences, orders, Stripe analytics and current release details
- `faq.html` — public FAQ
- `terms.html` — terms of service
- `privacy.html` — privacy policy

## Connected services
- Supabase Auth is used for member and admin sessions.
- The homepage starts Stripe Checkout through the `create-checkout` Edge Function.
- Member licence data is loaded through the same-origin `/api/my-licenses` route, which forwards the current user's JWT to the `my-licenses` Edge Function.
- The member dashboard no longer serves release archives. Members request download instructions by opening a ticket in the ROB CHEAT Discord server.
- The previous release archive is not served by the website. Any retained copy remains in private storage and is not publicly accessible.
- The admin area calls same-origin Vercel routes (`/api/admin-licenses` and `/api/stripe-admin-analytics`), which forward the signed-in user's JWT and publishable key to the Supabase Edge Functions. The Edge Functions continue to enforce JWT and admin-role validation.
- The admin licence proxy blocks create/update/revoke/HWID-reset actions in Vercel Preview deployments. These mutations are only available in the Production environment after the branch is approved and merged.

## Download requests

Downloads are handled through the ROB CHEAT Discord support server. Members should open a ticket and provide the email address associated with their ROB CHEAT account. The website does not expose or stream a release ZIP.

## Deployment and verification
Changes in `redesign/implementation-phase-1` are implementation work only. Review the branch and run end-to-end checks in a non-production environment before merging to the production branch. Do not treat a successful static JavaScript parse as a substitute for authenticated Supabase and Stripe integration tests.

## Legal pages
The Terms and Privacy pages retain the source wording and unresolved business, provider and retention placeholders. Complete and review those details before relying on the pages as final legal notices.
