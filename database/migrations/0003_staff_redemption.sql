-- Staff authentication and auditable voucher redemption.
CREATE TABLE IF NOT EXISTS hapkek_staff_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS hapkek_staff_sessions (
  token_hash TEXT PRIMARY KEY,
  staff_id INTEGER NOT NULL REFERENCES hapkek_staff_users(id),
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_staff_sessions_expiry ON hapkek_staff_sessions(expires_at);
CREATE TABLE IF NOT EXISTS hapkek_voucher_redemptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  claim_id INTEGER NOT NULL UNIQUE REFERENCES hapkek_voucher_claims(id),
  staff_id INTEGER NOT NULL REFERENCES hapkek_staff_users(id),
  redeemed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
