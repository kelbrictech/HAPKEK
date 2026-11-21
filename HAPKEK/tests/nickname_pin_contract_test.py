from pathlib import Path
import re
root=Path(__file__).resolve().parents[1]
worker=(root/'worker/index.js').read_text()
staff=(root/'staff-app/index.html').read_text()+(root/'staff-app/staff.js').read_text()
rms=(root/'rms/index.html').read_text()+(root/'rms/rms.js').read_text()
migration=(root/'database/migrations/0005_nickname_pin_access.sql').read_text()
checks={
 'seeded Ana administrator': "('Ana', 'Ana'" in migration and "'admin', 1" in migration,
 'seeded Anmer staff': "('Anmer', 'Anmer'" in migration and "'staff', 1" in migration,
 'Ana temporary PIN stored as hash': '9005c221564a861fc77aff0de3c66345039a20a8679c917e66d333080fe766c3' in migration and '8888' not in migration,
 '4-digit PIN login validation': r'/^\d{4}$/' in worker,
 'nickname directory endpoint': '"/api/staff/users"' in worker,
 'first-login PIN replacement': 'must_change_pin=0' in worker and '"/api/staff/change-pin"' in worker,
 'admin-only temporary PIN issue': '"/api/rms/users/temporary-pin"' in worker and 'RMS_ADMIN_ROLES.has(staff.role)' in worker,
 'lockout after failed attempts': 'attempts>=5?now+15*60:0' in worker,
 'webmaster recovery is secret-gated': 'WEBMASTER_RECOVERY_TOKEN' in worker,
 'dropdown login in staff app': 'id="nickname"' in staff and 'id="username"' not in staff,
 'dropdown login in RMS': 'id="nickname"' in rms and 'id="username"' not in rms,
 'admin staff management UI': 'id="userAccessForm"' in rms and 'id="staffNickname"' in rms,
}
for label,ok in checks.items(): print(('PASS' if ok else 'FAIL')+' '+label)
if not all(checks.values()): raise SystemExit(1)
