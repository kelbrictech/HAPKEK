-- HAPKEK RMS foundation: role-based access and immutable operational audit events.
-- Apply after migrations 0002 and 0003.
ALTER TABLE hapkek_staff_users ADD COLUMN role TEXT NOT NULL DEFAULT 'staff'
  CHECK (role IN ('owner','admin','manager','staff'));

CREATE TABLE IF NOT EXISTS hapkek_rms_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_staff_id INTEGER REFERENCES hapkek_staff_users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_rms_audit_created ON hapkek_rms_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rms_audit_actor ON hapkek_rms_audit_logs(actor_staff_id, created_at DESC);
