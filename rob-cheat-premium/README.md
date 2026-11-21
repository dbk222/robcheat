ROB CHEAT — Website implementation

This repository contains the static website in `rob-cheat-premium/`.

## Pages
- `index.html` — public homepage and Stripe checkout entry point
- `account.html` — Supabase registration, sign-in, password reset and password update
- `dashboard.html` — authenticated member area, licence/device summary, activity and private release downloads
- `admin.html` — administrator area for licences, orders, Stripe analytics and current release details
- `faq.html` — public FAQ
- `terms.html` — terms of service
- `privacy.html` — privacy policy

## Connected services
- Supabase Auth is used for member and admin sessions.
- The homepage starts Stripe Checkout through the `create-checkout` Edge Function.
- Member licence data is loaded through the same-origin `/api/my-licenses` route, which forwards the current user's JWT to the `my-licenses` Edge Function.
- The member download button calls `/api/member-download`. The Vercel route forwards the current user's JWT to the `member-download` Edge Function, fetches the signed object server-side, and streams the ZIP to the browser without exposing the signed URL.
- The `member-download` Edge Function validates the Supabase session, verifies an owned ROB CHEAT licence, checks status and expiry, checks legacy key revocation/expiry where a key record exists, and then creates a 120-second signed URL.
- The current release object is stored in the private Supabase Storage bucket `robcheat-releases` at `v1.0.0/RobCheat.zip`. The bucket must remain private.
- The admin area calls same-origin Vercel routes (`/api/admin-licenses` and `/api/stripe-admin-analytics`), which forward the signed-in user's JWT and publishable key to the Supabase Edge Functions. The Edge Functions continue to enforce JWT and admin-role validation.
- The admin licence proxy blocks create/update/revoke/HWID-reset actions in Vercel Preview deployments. These mutations are only available in the Production environment after the branch is approved and merged.

## Release downloads
The active package is `RobCheat.zip`, version `v1.0.0`, in the private `robcheat-releases` bucket. Do not move it to the public website `assets/` directory or change the bucket to Public. The browser receives a streamed ZIP response; the temporary Storage signed URL is kept server-side.

For a future release, upload the new archive to a versioned path in the same private bucket, then update `OBJECT_PATH` and the release metadata in the `member-download` Edge Function and update the Admin Panel release display. Release publishing is not yet a self-service admin workflow.

## Deployment and verification
Changes in `redesign/implementation-phase-1` are implementation work only. Review the branch and run end-to-end checks in a non-production environment before merging to the production branch. Do not treat a successful static JavaScript parse as a substitute for authenticated Supabase and Stripe integration tests.

## Legal pages
The Terms and Privacy pages retain the source wording and unresolved business, provider and retention placeholders. Complete and review those details before relying on the pages as final legal notices.


## ROB CHEAT Finance
- `finance.html` — private, mobile-friendly finance ledger for the ROB CHEAT partners.
- Access uses the existing Supabase Auth accounts and the separate `finance_workspaces`, `finance_members`, and `finance_entries` tables. Finance rows are isolated from customer licence data with Row Level Security.
- Revenue, refunds, processing fees, business expenses and partner withdrawals are entered manually in RON. There are no Stripe, Paysafe, PayPal or Revolut API integrations.
- Distributable profit is calculated as collected revenue minus refunds, payment fees and business expenses, then allocated 50/50. Withdrawals reduce only the selected partner's remaining entitlement.
- Do not treat a partner's profit entitlement as the cash balance held by a payment provider or bank.
