# Week 7 managed Storage provisioning — separate from SQL migrations

The former 03 INSERT/CREATE POLICY migration is withdrawn. The SQL file at that
path now contains SELECT-only verification. Discard saved copies of the old SQL.
Do not change managed Storage ownership, grants, roles, RLS or existing policies.

## Decision and security boundary

Confirmed: postgres cannot inherit the supabase_storage_admin table owner's
rights. Use the supported Storage Dashboard or Storage API to create a bucket.
No new Storage RLS policies are required for the existing server-only privileged
client architecture. Existing RLS stays enabled. The confirmed authenticated
INSERT policy applies only to each user's profile-photos folder; it cannot
permit access to admin-images. No applicable permissive policy means browser
access is denied. This conclusion depends on ALL effective policies remaining
scoped: any later broad SELECT/INSERT/UPDATE/DELETE policy needs review before
image management remains enabled. The private flag alone does not deny access
that another policy explicitly grants.

The existing server service-role client has Supabase's documented privileged
Storage access; this proposal adds no bypass privileges or alternative access
path. Every admin read (including previews/listing) must call requireAdmin first.
Every mutation must also check origin and ADMIN_WRITES_ENABLED. Never expose
service credentials, inherit a browser Authorization header, or accept an arbitrary
bucket/path from client input. Fix the bucket to admin-images; look up object
paths from authorized public.images records. Existing profile photos stay read-only.

Prefer authenticated server-proxied image previews. If using short-lived signed
URLs, recipients can use them until expiry without another admin check; do not
log or persist them. File validation, bounded decoding, revision checks and
retryable replacement/deletion states remain required. Storage and PostgreSQL
are not one transaction.

## Exact execution sequence (after approval)

1. For each SQL migration, replace the initial BEGIN in the editor copy with:

   ```sql
   BEGIN ISOLATION LEVEL READ COMMITTED;
   SET LOCAL lock_timeout = '5s';
   SET LOCAL statement_timeout = '30s';
   SET LOCAL transaction_timeout = '90s';
   ```

   Keep its final COMMIT. Run one whole file at a time, never an outer transaction.
2. Apply 01-domain-tables.sql, verify ten tables/RLS/grants/nullable attribution.
3. Apply 02-prompt-chain-mix.sql, verify the four function signatures/ACLs and
   configuration triggers. These two files do not reference storage tables;
   images.bucket_id is a text CHECK, not a Storage foreign key. They may be applied
   and left installed while bucket provisioning is pending. Keep image writes off.
4. Run the SELECT-only 03 file to record existing bucket configuration, table
   owners/RLS and complete policies. Confirm admin-images is absent and no policy
   authorizes browser access to it. Preserve the profile-photos baseline.
5. Dashboard: select the existing project -> Storage -> New bucket. Name/ID:
   admin-images. Public bucket: OFF. Allowed MIME types: image/jpeg, image/png,
   image/webp. Maximum size: 5 MiB (5242880 bytes). If restrictions are edited
   separately, set them before any uploads and before enabling admin image writes.
   Do not use a policy template, add an access policy, or change profile-photos.
6. Run the SELECT-only 03 file again. Require one admin-images row with public=false,
   file_size_limit=5242880 and exactly the three MIME types. Require profile-photos,
   table owners, RLS, and all existing policies to match the baseline. No new
   policy is expected. If the Dashboard workflow proposes broader permissions,
   cancel it and stop for review.
7. Before enabling image mutations, implement the protected admin routes and test
   upload, catalog listing, preview, metadata edit, replacement and deletion on
   designated disposable assets. Test signed-out/non-admin denial and direct
   browser Storage denial. These are separately approved live/staging operations,
   not part of the SQL installation. No tests against real user photos.

## Supported API alternative (instead of Dashboard)

A separately approved server-only provisioning operation may use the existing
Supabase SDK with the server service-role client and no browser session:

```ts
const { data, error } = await supabase.storage.createBucket('admin-images', {
  public: false,
  fileSizeLimit: 5242880,
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
});
```

This is a reference snippet, not an installed script or application endpoint.
Do not place a key in the browser/SQL editor/chat, print raw errors, or automatically
update an existing bucket on conflict. Dashboard provisioning is the preferred
manual path. If creation is denied, stop; do not change SQL ownership or grants.

## Verification and recovery

- If SQL 01 or 02 fails, stop and ROLLBACK the open failed transaction. Earlier
  committed files remain. On disconnect/uncertain completion, inspect objects
  before retrying. Do not rerun a committed file or use DROP CASCADE.
- Bucket creation is independent of both SQL transactions. A Dashboard/API failure
  does not roll back 01/02. Keep them installed and image writes off while resolving
  provisioning. After an ambiguous API timeout inspect bucket configuration before
  retrying; a collision is not permission to overwrite.
- If a newly provisioned empty bucket must be removed, first verify it is unused
  (no image catalog entries or objects) and obtain approval. Delete only that bucket
  through Dashboard/Storage API. Do not use SQL to delete storage metadata.
- A nonempty bucket requires separate content/references review. Never use emptyBucket
  or mass deletion as rollback. Do not remove profile-photos or change its policies.
- If unexpected broad policies are discovered, stop image rollout. No restrictive
  fence is installed by this plan; do not assume default deny still holds.

## Evidence and limits

Local PGlite tests model the confirmed scoped policy and a synthetic API-provisioned
bucket. They do not call the Storage service, prove Dashboard permissions, validate
binary files, or reproduce managed Storage ownership. Live verification of the
provisioning result is still required. Existing multi-client mix tests remain a
separate prerequisite before enabling production mix writes.

Official references:
- https://supabase.com/docs/guides/storage/buckets/creating-buckets
- https://supabase.com/docs/reference/javascript/file-buckets-createbucket
- https://supabase.com/docs/guides/storage/security/access-control
- https://supabase.com/docs/guides/storage/schema/design
