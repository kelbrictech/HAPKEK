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


-- Daily HAPKEK voucher pool. Set daily_limit to the actual number of each
-- voucher available per Philippine calendar day before enabling the campaign.
CREATE TABLE IF NOT EXISTS hapkek_voucher_prizes (
  prize_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  weight INTEGER NOT NULL CHECK (weight > 0),
  daily_limit INTEGER NOT NULL DEFAULT 0 CHECK (daily_limit >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1))
);

INSERT OR IGNORE INTO hapkek_voucher_prizes (prize_id, label, weight, daily_limit, active) VALUES
  ('discount_2nd_box', '10% OFF on 2nd Box', 9000, 0, 1),
  ('free_1pc', 'Free 1-Pc Hapkek', 700, 0, 1),
  ('bogo_box', 'Buy 1 Get 1 Box Free', 200, 0, 1),
  ('free_1_box', 'Free 1 Box Hapkek', 100, 0, 1);

CREATE TABLE IF NOT EXISTS hapkek_voucher_claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voucher_code TEXT NOT NULL UNIQUE,
  player_id TEXT NOT NULL,
  prize_id TEXT NOT NULL REFERENCES hapkek_voucher_prizes(prize_id),
  claim_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  redeemed_at TEXT,
  UNIQUE (player_id, claim_date)
);
CREATE INDEX IF NOT EXISTS idx_hapkek_vouchers_daily_prize
  ON hapkek_voucher_claims(claim_date, prize_id);
CREATE INDEX IF NOT EXISTS idx_hapkek_vouchers_player_day
  ON hapkek_voucher_claims(player_id, claim_date);
