# HAPKEK Japanese Cake: Memory Game

A tap-and-remember promo game for HAPKEK street-food cakes. Six cakes hide the letters H-A-P-K-E-K. Find them in order, as fast as you can.

## Project layout

```
index.html              Game page (SVG scene + modal markup)
src/css/styles.css      Layout, theme, modal, leaderboard styles
src/css/animations.css  Cake flip, fades, transitions
src/js/storage.js       localStorage with in-memory fallback
src/js/player.js        Anonymous player ID and display name
src/js/leaderboard.js   Score submission, leaderboard modal
src/js/game.js          Board logic, timer, win sequence, coupon, share
assets/images/          Artwork (PNG): background, brand-lockup, lantern, chef-mascot, final-cakes
assets/audio/, fonts/   Reserved (empty)
worker/index.js         Cloudflare Worker API (leaderboard)
database/schema.sql     Cloudflare D1 table
wrangler.toml           Worker config (set database_id before deploying)
tests/                  Tests
```

Scripts are plain `<script>` files that share one `window.HAPKEK` object, so the game also runs when `index.html` is opened directly from a folder. Load order in `index.html` matters: storage, player, leaderboard, game.

## Run the game locally

Open `index.html` in a modern browser. The images must be present in `assets/images/`. For a public release, host over HTTPS (the share button and clipboard need it).

## Leaderboard API

Cloudflare Worker `hapkek-leaderboard` with D1 database `hapkek-leaderboard` (binding `DB`, table `hapkek_scores`).

- `GET /health`
- `GET /api/leaderboard?period=daily|weekly|alltime&playerId=<id>`
- `POST /api/scores` with `{ gameId, playerId, displayName, elapsedMs }`

Daily and weekly boards use Asia/Manila dates; weeks start Monday 00:00. Each view returns the top three plus the current player's rank. Duplicate `gameId` submissions are rejected.

The browser reports its own completion time, so this is a casual-game leaderboard and is not cheat-proof.

## Gameplay responsiveness and reliability

- Correct selections advance immediately; they are not blocked by the flip animation.
- The cake reveal animation is 150 ms. Incorrect selections remain visible briefly before the board resets.
- The timer starts at the first pointer/keyboard input and stops at the final correct input timestamp, excluding the victory animation.
- Cake input uses pointer-down for touch/mouse responsiveness and retains Enter/Space keyboard support.
- Score submissions are queued in browser storage before sending. Failed submissions retry with backoff, on reconnect, and when the tab becomes visible. A duplicate-response (HTTP 409) is treated as confirmation that an earlier attempt was already saved.

## Tests

```
python3 tests/leaderboard_sql_test.py          # ranking correctness against an independent model
python3 tests/gameplay_contract_test.py        # timing, pointer input and retry regression checks
python3 tests/leaderboard_sql_test.py --perf   # adds a 200,000-score timing run
```

The gameplay contract test checks that the requested code paths remain present; it is not a substitute for a real browser play-through. A full visual/touch-device test is still required before production deployment.

The test loads the real SQL from `worker/index.js`. It runs against in-memory SQLite, not the live database.

## Status

- Gameplay, leaderboard UI, share button: built.
- QR coupon: demo only. It is generated in the browser and is not a real discount entitlement.
- Live Worker, D1 binding and end-to-end play on devices: not verified in this repo.


### Real voucher campaign start

Real voucher issuance is disabled until **22 November 2026 at 9:00 AM Asia/Manila**. The Cloudflare Worker enforces this with its server clock; changing the visitor's device clock cannot open the campaign early. The configured daily pool continues to reset at 00:00 Asia/Manila after launch.

## Daily voucher gacha

The Worker issues one server-side voucher claim per player ID per Asia/Manila calendar day. This is a per-player-ID limit, not verified real-world identity; clearing browser storage or using another device can create another player ID. Repeated requests return the same voucher. A claim is never rerolled by repeated clicks. The daily pool closes when every configured prize category reaches its `daily_limit`, and the next pool begins at 00:00 Asia/Manila.

### Prize weights

- 10% OFF on 2nd Box: 9000 / 10000 (90.00%)
- Free 1-Pc Hapkek: 700 / 10000 (7.00%)
- Buy 1 Get 1 Box Free: 200 / 10000 (2.00%)
- Free 1 Box Hapkek: 100 / 10000 (1.00%)

If a prize category sells out before the others, its weight is redistributed proportionally among the categories that still have stock. Once all categories are exhausted, no more vouchers are issued that day.

### Daily stock allocation

The daily pool contains exactly 100 vouchers:

| Prize | Daily stock |
|---|---:|
| 10% OFF on 2nd Box | 90 |
| Free 1-Pc Hapkek | 7 |
| Buy 1 Get 1 Box Free | 2 |
| Free 1 Box Hapkek | 1 |
| **Total** | **100** |

