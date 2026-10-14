# SAGE NYC Admin · Week 6

An independent Next.js 16.3.5 / TypeScript application for administering the existing SAGE NYC Supabase database. It does not modify or deploy the Week 5 application.

**Status:** local implementation complete; production setup and verification pending approval. No shared SQL, bootstrap, production writes, remote repository creation, push, deployment, or Vercel setting changes have been performed. Writes default to disabled.

## Run locally

```sh
cd ~/IdeaProjects/sage-nyc-admin
npm ci
npm run dev
```

Open http://localhost:3000/login. A separate ignored `.env.local` has been prepared with only the existing Supabase URL, publishable key, service-role key, and Google client ID. Google Places and Gemini keys were not copied. See `.env.example` for a clean setup; never commit `.env.local`.

`APP_ORIGIN` must exactly match the browser origin, including scheme and port. The default is `http://localhost:3000`. For another local port, update only this project's local configuration. Production requires the exact HTTPS admin origin. Keep `ADMIN_WRITES_ENABLED=false` until database review and explicit approval to write production records. Enabling the flag alone does not bypass authentication.

Google Identity Services also requires the admin JavaScript origin and the `/auth/callback` login URI to be authorized on the appropriate Google OAuth web client. **Those production configuration changes require approval.** Existing SAGE URLs must remain intact.

The current live schema does not yet have `profiles.is_superadmin`. Authenticated admin access therefore fails closed until the reviewed setup is manually completed. There is no demo login, fallback admin, public data API, or authorization bypass.

## What is included

- **Overview:** exact counts for profiles, recommendations, generations, positive/negative votes; sentiment ring; 30-day UTC vote chart with a table alternative; persisted place-type distribution; frequent locations grouped by place ID; net-vote rankings; recent recommendations.
- **Community:** read-only profile names, IDs, creation timestamps, existing avatar images, admin status, search, sorting, and pagination.
- **Recommendations:** searchable/paginated list, details, creation from an existing generation's AI output, editing of title/description/SAGE Note, and explicit guarded deletion.
- **Votes & ratings:** private individual voter IDs, recommendation links, timestamps, vote-direction filters, sorting, aggregates. Stored 0–5 place ratings and review counts appear on recommendations. There is no separate user-rating table in the inspected schema.
- **Presentation:** responsive sage/cream design, keyboard focus states, loading/error/empty states, accessible labels, Google sign-in, access-denied screen, and sign-out.

Charts use at most the newest 5,000 plans and 5,000 votes, fetched in pages of 500. The UI explicitly reports sample sizes and whether they are partial. Headline counts are exact. Reads are not a single snapshot; concurrent activity can change counts during refresh. Category tags overlap, and rankings in a partial dataset are not global all-time rankings. No mock statistics are used by the app.

Profile dates are `profiles.created_at`, not a claim that Auth account timestamps were queried. AI media here means the existing text recommendations and SAGE Notes, not a newly invented image/media schema. Creating a record imports supplied AI output into an existing generation; it does not fabricate provenance or invoke Gemini/Places.

## Architecture and security

- `app/(admin)/[[...section]]/page.tsx` gates every admin page with `pageAdmin()`. The proxy also verifies page access before rendering; the data layer does not trust proxy-only checks.
- `lib/admin.ts` verifies the live Supabase user via `auth.getUser()`, requires a Google provider/identity, and queries that user's `profiles.is_superadmin` using their session and RLS. Missing profiles, false flags, errors, and missing configuration fail closed.
- The service-role client is instantiated only **after** that verification. It lives in a `server-only` module and is not shared with browser components. No user metadata, email allowlist, or client-supplied role is accepted as authorization.
- All admin data routes go through `lib/api.ts`; every request independently invokes the protected data entrypoint. The app uses route handlers rather than server actions. Every write also requires same-origin JSON and the server-only writes-enable flag.
- `/login`, `/denied`, `/auth/callback`, and `/auth/signout` are authentication surfaces without admin records. Google callback checks the GIS double-submit CSRF token, then exchanges the ID token with Supabase. Redirect destinations are fixed. Sign-out requires same origin.
- Admin cookies use a distinct `sage-admin-auth` name, are HttpOnly, SameSite=Lax, and Secure in production. Admin data is not cached. Supabase refresh cookies are persisted in the proxy.
- Inputs are bounded and allowlisted. Editing cannot alter place ID, coordinates, rating, owner, or generation. Creation obtains ownership from the selected generation on the server. Errors do not return raw database messages.
- Runtime code has no Google Places, coordinate backfill, or Gemini calls. Existing public avatar storage may be read by an authorized browser; arbitrary image URLs are not used.

See [database inspection](docs/database-review.md), [SQL setup](docs/sql-setup.md), [deployment handoff](docs/deployment.md), and [validation](docs/validation.md).

## Validate locally

```sh
npm run typecheck
npm run lint
npm test
npm run build
git diff --check
```

Tests use mocks and a disposable in-memory PostgreSQL engine (PGlite). All database fixtures are synthetic. They do not read `.env.local`, connect to production, or create test records in Supabase. PGlite is a development-only dependency. Database migration tests are not a substitute for reviewing the live schema/grants or multi-connection concurrency testing.

## Next approval boundary

Review `supabase/00-inspect-read-only.sql` and the proposed `01-admin-security.sql`. Then separately authorize any shared-database changes and manual bootstrap. Remote GitHub/Vercel creation, push, deployment, production configuration changes, and real record changes still require explicit approval. Do not deploy or enable writes until the acceptance checklist is completed.
