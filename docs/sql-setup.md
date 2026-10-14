# Manual SQL setup — approval required

None of these SQL files has been executed against Supabase. The automated suite executes them only against synthetic in-memory PostgreSQL fixtures.

## 1. Inspect, then approve

Open the existing project's Supabase SQL Editor and run **only** `supabase/00-inspect-read-only.sql`. It reads column definitions, RLS flags/policies, table/column grants, foreign keys, custom triggers, and SECURITY DEFINER functions. Confirm these match `docs/database-review.md`, especially:

- Profiles still have owner-only SELECT/UPDATE policies and the expected editable columns.
- Plans use the generation-owner composite FK; votes and saved places reference plans.
- RLS is enabled as expected; there are no unexpected privileged profile-writing functions.
- The default Supabase service role can perform server-side reads/writes on the existing tables.

Review the complete `supabase/01-admin-security.sql` proposal before granting explicit approval for its changes. It adds `is_superadmin boolean NOT NULL DEFAULT false` only if absent, grants authenticated sessions SELECT on that column under existing RLS, adds an INSERT/UPDATE protection trigger, and installs a safe-delete RPC executable only by `service_role`.

A column REVOKE does not negate a table-wide grant. The trigger is therefore essential: an ordinary user cannot insert a true flag or change a flag even if table privileges were accidentally broadened. Existing first/last name/avatar updates continue to work. RLS is never disabled or replaced.

After approval, manually run the entire `01-admin-security.sql` transaction in the SQL Editor as `postgres`. If any statement fails, roll back and investigate; do not enable writes or remove checks to make it pass.

## 2. Identify your existing account, without guessing

Sign in to the **existing** SAGE NYC app with your intended Google account. Verify your Supabase auth user UUID from that authenticated session's `auth.getUser()` result (existing profile page data also carries the current user ID), then compare it with the same user's record in Supabase **Authentication → Users**. Inspect its Google identity and verified status. Do not post a session token or credential in chat. Do not select a bootstrap target from an unverified email string.

No UUID has been filled into the bootstrap file. The app does not infer it, and no admin assignment happens during sign-in.

## 3. Explicitly authorize and run the one-time bootstrap

Only after verifying the UUID and separately approving admin access, open `supabase/02-bootstrap-one-user.sql`. Replace `REPLACE_WITH_VERIFIED_AUTH_USER_UUID` with that exact UUID. Review the complete statement and manually run it as the SQL Editor's `postgres` role.

It requires an existing Auth user with confirmed email and a Google identity whose email is verified. It updates exactly one existing profile by UUID, and aborts if no such profile exists. It neither creates accounts nor authorizes every existing user. The literal placeholder intentionally fails until replaced.

Verify with this read-only query, substituting the same UUID:

```sql
select id, is_superadmin
from public.profiles
where id = 'YOUR_VERIFIED_UUID'::uuid;
```

Sign in again to the admin app. A missing/false flag denies access. A missing column or failed authorization lookup produces an unavailable response, never a privileged fallback.

## 4. Keep writes off until separately approved

The initial app configuration is `ADMIN_WRITES_ENABLED=false`. Complete non-admin/Google access tests and inspect the live dependencies first. Production CRUD affects the same visible recommendations as the Week 5 app; it requires explicit permission even for an authorized administrator.

Prefer a staging copy for mutation and concurrency acceptance tests. If testing against the shared database is explicitly approved, designate the exact synthetic user/generation/plan IDs in advance and record every created ID. Never reuse real community records as tests. Preserve generation history and never remove dependencies to make a deletion test pass. Cleanup of any created shared records is also a production-data action requiring approval.

## Revocation

No role editing UI exists. The database owner can revoke access by setting the same verified profile's flag to false through a separately approved SQL action. Subsequent requests re-read the database flag. Do not drop the protection trigger while retaining an editable admin column. No rollback SQL is run automatically.
