from pathlib import Path
root = Path(__file__).parents[1]
worker = (root / "worker/index.js").read_text()
app = (root / "staff-app/staff.js").read_text()
sql = (root / "database/migrations/0003_staff_redemption.sql").read_text()
assert "/api/staff/login" in worker and "/api/staff/me" in worker
assert "/api/staff/redeem" in worker and "/api/staff/logout" in worker
assert "PBKDF2" in worker and "210000" in worker
assert "HttpOnly; Secure; SameSite=Strict" in worker
assert "UPDATE hapkek_voucher_claims SET redeemed_at" in worker
assert "UNIQUE" in sql and "hapkek_voucher_redemptions" in sql
assert "Html5Qrcode" in app and "credentials:\"include\"" in app
assert "already_redeemed" in worker
print("Staff login, session, QR scan, and one-time redemption contract checks passed.")
