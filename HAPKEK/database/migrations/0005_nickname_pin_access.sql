-- HAPKEK v1 nickname + 4-digit PIN authentication.
-- Apply after 0004_rms_foundation.sql.
ALTER TABLE hapkek_staff_users ADD COLUMN must_change_pin INTEGER NOT NULL DEFAULT 1 CHECK (must_change_pin IN (0,1));
ALTER TABLE hapkek_staff_users ADD COLUMN failed_pin_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE hapkek_staff_users ADD COLUMN locked_until INTEGER NOT NULL DEFAULT 0;

-- Ana is the initial administrator. The supplied temporary PIN is stored only as
-- a PBKDF2-SHA256 hash; she must replace it at first login.
INSERT OR IGNORE INTO hapkek_staff_users
  (username, display_name, password_salt, password_hash, active, role, must_change_pin)
VALUES
  ('Ana', 'Ana', '033109072836787f234ca72248389de4',
   '9005c221564a861fc77aff0de3c66345039a20a8679c917e66d333080fe766c3', 1, 'admin', 1);

-- Anmer is seeded as a staff identity but cannot log in until Ana issues a
-- temporary PIN from the admin dashboard.
INSERT OR IGNORE INTO hapkek_staff_users
  (username, display_name, password_salt, password_hash, active, role, must_change_pin)
VALUES
  ('Anmer', 'Anmer', '00000000000000000000000000000000',
   '0000000000000000000000000000000000000000000000000000000000000000', 0, 'staff', 1);

CREATE INDEX IF NOT EXISTS idx_staff_pin_lock ON hapkek_staff_users(locked_until);

-- Ensure a pre-existing Ana account is promoted to the initial administrator
-- and receives the same one-time temporary PIN.
UPDATE hapkek_staff_users
SET display_name='Ana', password_salt='033109072836787f234ca72248389de4',
    password_hash='9005c221564a861fc77aff0de3c66345039a20a8679c917e66d333080fe766c3',
    active=1, role='admin', must_change_pin=1, failed_pin_attempts=0, locked_until=0
WHERE username='Ana' COLLATE NOCASE;

-- Ensure Anmer is present as a pending staff identity, not an enabled login.
UPDATE hapkek_staff_users SET display_name='Anmer', role='staff', active=0, must_change_pin=1
WHERE username='Anmer' COLLATE NOCASE;
