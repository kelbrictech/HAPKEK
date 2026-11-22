from pathlib import Path
import re, sqlite3
root=Path(__file__).resolve().parents[1]
schema=(root/'database/schema.sql').read_text()
conn=sqlite3.connect(':memory:')
conn.executescript(schema)
for name in ('0002_vouchers.sql','0003_staff_redemption.sql','0004_rms_foundation.sql'):
    conn.executescript((root/'database/migrations'/name).read_text())
cols={r[1] for r in conn.execute('PRAGMA table_info(hapkek_staff_users)')}
assert 'role' in cols
assert conn.execute("SELECT role FROM hapkek_staff_users").fetchone() is None
conn.execute("INSERT INTO hapkek_staff_users(username,display_name,password_salt,password_hash,role) VALUES('owner','Owner','00','00','owner')")
assert conn.execute("SELECT role FROM hapkek_staff_users WHERE username='owner'").fetchone()[0]=='owner'
try:
    conn.execute("INSERT INTO hapkek_staff_users(username,display_name,password_salt,password_hash,role) VALUES('bad','Bad','00','00','root')")
    raise AssertionError('invalid role was accepted')
except sqlite3.IntegrityError:
    pass
worker=(root/'worker/index.js').read_text()
for route in ['/api/rms/overview','/api/rms/vouchers','/api/rms/audit']:
    assert route in worker, route
assert 'RMS_READ_ROLES.has(staff.role' in worker
assert 'voucher.redeemed' in worker
html=(root/'rms/index.html').read_text()
for label in ['Daily prize inventory','Voucher ledger','Recent audit activity']:
    assert label in html
print('RMS foundation test: PASS')
