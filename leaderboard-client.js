const API_BASE = "https://hapkek-leaderboard.kelbrictech.workers.dev";
function getPlayerIdentity() {
  let playerId = localStorage.getItem("hapkek_player_id");
  if (!playerId) { playerId = crypto.randomUUID(); localStorage.setItem("hapkek_player_id", playerId); }
  let displayName = localStorage.getItem("hapkek_player_name");
  if (!displayName) { displayName = `Chef-${playerId.slice(0,4).toUpperCase()}`; localStorage.setItem("hapkek_player_name", displayName); }
  return { playerId, displayName };
}
async function submitHapkekScore({ gameId, elapsedMs }) {
  const { playerId, displayName } = getPlayerIdentity();
  const response = await fetch(`${API_BASE}/api/scores`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({gameId,playerId,displayName,elapsedMs}) });
  const body = await response.json(); if (!response.ok) throw new Error(body.error || "Score submission failed"); return body;
}
async function getHapkekLeaderboard(period="daily") {
  if (!["daily","weekly","alltime"].includes(period)) throw new Error("Invalid leaderboard period");
  const { playerId } = getPlayerIdentity(); const url = new URL(`${API_BASE}/api/leaderboard`);
  url.searchParams.set("period",period); url.searchParams.set("playerId",playerId);
  const response = await fetch(url,{cache:"no-store"}); const body=await response.json();
  if (!response.ok) throw new Error(body.error || "Leaderboard request failed"); return body;
}
export { getPlayerIdentity, submitHapkekScore, getHapkekLeaderboard };
