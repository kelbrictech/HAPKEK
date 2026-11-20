CREATE TABLE IF NOT EXISTS hapkek_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL UNIQUE,
  player_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  elapsed_ms INTEGER NOT NULL CHECK (elapsed_ms BETWEEN 100 AND 3600000),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_hapkek_scores_player_time ON hapkek_scores(player_id, elapsed_ms);
CREATE INDEX IF NOT EXISTS idx_hapkek_scores_created ON hapkek_scores(created_at);
