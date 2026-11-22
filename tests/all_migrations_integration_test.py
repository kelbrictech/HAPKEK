import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
db = sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys = ON")

# Mirror the currently deployed baseline: the leaderboard score schema is present.
db.executescript((root / "database" / "schema.sql").read_text())

# Apply only the ordered RMS and POS migrations, exactly as a first deployment would.
for number in ("0002", "0003", "0004", "0005", "0006"):
    migration = root / "database" / "migrations" / f"{number}_" 
    matches = list((root / "database" / "migrations").glob(f"{number}_*.sql"))
    if len(matches) != 1:
        raise AssertionError(f"Expected exactly one migration {number}, found {len(matches)}")
    db.executescript(matches[0].read_text())

# Voucher stock must equal the announced 100-voucher daily pool.
prizes = dict(db.execute("SELECT prize_id, daily_limit FROM hapkek_voucher_prizes"))
assert prizes == {
    "discount_2nd_box": 90,
    "free_1pc": 7,
    "bogo_box": 2,
    "free_1_box": 1,
}, prizes
assert sum(prizes.values()) == 100

# First administrator and staff identity must be disabled until securely provisioned.
users = {name: (active, role, must_change) for name, active, role, must_change in db.execute(
    "SELECT username, active, role, must_change_pin FROM hapkek_staff_users"
)}
assert users["Ana"] == (0, "admin", 1), users
assert users["Anmer"] == (0, "staff", 1), users

# Simulate provisioning Ana using the generated upsert statement shape.
db.execute("""
INSERT INTO hapkek_staff_users
(username,display_name,password_salt,password_hash,active,role,must_change_pin,failed_pin_attempts,locked_until)
VALUES('Ana','Ana','aabbccddeeff00112233445566778899',?,1,'admin',1,0,0)
ON CONFLICT(username) DO UPDATE SET
display_name=excluded.display_name,password_salt=excluded.password_salt,
password_hash=excluded.password_hash,active=1,role=excluded.role,
must_change_pin=1,failed_pin_attempts=0,locked_until=0
""", ("c" * 64,))
ana = db.execute("SELECT active, role, must_change_pin FROM hapkek_staff_users WHERE username='Ana'").fetchone()
assert ana == (1, "admin", 1), ana

# POS constraints and schema should be present after the complete migration path.
tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
assert "hapkek_pos_sales" in tables
assert "hapkek_pos_sale_items" in tables
assert "hapkek_voucher_claims" in tables
assert "hapkek_staff_sessions" in tables
assert db.execute("PRAGMA foreign_key_check").fetchall() == []

print("Full baseline + RMS + POS migration sequence: PASS (0002–0006)")
