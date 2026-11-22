-- HAPKEK RMS: retire the legacy Webmaster identity and normalize roles.
-- Operational records and audit events remain preserved.
UPDATE hapkek_rms_audit_logs
SET actor_staff_id = NULL
WHERE actor_staff_id IN (SELECT id FROM hapkek_staff_users WHERE username='Webmaster' COLLATE NOCASE);
DELETE FROM hapkek_staff_sessions
WHERE staff_id IN (SELECT id FROM hapkek_staff_users WHERE username='Webmaster' COLLATE NOCASE);
DELETE FROM hapkek_staff_users WHERE username='Webmaster' COLLATE NOCASE;
UPDATE hapkek_staff_users SET role='admin' WHERE role IN ('owner','manager');
