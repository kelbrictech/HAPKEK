from pathlib import Path
import re
import subprocess

root=Path(__file__).resolve().parents[1]
worker=(root/"worker/index.js").read_text()
staff=(root/"staff-app/index.html").read_text()+(root/"staff-app/staff.js").read_text()
rms=(root/"rms/index.html").read_text()+(root/"rms/rms.js").read_text()
migration=(root/"database/migrations/0005_nickname_pin_access.sql").read_text()
script=(root/"scripts/create_staff_user.mjs").read_text()

checks={
 "Ana is seeded disabled": "('Ana', 'Ana'" in migration and "'admin', 1);" in migration and "WHERE username='Ana'" in migration and "active=0" in migration,
 "Anmer is seeded disabled": "('Anmer', 'Anmer'" in migration and "WHERE username='Anmer'" in migration,
 "migration has no shared default PIN hash": "9005c221564a861fc77aff0de3c66345039a20a8679c917e66d333080fe766c3" not in migration,
 "migration uses inactive identities": migration.count("active=0") >= 2,
 "4-digit PIN login validation": r'/^\\d{4}$/' in worker or r'/^\d{4}$/' in worker,
 "nickname directory endpoint": '"/api/staff/users"' in worker,
 "first-login PIN replacement": "must_change_pin=0" in worker and '"/api/staff/change-pin"' in worker,
 "admin-only temporary PIN issue": '"/api/rms/users/temporary-pin"' in worker and "RMS_ADMIN_ROLES.has(staff.role)" in worker,
 "lockout after failed attempts": "attempts>=5?now+15*60:0" in worker,
 "webmaster recovery functionality is absent": "WEBMASTER_RECOVERY_TOKEN" not in worker and '"/api/webmaster' not in worker and "webmasterRecovery" not in worker,
 "bootstrap script generates four-digit PIN": "randomInt(10000)" in script and "210000" in script,
 "bootstrap script upserts seeded user": "ON CONFLICT(username) DO UPDATE" in script,
 "bootstrap script invalidates old sessions": "DELETE FROM hapkek_staff_sessions" in script,
 "bootstrap script rejects reserved identities case-insensitively": 'new Set(["webmaster", "anmer"])' in script and 'String(username || "").trim().toLowerCase()' in script,
 "legacy staff URL redirects to the sole RMS login": 'location.replace("/")' in staff and 'id="loginForm"' not in staff,
 "dropdown login in RMS": 'id="nickname"' in rms and 'id="username"' not in rms,
 "admin staff management UI": 'id="userAccessForm"' in rms and 'id="issueAnmerPin"' in rms,
}
checks.update({
 "only Ana may issue Anmer PIN": 'String(admin?.username || "").toLowerCase() !== "ana"' in worker,
 "API only targets Anmer": 'nickname.toLowerCase() !== "anmer"' in worker,
 "temporary PIN generated server-side": "generateStaffTemporaryPin()" in worker and "const pin=generateStaffTemporaryPin()" in worker,
 "browser cannot choose Anmer PIN": "body?.temporaryPin" not in worker[worker.index("async function rmsIssueTemporaryPin"):worker.index("const RMS_READ_ROLES")],
 "PIN returned in no-store authenticated response": "temporaryPin:pin" in worker and '"Cache-Control":"no-store, private"' in worker,
 "Ana manually delivers PIN": 'delivery:"manual_by_Ana"' in worker and "Share it directly with Anmer yourself" in rms,
 "PIN excluded from audit details": 'rmsAudit(env,admin,"staff.temporary_pin_issued"' in worker and 'temporaryPin:pin' not in worker[worker.index("async function rmsAudit"):worker.index("const RMS_READ_ROLES")],
 "RMS shows PIN in dedicated panel": 'id="issuedTemporaryPin"' in rms and 'id="issuedPin"' in rms,
 "PIN copy control": 'navigator.clipboard.writeText(pin)' in rms,
 "PIN cleared after sign-out/session loss": "clearIssuedTemporaryPin()" in rms and 'pin.textContent="••••"' in rms,
 "staff access controls shown only to Ana": 'String(staff.username||"").toLowerCase()==="ana"' in rms,
 "only Ana loads staff PIN controls": 'String(currentStaff?.username||"").toLowerCase()==="ana"' in rms,
 "Anmer PIN API restricted to Ana": 'String(admin?.username || "").toLowerCase() !== "ana"' in worker,
 "Ana-only PIN generator button": 'id="issueAnmerPin"' in rms and "Generate temporary PIN for Anmer" in rms,
 "staff page explains personal delivery": "Give this PIN directly to Anmer" in rms,
})

# Exercise the bootstrap command itself: reserved identities must fail before PIN generation,
# while ordinary staff and admin identities remain provisionable.
def run_bootstrap(username, role="staff"):
    return subprocess.run(
        ["node", str(root / "scripts/create_staff_user.mjs"), username, "Contract Test", role],
        capture_output=True, text=True, check=False
    )

reserved_results = [run_bootstrap(name) for name in ("Anmer", "ANMER", "aNmEr", "Webmaster", "WEBMASTER", "wEbMaStEr")]
checks["bootstrap command rejects Anmer and Webmaster in every tested case"] = all(
    result.returncode != 0 and "reserved" in result.stderr.lower()
    for result in reserved_results
)
allowed_results = [run_bootstrap("ContractStaff", "staff"), run_bootstrap("ContractAdmin", "admin")]
checks["bootstrap command still provisions ordinary Staff and Admin identities"] = all(
    result.returncode == 0 and "ONE-TIME TEMPORARY PIN" in result.stdout
    and "INSERT INTO hapkek_staff_users" in result.stdout
    for result in allowed_results
)

for label,ok in checks.items(): print(("PASS " if ok else "FAIL ")+label)
if not all(checks.values()): raise SystemExit(1)
