-- HAPKEK v1 nickname + 4-digit PIN authentication.
-- Ana and Anmer are seeded as disabled identities. No shared/default PIN is created.
-- Provision the first administrator with scripts/create_staff_user.mjs before enabling login.
ALTER TABLE hapkek_staff_users ADD COLUMN must_change_pin INTEGER NOT NULL DEFAULT 1 CHECK (must_change_pin IN (0,1));
ALTER TABLE hapkek_staff_users ADD COLUMN failed_pin_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE hapkek_staff_users ADD COLUMN locked_until INTEGER NOT NULL DEFAULT 0;

INSERT OR IGNORE INTO hapkek_staff_users
  (username, display_name, password_salt, password_hash, active, role, must_change_pin)
VALUES
  ('Ana', 'Ana', '00000000000000000000000000000000',
   '0000000000000000000000000000000000000000000000000000000000000000', 0, 'admin', 1);

INSERT OR IGNORE INTO hapkek_staff_users
  (username, display_name, password_salt, password_hash, active, role, must_change_pin)
VALUES
  ('Anmer', 'Anmer', '00000000000000000000000000000000',
   '0000000000000000000000000000000000000000000000000000000000000000', 0, 'staff', 1);

-- Keep the seeded identities disabled until an operator provisions a one-time PIN.
UPDATE hapkek_staff_users
SET display_name='Ana', active=0, role='admin', must_change_pin=1,
    failed_pin_attempts=0, locked_until=0
WHERE username='Ana' COLLATE NOCASE;

UPDATE hapkek_staff_users
SET display_name='Anmer', active=0, role='staff', must_change_pin=1,
    failed_pin_attempts=0, locked_until=0
WHERE username='Anmer' COLLATE NOCASE;

CREATE INDEX IF NOT EXISTS idx_staff_pin_lock ON hapkek_staff_users(locked_until);
