const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store"
};
const reply = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" }
});
const validId = value => typeof value === "string" && /^[a-f0-9-]{20,40}$/i.test(value);
const cleanName = value => String(value || "").replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, 20);
const periods = {
  daily: "date(created_at, '+8 hours') = date('now', '+8 hours')",
  weekly: "date(created_at, '+8 hours') >= date('now', '+8 hours', '-' || ((CAST(strftime('%w','now','+8 hours') AS INTEGER)+6)%7) || ' days')",
  alltime: "1=1"
};
async function getBoard(env, period, playerId) {
  const sql = `WITH attempts AS (
    SELECT player_id, display_name, elapsed_ms, created_at,
      ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY elapsed_ms ASC, created_at ASC) AS personal_rank
    FROM hapkek_scores WHERE ${periods[period]}
  ), best AS (
    SELECT player_id, display_name, elapsed_ms AS best_ms, created_at AS achieved_at
    FROM attempts WHERE personal_rank = 1
  ), ranked AS (
    SELECT player_id, display_name, best_ms, achieved_at,
      ROW_NUMBER() OVER (ORDER BY best_ms ASC, achieved_at ASC, player_id ASC) AS rank,
      COUNT(*) OVER () AS total_players
    FROM best
  )
  SELECT player_id, display_name, best_ms, achieved_at, rank, total_players
  FROM ranked WHERE rank <= 3 OR player_id = ? ORDER BY rank LIMIT 4`;
  const result = await env.DB.prepare(sql).bind(playerId || "").all();
  const rows = result.results || [];
  return { period, top: rows.filter(row => row.rank <= 3),
    you: rows.find(row => row.player_id === playerId) || null,
    totalPlayers: rows[0]?.total_players || 0, timezone: "Asia/Manila" };
}
export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    if (url.pathname === "/health") return reply({ ok: true, service: "hapkek-leaderboard" });
    if (url.pathname === "/api/scores" && request.method === "POST") {
      let body;
      try { body = await request.json(); } catch { return reply({ error: "Invalid JSON" }, 400); }
      const gameId = body?.gameId, playerId = body?.playerId;
      const displayName = cleanName(body?.displayName), elapsedMs = Number(body?.elapsedMs);
      if (!validId(gameId) || !validId(playerId) || displayName.length < 2 ||
          !Number.isInteger(elapsedMs) || elapsedMs < 100 || elapsedMs > 3600000)
        return reply({ error: "Invalid score submission" }, 400);
      try {
        const result = await env.DB.prepare(
          "INSERT OR IGNORE INTO hapkek_scores (game_id, player_id, display_name, elapsed_ms) VALUES (?, ?, ?, ?)"
        ).bind(gameId, playerId, displayName, elapsedMs).run();
        if (!result.meta?.changes) return reply({ error: "This game result was already submitted" }, 409);
        return reply({ ok: true, saved: true }, 201);
      } catch { return reply({ error: "Could not save score" }, 500); }
    }
    if (url.pathname === "/api/leaderboard" && request.method === "GET") {
      const period = url.searchParams.get("period") || "daily";
      const playerId = url.searchParams.get("playerId") || "";
      if (!periods[period] || (playerId && !validId(playerId)))
        return reply({ error: "Invalid leaderboard request" }, 400);
      try { return reply(await getBoard(env, period, playerId)); }
      catch { return reply({ error: "Could not load leaderboard" }, 500); }
    }
    return reply({ error: "Not found" }, 404);
  }
};
