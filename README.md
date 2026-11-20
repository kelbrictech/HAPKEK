# HAPKEK Japanese Cake — Memory Game

## Live leaderboard

The game stores completed runs in Cloudflare D1 through the deployed Worker API.

- Daily: fastest personal result for each player today, using Asia/Manila calendar dates.
- Weekly: fastest personal result for each player since Monday 00:00 Asia/Manila.
- All-time high: each player's fastest recorded result.
- Each view returns the top three and the current player's rank.
- Duplicate game submissions are rejected by a unique game ID.

## Infrastructure

- Cloudflare Worker: `hapkek-leaderboard`
- API base: `https://hapkek-leaderboard.kelbrictech.workers.dev`
- D1 database: `hapkek-leaderboard`
- D1 binding: `DB`
- Database table: `hapkek_scores`

### API

- `GET /health`
- `GET /api/leaderboard?period=daily|weekly|alltime&playerId=<id>`
- `POST /api/scores` with JSON `{ gameId, playerId, displayName, elapsedMs }`

The frontend persists a player ID and display name in local storage. The server validates payload shape, time range, and duplicate game IDs. Since a browser reports its own completion time, this is a casual game leaderboard and is not cheat-proof against a determined client.

## Database

The schema is in `schema.sql`. The deployed Worker source is in `worker.js`.

## Local game

Open the self-contained game HTML in a modern browser. The current UI calls the live API above. For a public release, host the game on HTTPS so browser fetch and share features work consistently.