The migration both seeds these limits and updates existing prize rows, including rows previously initialized at zero. Once all 100 claims have been issued, the endpoint stops issuing vouchers until 00:00 Asia/Manila. The daily stock resets by claim date; the campaign's first real issuance remains gated until 22 November 2026 at 09:00 Asia/Manila.


## Staff voucher redemption app and nickname/PIN access

The staff app is mobile-first and hosted over HTTPS. Login uses a seeded nickname dropdown (no free-text username) and a 4-digit PIN. The initial directory contains **Ana** (administrator) and **Anmer** (staff). Anmer is seeded as pending and cannot log in until Ana issues access.

Apply migrations `0002_vouchers.sql`, `0003_staff_redemption.sql`, `0004_rms_foundation.sql`, then `0005_nickname_pin_access.sql` to the same D1 database. Migration 0005 provisions Ana with the one-time temporary PIN `8888` (stored only as a PBKDF2-SHA256 hash) and marks her to change it at first login. Ana's first login must be followed by choosing a new 4-digit PIN.

Ana's RMS dashboard includes **Staff access**. She selects an existing nickname such as Anmer and assigns a temporary 4-digit PIN. The staff member logs in with that nickname and temporary PIN, then must nominate a permanent PIN before using the scanner. Ana can reissue a temporary PIN to unlock/reset a staff member; this invalidates the staff member's previous sessions. The initial dashboard dropdown is seeded with Anmer. Additional nicknames can be provisioned as staff records through the protected RMS API when needed.

PINs are PBKDF2-HMAC-SHA256 hashes with 210,000 iterations and random salts. Five failed attempts trigger a 15-minute lockout. Sessions are HttpOnly, Secure, SameSite=Strict cookies with a 12-hour lifetime. PIN changes invalidate other sessions. The server enforces roles and the forced PIN-change state; client-side visibility is not an authorization boundary.

**Webmaster recovery:** set a strong `WEBMASTER_RECOVERY_TOKEN` Worker secret. The protected backend-only `POST /api/webmaster/recovery/temporary-pin` endpoint accepts a 4-digit `temporaryPin` with `Authorization: Bearer <secret>`, resets Ana's account, invalidates her sessions and forces a PIN change at next login. Never place this token in browser code or commit it to Git.

The scanner supports camera QR scanning and manual voucher-code entry. Camera access requires HTTPS and user permission. Set `STAFF_APP_ORIGIN` to the exact HTTPS origin serving the staff and RMS interfaces (or serve both from the same origin); configure the app API constants if the Worker is hosted elsewhere.

## HAPKEK RMS foundation (v1)

The first RMS release is an operations console for the existing shared game/voucher backend. It does not yet include POS, product inventory, supplier purchasing, CRM, payment processing, or omnichannel integrations.

### RMS v1 includes

- `rms/`: owner/administrator/manager dashboard for today's game submissions, voucher issuance/redemption counts, daily prize allocation, voucher ledger, and recent audit activity.
- `staff-app/`: staff voucher scanner and redemption interface.
- Shared Worker API and D1 records; RMS does not maintain a separate voucher database.
- Staff roles: `admin` and `staff` are the active v1 roles; the schema retains `owner` and `manager` for later expansion. Management reporting is server-authorized; staff retain scanner access only.
- Migration `database/migrations/0004_rms_foundation.sql`: staff role column and RMS audit log.
- Migration `database/migrations/0005_nickname_pin_access.sql`: Ana/Anmer seed accounts, hashed temporary PIN, forced PIN change, failed-attempt lockout fields.

### Apply and configure

Apply migrations in order to the same D1 database used by the game:

1. `0002_vouchers.sql`
2. `0003_staff_redemption.sql`
3. `0004_rms_foundation.sql`
4. `0005_nickname_pin_access.sql`

Create an owner account (use a password manager and do not share the password):

`node scripts/create_staff_user.mjs <username> <display-name> <password> owner`

The script prints SQL for execution against the production D1 database. Keep the generated password private. Additional staff accounts can be created with the `admin`, `manager`, or `staff` role.

Host `rms/` and `staff-app/` over HTTPS. Configure `window.HAPKEK_RMS_API` in `rms/index.html` and `window.HAPKEK_STAFF_API` in `staff-app/index.html` to the Worker origin when hosted on a different origin. Set `STAFF_APP_ORIGIN` to the exact origin used by both apps (if they share an origin). The Worker must be deployed with the D1 binding pointing at the same database used by the game.

### Current RMS limits

- Dashboard metrics are based on existing game score submissions and voucher records; they are not POS sales or revenue.
- Voucher list is capped at the most recent 100 records per request.
- The dashboard is read-only. Prize allocations are deliberately not editable from the web UI in v1.
- POS, product stock, supplier purchasing, CRM, payment integrations, shift management, and online storefront synchronization are future modules.
- This package is a build artifact; live deployment, production D1 migration, real staff login, and end-to-end browser verification must be completed before launch.
