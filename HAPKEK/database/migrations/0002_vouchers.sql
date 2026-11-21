-- Daily HAPKEK voucher pool: 100 total vouchers per Philippine calendar day.
-- Stock split mirrors the configured 90/7/2/1 prize weights.
CREATE TABLE IF NOT EXISTS hapkek_voucher_prizes (
  prize_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  weight INTEGER NOT NULL CHECK (weight > 0),
  daily_limit INTEGER NOT NULL DEFAULT 0 CHECK (daily_limit >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1))
);

INSERT OR IGNORE INTO hapkek_voucher_prizes (prize_id, label, weight, daily_limit, active) VALUES
  ('discount_2nd_box', '10% OFF on 2nd Box', 9000, 90, 1),
  ('free_1pc', 'Free 1-Pc Hapkek', 700, 7, 1),
  ('bogo_box', 'Buy 1 Get 1 Box Free', 200, 2, 1),
  ('free_1_box', 'Free 1 Box Hapkek', 100, 1, 1);

-- Also update existing rows if this migration was previously applied with zero stock.
UPDATE hapkek_voucher_prizes SET daily_limit=90, active=1 WHERE prize_id='discount_2nd_box';
UPDATE hapkek_voucher_prizes SET daily_limit=7, active=1 WHERE prize_id='free_1pc';
UPDATE hapkek_voucher_prizes SET daily_limit=2, active=1 WHERE prize_id='bogo_box';
UPDATE hapkek_voucher_prizes SET daily_limit=1, active=1 WHERE prize_id='free_1_box';

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
