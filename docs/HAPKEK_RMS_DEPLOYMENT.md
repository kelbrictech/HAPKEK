# HAPKEK RMS deployment

Cloudflare Pages project: `hapkek-rms`
Production branch: `rms/foundation-v1`
Dashboard: `https://rms.kelbric.com/`
Staff voucher scanner: `https://rms.kelbric.com/staff-app/`
API: `https://api.kelbric.com`
Game build: `https://rms.kelbric.com/game/` (embedded at `https://kelbric.com/games/hapkek/`)

The Pages build publishes the RMS dashboard at the site root and the staff scanner under `/staff-app/`. It does not publish the game entrypoint and does not change the existing `kelbric.com` Pages project.

The API runs in the existing `hapkek-leaderboard` Worker and keeps the existing game score and leaderboard routes. Production D1 migrations `0002` through `0006` were applied in order to the existing HAPKEK database.

The Pages build command copies the RMS and staff app static files into the Pages output directory and sets both browser API origins to `https://api.kelbric.com`. The Worker allows authenticated cookie requests only from `https://rms.kelbric.com`.

Initial staff provisioning is a separate secure operation: Ana's account receives a one-time PIN; Ana changes it at first login, then issues Anmer's temporary PIN from the RMS staff access screen. Do not place either PIN in repository files or chat logs.

## Webmaster first-run activation

The first-run setup page is available at `https://rms.kelbric.com/webmaster-setup/`. It requires the one-time activation token supplied separately and the four-digit temporary PIN. The page sends the token in the Authorization header, strips it from the browser URL fragment after loading, and the API only provisions the account if no Webmaster identity exists. After activation, sign in at the RMS dashboard and replace the temporary PIN immediately.

## Webmaster controls

The RMS contains a Webmaster-only control panel. It is available only when the authenticated user is username `Webmaster` with role `owner`.

Provision the initial Webmaster account from a trusted machine with Node.js and Wrangler authenticated to the `kelbrictech` Cloudflare account:

```powershell
$env:HAPKEK_BOOTSTRAP_PIN = "<your four-digit temporary PIN>"
node scripts/provision_webmaster.mjs
Remove-Item Env:HAPKEK_BOOTSTRAP_PIN
```

The script hashes the PIN with PBKDF2-SHA256 (210,000 iterations), provisions the account in the configured remote D1 database, and requires a PIN change at first login. The PIN is never committed to the repository or printed by the dedicated bootstrap script.

Webmaster controls:
- **Export current state** downloads JSON operational data (scores, prize inventory, vouchers, staff status, POS transactions and audit events). It deliberately excludes PIN hashes, PIN salts, sessions and API secrets.
- **Master Reset Staff Access** requires typing `RESET STAFF ACCESS`. It disables all non-Webmaster staff identities, revokes their sessions, and records an audit event. It does not delete scores, voucher claims, redemptions, sales, sale items, prize stock or audit history.

The SQL savepoint created on 22 November 2026 is a separate pre-Webmaster backup. Restore it only into a separate or empty D1 database, never over a live database without an explicit recovery plan.
