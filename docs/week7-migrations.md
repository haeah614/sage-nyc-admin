# Week 7 migration review — not applied

01 and 02 are manually reviewed, run-once SQL files, not automatically applied by an
application build. No live database was contacted. No seed records, Auth hooks,
existing-table alterations, or application changes are included.

## Execution order (only after separate approval)

1. `supabase/week7/01-domain-tables.sql`: ten tables, constraints, indexes,
   database-controlled timestamps/revisions, RLS and explicit grants.
2. `supabase/week7/02-prompt-chain-mix.sql`: configuration serialization,
   active-chain integrity checks, and the service-role-only mix RPC.
3. Provision the private bucket through the supported Dashboard/Storage API as
   described in [the Storage runbook](week7-storage-provisioning.md).
   `supabase/week7/03-admin-images-bucket.sql` is now SELECT-only verification.
   The former provisioning/policy SQL is withdrawn; do not run saved old copies.

Run each of 01 and 02 as `postgres` in a dedicated SQL Editor query, in order.
Each has its own transaction; an error rolls back that file. Stop on any error.
Files deliberately fail on name collisions rather than silently accepting an
unknown existing definition. Do not rerun historical `01-admin-security.sql`
or `02-bootstrap-one-user.sql`. Do not run these files inside an existing
transaction. If the editor leaves a failed transaction open, ROLLBACK it before
further work. No destructive down migration is supplied: later rollback requires
review of newly accumulated data and Storage objects.

## Preconditions requiring confirmation

- Compare current live metadata with `profiles.id uuid` and `generations.id uuid`
  primary keys, and non-null boolean `profiles.is_superadmin`, with profile RLS
  enabled. The migration checks the flag/RLS and FK creation checks key validity.
- Confirm all ten proposed table names, helper functions, RPC, triggers, and new
  object names are unused. New functions must be owned by the trusted
  migration role (`postgres`); do not apply as a browser or runtime role.
- Review grants, role inheritance, default privileges and privileged routines.
  Explicit new-table revokes neutralize common Supabase default browser grants;
  unexpected custom roles or privileged functions require separate assessment.
- Confirm `service_role` retains existing SELECT access to the superadmin flag.
  No existing authorization grants or business triggers are replaced by these files.
- Confirm Storage schemas/columns, enabled RLS on buckets and objects, standard
  anon/authenticated roles, and existing policies. No new Storage policies are installed. The confirmed
  scoped profile-photos upload policy does not authorize admin-images access.
  A future broad permissive policy can invalidate this boundary; re-review it.
  Test the existing profile upload flow after provisioning. Public bucket flag
  remains false; signed URLs are temporary bearer access granted by the server.
- Approve 5 MiB, JPEG/PNG/WebP, maximum 10,000 pixels per dimension and 40 million
  total pixels. Database metadata limits do not validate bytes: the future upload
  handler must decode and validate files and generate canonical UUID paths.

## Security contract

New tables use RLS with no browser policies and no anon/authenticated/PUBLIC
grants. Service-role access remains server-only and must follow requireAdmin.
Every future write route must enforce same-origin and ADMIN_WRITES_ENABLED;
SQL cannot check an HTTP origin or an application environment variable.

Runtime grants: chain/step SELECT only; response SELECT/INSERT only; other tables
CRUD. The chain mix RPC alone permits runtime weight changes. It rechecks and
locks the supplied actor's admin profile, but the server must derive that UUID
from requireAdmin, never trust a client-supplied actor. SECURITY DEFINER helpers
have empty search paths and explicit qualification; direct EXECUTE is revoked
except for the mix RPC granted to service_role. Database owners remain trusted.

All mutable updates increment revision and preserve id/created_at. The future
API must include `WHERE id = ... AND revision = ...` and handle zero updated rows
as a conflict; map FK/restrict violations (23503/23001) to dependency conflicts. The trigger alone does not reject stale updates. Responses have
the same timestamp mechanism but runtime UPDATE/DELETE is denied. Their optional
generation FK may be nulled by deletion of its parent; response text survives.

No FK targets plans, votes, saved_places or movies. No current rows are touched.
Importer/uploader profile references are nullable and use ON DELETE SET NULL.
Deleting a profile clears attribution without deleting responses or image metadata.
The owner confirmed live account cascades: auth.users -> profiles/generations,
generations -> plans, and plans/auth.users -> votes/saved_places. These existing
foreign keys are not altered. The new generation reference already uses SET NULL,
so account deletion can clear both response attribution and its generation link.
The timestamp trigger increments revisions on these FK-driven updates; do not
assume a response revision increases exactly once during an account deletion.

