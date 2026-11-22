# Copilot Handoff — HAPKEK RMS v1 Upload

## Objective
Upload the 43 source files supplied in this handoff to the existing GitHub repository `kelbrictech/HAPKEK`, committing only to the existing branch `rms/foundation-v1`.

This is a **source upload and branch commit only**. Do not deploy or change production resources.

## Required destination
- Repository: `kelbrictech/HAPKEK`
- Target branch: `rms/foundation-v1`
- Do not commit to `main`.
- Do not merge into `main`.
- Do not deploy a Worker, Pages site, or D1 migration.
- Do not add a public staff-login URL or navigation link on `kelbric.com`.

## Source files and paths
The source files are inside the `HAPKEK/` directory in this handoff. That outer directory is only the ZIP's packaging wrapper. **Do not create a nested `HAPKEK/HAPKEK/` directory in the repository.** Upload the contents of that folder into the repository root, retaining every path below it. For example:

- `HAPKEK/src/js/game.js` → `src/js/game.js`
- `HAPKEK/worker/index.js` → `worker/index.js`
- `HAPKEK/database/migrations/0005_nickname_pin_access.sql` → `database/migrations/0005_nickname_pin_access.sql`

There are 43 files, including two zero-byte `.gitkeep` placeholders. Use `UPLOAD_MANIFEST.txt` to verify paths and SHA-256 checksums. Preserve binary PNG files byte-for-byte. Preserve the relative folder structure and filenames exactly.

## Mandatory first steps
1. Fetch the latest repository state and inspect `AGENTS.md` on `rms/foundation-v1`. Follow all repository instructions. In particular, `AGENTS.md` requires consulting Google's Modern Web Guidance for browser-facing HTML, CSS, JavaScript, and browser API changes.
2. Confirm that `rms/foundation-v1` still exists and inspect its current HEAD. Do not assume the branch has not changed since this handoff was prepared.
3. Compare `rms/foundation-v1` with `main` and confirm the work will remain isolated to the target branch.
4. Inspect the existing canonical game and leaderboard implementation before adding or replacing any overlapping file.

## Important repository reconciliation rules
The repository already has live-leaderboard infrastructure. Do not treat this source archive as a replacement repository.

- Preserve the canonical game page `hapkek_memory_game_live_leaderboard.html` and its current gameplay, score submission, and leaderboard behavior. Do not overwrite or remove it. Review the supplied `index.html` and its linked assets/scripts before deciding how it should coexist with the canonical page.
- The repository already has a root `worker.js` and leaderboard client/schema files. The archive adds `worker/index.js`, which contains leaderboard plus voucher, staff, and RMS routes. Do not blindly replace the existing Worker or silently split/disable its endpoints. Reconcile the routes and confirm the configured Worker entry point deliberately.
- The archive's `README.md` overlaps with the repository's existing `README.md`. Merge the RMS documentation into the existing project documentation; do not discard the existing leaderboard documentation.
- Check whether root `.gitignore`, `wrangler.toml`, and other paths already exist. Merge or update deliberately rather than overwriting unrelated settings.
- `database/schema.sql` is the archive's baseline schema file. The repository also has a root `schema.sql`; inspect both and the current D1 schema before deciding which is authoritative. Do not overwrite or rename the root schema blindly.
- The archive contains migrations `0002`, `0003`, `0004`, and `0005`; it does not contain `0001`. Confirm the existing leaderboard schema is the expected baseline before describing migration readiness. Do not run migrations against live D1 as part of this task.
- The archive's `wrangler.toml` deliberately contains `REPLACE_WITH_D1_DATABASE_ID`. Do not invent a database ID or replace it with a guessed value. Do not run `wrangler deploy`.

## Security and configuration cautions
- Never commit real passwords, PINs, Worker secrets, API tokens, Cloudflare credentials, or `.dev.vars` files.
- `README.md` documents the initial Ana temporary PIN as `8888`; migration `0005_nickname_pin_access.sql` stores the corresponding PBKDF2 hash. Treat this as a known bootstrap credential, not a production secret. Do not deploy or expose a live login using this default. Before any production release, replace this bootstrap method with a securely provisioned, one-time administrator PIN and require immediate change. The `WEBMASTER_RECOVERY_TOKEN` must be configured as a Worker secret, never placed in browser code or Git.
- The public staff/RMS routes must remain protected by server-side role checks and session validation. Do not rely on hiding UI controls as authorization.
- Keep `staff-app/` and `rms/` as source assets only. Do not publish, link, or deploy a staff login during this commit task.

## Validation
The seven Python tests in `tests/` were run from the extracted source folder on 22 November 2026. All passed:

- `tests/gameplay_contract_test.py`
- `tests/leaderboard_sql_test.py`
- `tests/nickname_pin_contract_test.py`
- `tests/rms_foundation_test.py`
- `tests/staff_redemption_contract_test.py`
- `tests/voucher_launch_test.py`
- `tests/voucher_sql_test.py`

Re-run all seven after uploading/merging. Also inspect the final diff for missing assets, incorrect paths, dropped leaderboard behavior, credentials, and accidental production configuration. These source-contract tests are not proof of live D1 compatibility or browser/device functionality.

## Commit and verification
1. Stage only the reviewed files needed for this RMS v1 source upload on `rms/foundation-v1`.
2. Create one clearly named commit, e.g. `Add HAPKEK RMS v1 foundation`.
3. Verify the commit SHA and confirm the branch HEAD points to it.
4. Compare the target branch with `main`; ensure `main` was not changed and no deployment occurred.
5. Report the commit SHA, files added/updated, any files intentionally merged or withheld, test results, and unresolved blockers.

Stop after the verified branch commit. Do not merge or deploy.
