# Validation and remaining acceptance checks

## Completed locally

- TypeScript: `npm run typecheck` passed.
- ESLint: `npm run lint` passed without errors or warnings.
- Production compilation: `npm run build` passed using Next.js 16.3.5.
- Automated tests: **79 passed across 7 files**. No test connects to production.
- Signed-out HTTP checks against the built server: **14 passed**. Login returns 200; `/`, `/users`, `/recommendations`, `/recommendations/new`, and `/votes` return immediate 307 redirects to login. Profile/vote/dashboard/generation APIs return 401. Recommendation POST/PATCH/DELETE return 401. A Google callback without its double-submit CSRF token returns 403.
- The first HTTP check found that a server-component redirect was streamed with status 200. The proxy was strengthened to make denied page requests redirect before rendering; independent page/data checks remain. The complete HTTP matrix then passed.
- Desktop and mobile visual fixtures are generated from the actual dashboard components, with explicitly synthetic records. They are stored only in ignored `.artifacts/`, not a public application route. Screenshots and automated overflow checks use installed Chrome; these are presentation checks, not evidence of live Google authentication.
- Original-repository integrity: all **65 tracked files** matched the initial SHA-256 snapshot, Git status remained clean, and HEAD remained `1223b6d78560df1d47fb4e9dde24bc179d0e32aa`.
- Browser static bundles were scanned for the actual service-role credential: no matches. Secrets are stored only in the new ignored `.env.local` and were not printed.
- The new repository is independent, on `main`, with no remote configured. Git whitespace/secret/exclusion checks are performed before the local handoff commit.

## Automated coverage

| Area | What is verified |
| --- | --- |
| Authorization policy | Anonymous 401, non-admin 403, Google identity requirement, database-flag requirement, fail-closed lookup errors |
| Privileged client | Never constructed before authorization; role changes rechecked on subsequent operations |
| API boundary | All data routes and CRUD methods deny unauthorized requests; read-only resources reject writes; no-store responses; sanitized errors |
| CRUD | Existing generation owner controls creation; immutable location/ownership fields cannot be patched; exact deletion confirmation; no direct-delete fallback |
| Validation | Required text/lengths, UUIDs, unknown fields, URLs, ratings/reviews/prices, coordinate pairs/ranges, bounded JSON bodies and filter input |
| Analytics | Empty datasets, real row aggregation, place-ID grouping, duplicate tag handling, vote trends and net-vote ordering |
| PostgreSQL security | False default; owner-only flag reads; existing profile edits preserved; column and trigger defenses against self-promotion; direct RPC grants; service-role cannot edit authorization |
| PostgreSQL deletion | Unreferenced plan removal preserves generations/users; votes/bookmarks block removal; unknown FKs (including new columns in existing tables) and custom plan/child DELETE triggers block removal |
| Bootstrap | Exactly one verified synthetic Google account is authorized; unverified/missing identities rejected |
| Presentation | Overview renders navigation, skip link, accessible chart table, and page content using isolated fixtures |

The PostgreSQL tests use PGlite, a disposable single-connection Postgres WASM engine. They execute the actual proposed SQL against table definitions copied from the inspected source migrations plus live-confirmed coordinate columns. They do not prove multi-client lock scheduling, unseen live functions/grants, or deployed authentication configuration.

## Reproduce visual inspection

```sh
npm test
node scripts/visual-check.mjs
```

The script defaults to the installed macOS Chrome executable. Set `CHROME_PATH` for another installation. It loads only `.artifacts/overview-fixture.html`, verifies no page-wide horizontal overflow at 1440px and 390px viewports, and writes ignored screenshots. There is no fixture mode in the production app.

## Required after approval — not yet verified live

1. Run/review the read-only catalog preflight. Apply the reviewed migration only after explicit approval. Verify the intended existing Google Auth UUID and manually run the separate one-user bootstrap only after approval.
2. Configure approved Google origins/callback and the new admin environment. Keep writes disabled. Verify real sign-in, refresh, expiration, sign-out, and the following matrix on both the intended canonical origin and configured deployment origin:

| Identity | Admin pages | Admin reads | Admin mutations |
| --- | --- | --- | --- |
| Signed out / forged or expired cookie | Login redirect | 401 | 401 |
| Valid Google session, ordinary profile | Access Denied | 403 | 403 |
| Non-Google session | Access Denied | 403 | 403 |
| Valid Google session, superadmin | Allowed | Allowed | Denied while writes are disabled |
| Missing flag/profile or DB outage | Denied/unavailable | Denied/unavailable | Denied/unavailable |

3. Compare exact dashboard totals with read-only SQL counts. Compare category/ranking chart scope with the stated sample. Exercise search, pagination, sorting, avatars, no-results, error recovery, mobile navigation, keyboard focus, and chart table access with real data.
4. Verify the ordinary authenticated client cannot set `profiles.is_superadmin`, including direct REST attempts. Verify owner-only profile updates in the existing app still work. Verify no private rows/credentials appear in signed-out HTML, RSC responses, API responses, browser bundles, or logs.
5. On a staging copy or explicitly designated test records, and only after approval to enable writes, create/import a recommendation using a designated generation. Verify server-derived owner and nullable metadata. Edit title/description/SAGE Note and verify all place IDs, coordinates, ratings, owner, and generation fields remain identical.
6. Delete a designated unreferenced test recommendation after explicit confirmation; verify the generation remains. Attempt deleting designated records with votes and saved places: expect 409 and unchanged dependencies. Do not delete real votes/bookmarks to unblock removal.
7. Multi-connection staging test: hold a plan-row lock while another connection inserts a vote/bookmark, then attempt guarded deletion; reverse ordering as well. Verify no committed vote/bookmark is silently cascaded and no orphan is accepted. Do not run concurrency experiments on real community records.
8. With separate approval/account access, create the new remote projects, push/deploy, disable Vercel Deployment Protection only for `sage-nyc-admin`, and repeat the authentication matrix from a signed-out browser.
9. Regression-check the existing app read-only first. Any generation/vote/save/profile mutations used for regression must be approved and limited to designated test records. Do not run coordinate backfills or consume Places quota as part of this handoff.
10. Record verified latest commit-specific Vercel URLs and Git SHAs for both apps. The original app must not be redeployed. Final assignment completion remains pending these live checks.