Other new RESTRICT relationships exist only among providers, models, chains and
steps; none is on the account-deletion path. Examples retain their content and
optional response link. No new FK targets auth.users directly. PostgreSQL adds
internal FK enforcement triggers on referenced tables, but existing business
triggers and FK definitions are not replaced.

### Nullable attribution UI/API contract

The Week 7 response/image UI has not been implemented yet. Its types must declare
`imported_by: string | null` and `uploaded_by: string | null`; joined profile data
must also be optional. Use left/optional joins, never inner joins that hide records
when the profile is gone. Render missing attribution as "Unavailable account"
without a profile link, and missing generation links as "No linked SAGE request".
Do not copy names/emails into fallback fields or infer that every null means a
deleted account. New uploads/imports must still obtain the actor from requireAdmin
on the server, not from user input. Nullable storage does not relax authorization.

Admin image object paths must use asset/random UUIDs, not uploader IDs. Account
removal does not delete admin-images objects; these are managed separately via
the Storage API. This SQL does not modify existing profile-photo cleanup behavior.
Preserved text or files may themselves contain personal content: SET NULL removes
relational attribution, not personal information embedded in retained content.

This is an edit to the unapplied draft, not an upgrade migration for an already
installed schema. No live changes have been made. Remaining permission, Storage,
locking and concurrency preflight requirements still apply.

## Mix contract and concurrency

`admin_update_prompt_chain_mix(actor_uuid, changes_jsonb)` accepts a complete
snapshot, e.g. `[{"id":"<chain UUID>","revision":1,"weight":3}]`. Every chain
must appear once, including zero-weight chains. Unknown, omitted, duplicate or
stale entries fail; weights must be integer 0–10,000. At most 1,000 chains and
256 KiB JSON are accepted. Unchanged rows keep their revision. Empty/all-zero
mix is allowed; display it as no active mix. Percentages are calculated from the
sum of positive weights. Configuration is not wired into the original app.

Before-statement triggers serialize provider/model/chain/step mutations with
transaction advisory lock `(77007,1)`. READ COMMITTED is required. After-statement
checks reject positive chains without steps or with disabled models/providers.
Disable a chain's weight before disabling its model/provider or removing its
last step. Mix updates are one statement and one transaction; failures undo the
whole update. The statement triggers also protect future approved seed writes.

Disposable single-session tests cannot prove multi-client lock behavior. Before
production writes, staging must test simultaneous mix edits, model/provider
changes, step removal, catalog deletion and admin revocation. A deadlock or
serialization error must become a retry/reload response, never partial success.

## Images and signup lists

The images table is a catalog for admin-images only, not profile-photos. No
storage.objects rows are inserted or removed by SQL. The 03 file is
SELECT-only verification; provisioning uses Dashboard/Storage API separately. File upload,
replacement and removal must use Storage APIs; PostgreSQL and object storage
cannot commit atomically. object_path is the currently selected object;
pending_object_path tracks the replacement/cleanup object during a recoverable
operation. The future handler must serialize lifecycle transitions, verify
server-generated paths, reconcile failures and prevent deletion of referenced
assets. The schema alone does not implement the upload workflow.

Signup domains/emails are real persisted catalogs; no Auth hook is installed or
enabled. Domain normalization requires server-side IDNA conversion; the database
accepts lowercase DNS names with at least two labels. Email CHECK is deliberately
basic; server validation is also required. Neither list grants superadmin access.

No prompt definitions, examples, requests or responses are seeded. Initial
chains/steps require separately reviewed real content, inserted at zero weight
before activation. Historical raw LLM responses must never be reconstructed from
plans and represented as original output.

## Validation

`npx vitest run tests/week7-database.test.ts` runs the actual SQL only in disposable
PGlite with synthetic fixtures, including a minimal Storage schema. It never
reads .env.local or connects to Supabase. Storage service behavior and deployed
Auth/RLS policies still need approved staging verification.

Account-deletion regressions exercise direct profile deletion and deletion from
synthetic auth.users, verifying the confirmed public cascades, retained responses/
examples/images, null attribution and continued runtime reads. The simplified
auth.identities fixture is removed first for the Auth case; this does not test
Supabase Auth's internal identity cleanup or Storage service account restrictions.
