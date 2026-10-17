# Database setup status — shared changes require approval

The owner confirmed that `public.profiles.is_superadmin BOOLEAN NOT NULL DEFAULT FALSE` exists. Both their Columbia account and the TA account are TRUE and have superadmin access. Authenticated SELECT/UPDATE and anonymous UPDATE on the column are denied.

The admin application now uses a separate server-only service-role client for a one-column lookup after verifying the Google user. It does not require an authenticated SELECT grant, any profile UPDATE grant, a new column, or another bootstrap. No SQL was executed against Supabase during this code-only fix.

The owner also confirmed installation of `public.admin_delete_unreferenced_plan(uuid,uuid)`, with EXECUTE allowed for `service_role` and denied for `authenticated`, `anon`, and `PUBLIC`. No RPC installation is currently pending. Database owners/superusers retain administrative powers.

## Remaining read-only review

Use `supabase/00-inspect-read-only.sql` to review live grants, RLS policies, foreign keys, triggers, and SECURITY DEFINER functions. Confirm:

- The service role can read the flag and the required admin data.
- Ordinary users cannot set the flag through INSERT, UPDATE, or privileged routines.
- Existing owner profile editing remains limited to the intended fields.
- The installed safe-delete RPC body and live dependencies match the reviewed implementation. Installation and application-role execution permissions have already been confirmed by the owner; concurrent deletion behavior still needs staging verification.

## Historical SQL proposals

`supabase/01-admin-security.sql` includes column creation, an authenticated SELECT grant, a flag-protection trigger, and a safe-delete RPC. It is not a migration required by the new lookup. Do not run the whole proposal merely to fix login: the column already exists and its SELECT grant is unnecessary. Review any remaining trigger/RPC work separately and obtain explicit approval before shared changes.

`supabase/02-bootstrap-one-user.sql` is retained as a historical proposal. Authorization for the Columbia and TA accounts is already complete; do not rerun bootstrap or change flags as part of this fix. Neither SQL file was modified by the code-only fix. Tests execute them only in disposable synthetic in-memory PostgreSQL fixtures.

## Keep shared writes off pending approval

Keep admin writes disabled until live security and deletion dependencies have been reviewed and changes explicitly approved. The application still requires same-origin JSON and the writes-enable flag for recommendation mutations. Deletion has no direct DELETE fallback if the guarded RPC is missing.

Prefer staging for approved CRUD and multi-connection deletion tests. Never remove real votes or bookmarks to unblock deletion. Any shared test-record creation, edits, or cleanup requires explicit approval.

## Revocation

No role-editing UI exists. The database owner can revoke access through a separately approved database action. Subsequent requests re-read the flag without caching authorization. Do not weaken column permissions or remove flag protections to resolve a login failure.
