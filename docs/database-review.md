# Read-only architecture review

## Evidence

The original repository is `/Users/haeah/IdeaProjects/hello-world`, at commit `1223b6d78560df1d47fb4e9dde24bc179d0e32aa`. Its tracked files and Git status were clean at the initial inspection. Source inspections covered migrations, Supabase clients/proxy, GIS login/callback, generation inserts, voting, saved places, profile updates/photos, coordinate persistence, community feed, and category mapping.

A read-only authenticated Supabase REST OpenAPI inspection confirmed the live table/column shapes for `profiles`, `plans`, `generations`, `votes`, `saved_places`, and `movies`. No production row contents were exported. The live schema includes plan coordinates but no `is_superadmin` field. The repository lacks the coordinate migration; this discrepancy is recorded rather than inventing a migration.

REST schema inspection does **not** prove live grants, policies, trigger bodies, or all foreign keys match the repository. `supabase/00-inspect-read-only.sql` supplies the catalog queries needed for manual verification. Production compatibility remains conditional on reviewing those results.

## Tables and boundaries

| Table | Relevant shape | Existing source-defined boundary |
| --- | --- | --- |
| profiles | Auth UUID PK, first/last name, avatar path, creation time | Owner-only reads/updates; column-specific SELECT and UPDATE grants |
| generations | UUID, owner Auth UUID, prompt, constraints JSON, provider/model, creation time | Owner-only reads/inserts/deletes |
| plans | UUID, generation/owner, title, description, `why_it_fits`, place ID/name/address/types/rating/reviews/price/URL, coordinates, creation time | Public selected recommendation fields; owner inserts/deletes |
| votes | UUID, owner UUID, plan UUID, ±1, creation time; unique user/plan | Owner-only individual reads/writes; public aggregate RPCs |
| saved_places | User/plan composite PK, creation time | Private owner-only bookmarks |
| movies | ID/title/year | Existing public read-only catalogue; untouched |

SAGE Notes are `plans.why_it_fits` (1–350 characters). Titles allow 1–100, descriptions 1–280. Plans require an existing generation and matching owner via `plans_generation_owner_fk`. Ratings are stored Google Places ratings (0–5), not separate user ratings. Nullable review counts and price levels retain their existing constraints. Coordinates exist live and are preserved on edit.

The original generation handler authenticates, fetches Google Places candidates, asks Gemini for suggestions, inserts a generation, then inserts grounded plans with matching ownership and coordinates. The admin app does not reproduce these quota-consuming API calls. It imports an AI output record under a selected existing generation, preserving its owner/model history.

Existing Google login uses Google Identity Services redirect and Supabase `signInWithIdToken({ provider: 'google' })`. The admin app retains that architecture and adds GIS CSRF verification and database role authorization. Existing profile updates only change first name, last name, and avatar path. The public profile-photo bucket is reused for read-only avatars.

## Deletion consequences and chosen strategy

The migrations define `votes.plan_id` and `saved_places.plan_id` with **ON DELETE CASCADE**. A naive plan delete would destroy feedback and private bookmarks. Deleting a generation also cascades into its plans. Neither is acceptable as a silent admin action.

This app never deletes generations or users. Its delete endpoint calls only `admin_delete_unreferenced_plan` and has no direct DELETE fallback. The proposed RPC:

1. Rechecks the verified actor's admin flag and locks that profile for the transaction.
2. Locks the target plan `FOR UPDATE`.
3. Fails closed if it finds unknown referencing tables/columns or custom DELETE triggers on plans, votes, or saved places.
4. Rejects plans with any votes or saved places, returning a conflict to the interface.
5. Deletes only a plan with no such dependencies, leaving its generation intact.

The row lock conflicts with the key-share lock required by a concurrent foreign-key insertion. Under the normal READ COMMITTED transaction isolation, an earlier accepted reference is visible to the subsequent checks; an insert waiting behind deletion cannot create an orphan. Concurrent-client behavior still needs staging verification before enabling production writes. The UI dependency counts are informational; the transaction is authoritative.

Soft deletion was not selected because the original app has no archive filter. Adding an archive column alone would not hide archived recommendations, while changing its public query behavior would violate the requirement to preserve Week 5. Blocking unsafe deletion provides real DELETE for unreferenced records without changing the original app.

## Proposed shared changes

Only one authorization column, its owner-readable SELECT grant, a protected flag trigger, and a service-role-only safe-delete function are proposed. Existing RLS policies stay enabled and unchanged. The profile trigger blocks flag changes even if a future table-wide UPDATE grant accidentally weakens column privileges. It allows only database-administrator SQL roles to bootstrap/change flags; the runtime service role cannot edit them.

Review any existing SECURITY DEFINER routines from the preflight query. A separately deployed arbitrary privileged function could bypass intended SQL-role boundaries; source review and local tests cannot rule out unseen production routines. No schema changes have been applied.
