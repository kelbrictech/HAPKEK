# HAPKEK Japanese Cake — Game, Vouchers & RMS Source

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

## Deployment note — 22 November 2026

Cloudflare Pages project `hapkek-rms` now targets the repository `main` branch. Its build command no longer copies the retired Webmaster setup page. The RMS frontend build can be triggered from `main`; backend deployment and production D1 migrations remain separate release steps and must be verified before staff login or POS is declared live.

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
python3 tests/leaderboard_sql_test.py
python3 tests/gameplay_contract_test.py
python3 tests/leaderboard_sql_test.py --perf
```

The gameplay contract test checks that the requested code paths remain present; it is not a substitute for a real browser play-through. A full visual/touch-device test is still required before production deployment.