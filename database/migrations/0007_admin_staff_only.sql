-- HAPKEK RMS: retire the legacy Webmaster identity and normalize roles.
-- Operational records and audit events remain preserved.
-- Keep historical POS and redemption rows valid by transferring only the
-- foreign-key owner to the seeded Ana admin identity. Preserve display names.
UPDATE hapkek_pos_sales
SET cashier_staff_id = (SELECT id FROM hapkek_staff_users WHERE username='Ana' COLLATE NOCASE)
WHERE cashier_staff_id IN (SELECT id FROM hapkek_staff_users WHERE username='Webmaster' COLLATE NOCASE)
  AND EXISTS (SELECT 1 FROM hapkek_staff_users WHERE username='Ana' COLLATE NOCASE);
UPDATE hapkek_voucher_redemptions
SET staff_id = (SELECT id FROM hapkek_staff_users WHERE username='Ana' COLLATE NOCASE)
WHERE staff_id IN (SELECT id FROM hapkek_staff_users WHERE username='Webmaster' COLLATE NOCASE)
  AND EXISTS (SELECT 1 FROM hapkek_staff_users WHERE username='Ana' COLLATE NOCASE);
UPDATE hapkek_rms_audit_logs
SET actor_staff_id = NULL
WHERE actor_staff_id IN (SELECT id FROM hapkek_staff_users WHERE username='Webmaster' COLLATE NOCASE);
DELETE FROM hapkek_staff_sessions
WHERE staff_id IN (SELECT id FROM hapkek_staff_users WHERE username='Webmaster' COLLATE NOCASE);
DELETE FROM hapkek_staff_users WHERE username='Webmaster' COLLATE NOCASE;
UPDATE hapkek_staff_users SET role='admin' WHERE role IN ('owner','manager');
CREATE TRIGGER IF NOT EXISTS hapkek_staff_role_insert_guard
BEFORE INSERT ON hapkek_staff_users
WHEN NEW.role NOT IN ('admin','staff')
BEGIN SELECT RAISE(ABORT, 'role must be admin or staff'); END;
CREATE TRIGGER IF NOT EXISTS hapkek_staff_role_update_guard
BEFORE UPDATE OF role ON hapkek_staff_users
WHEN NEW.role NOT IN ('admin','staff')
BEGIN SELECT RAISE(ABORT, 'role must be admin or staff'); END;
