# GitHub / Vercel handoff — stop before remote changes

The local repository is independent of `../hello-world`. No remote repository or Vercel project has been created; no code has been pushed or deployed. No account access is assumed.

## Required approval and account access

Request explicit approval for each remote creation/push/deployment/configuration step. If GitHub or Vercel authentication is required, the owner must complete it. Do not reuse the original repo remote or its Vercel project. GitHub CLI and Vercel CLI were not available in the inspected shell; browser dashboards are a valid path after authorization.

## GitHub after approval

Create a new repository named **sage-nyc-admin** under the intended owner, preferably private, without adding a README/license/gitignore remotely. Inspect the local Git state and `.gitignore` first. Confirm no `.env.local`, Supabase service-role key, access token, or generated build file is tracked.

Then, only when approved, connect the new remote and push the new project's branch:

```sh
cd ~/IdeaProjects/sage-nyc-admin
git remote add origin https://github.com/haeah614/sage-nyc-admin.git
git push -u origin main
```

The remote creation itself is a separate action. Never run these commands in `hello-world`.

## Vercel after approval

Create a new Vercel project named **sage-nyc-admin**, importing only the new repository. Use the Next.js framework preset, project root `.`, `npm ci` install command, and `npm run build`. Keep the existing Hello-World project and settings unchanged. The superadmin column, Columbia and TA authorizations, and safe-delete RPC already exist; do not repeat bootstrap or grant authenticated flag access for deployment. The isolated server-side flag lookup requires service-role SELECT access.

Set these variables in the new project's appropriate environments (do not print the values):

| Variable | Exposure / purpose |
| --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | Existing Supabase project URL |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Publishable key; RLS applies |
| NEXT_PUBLIC_GOOGLE_CLIENT_ID | Existing approved Google web client |
| SUPABASE_SERVICE_ROLE_KEY | Server-only secret; never NEXT_PUBLIC |
| APP_ORIGIN | Exact admin HTTPS origin; no trailing slash |
| ADMIN_WRITES_ENABLED | Start with `false`; set `true` only after separate approval |

Do not add Google Places or Gemini keys. Preview deployments need their own exact `APP_ORIGIN` and approved Google origins/login URIs to perform authenticated mutations. A stable preview domain is easier to authorize than each random deployment hostname. Visiting a commit-specific URL does not automatically configure Google sign-in for that hostname.

The Google web client must include the new authorized JavaScript origin and its `/auth/callback` login URI, while preserving all existing app entries. The callback returns to the approved origin that received the Google POST, so commit-specific Vercel deployments retain their session cookies; `APP_ORIGIN` remains the canonical origin for mutation and sign-out checks. Verify the configured Supabase Google provider accepts that client ID. No existing Supabase site URL needs to be replaced for the ID-token callback architecture. All such production configuration changes require approval.

## Deployment Protection — new project only

After approval, open the **new `sage-nyc-admin` project** in Vercel Settings → Deployment Protection. Disable its Vercel Authentication protection and any separately enabled password/trusted-IP restriction that would prevent public reachability. Verify the resulting setting in the dashboard rather than assuming a default. Do not change Hello-World protection settings.

Public reachability must still yield `/login` for signed-out admin pages and 401 for admin APIs. Google-authenticated ordinary users must be denied, while both the Columbia and TA superadmins can access data. Vercel protection is an outer hosting gate; it is not a replacement for the application checks.

## Verify before declaring the assignment complete

Follow `docs/validation.md`, using two real Google identities (one ordinary account and the verified admin), and keep writes disabled initially. Check both the canonical production domain and the specific deployment URL. Approve and run staging/designated-record CRUD tests separately, including vote/bookmark preservation and existing-app regression checks.

## Latest commit-specific URLs

These have **not** been verified and must not be fabricated. The known existing production alias is `https://hello-world-haeah614.vercel.app`; it is not a commit-specific URL. The original local HEAD is `1223b6d78560df1d47fb4e9dde24bc179d0e32aa`, but that alone does not prove the newest remote deployment.

For **each** app, use read-only Vercel deployment history after account access is available. Select the latest successful deployment for the intended branch, record its exact Git commit SHA from deployment metadata, and copy its immutable deployment URL. For the existing app this is inspection only: do not redeploy, change its protection, or trigger a new build. For the new app, first complete the separately approved push/deploy flow.

| Application | Commit | Immutable deployment URL | Status |
| --- | --- | --- | --- |
| Existing SAGE NYC | Local reference: `1223b6d78560df1d47fb4e9dde24bc179d0e32aa` | Pending read-only Vercel verification | Existing project untouched |
| SAGE NYC Admin | Record approved deployed commit | Not yet available | No remote project/deployment created |
