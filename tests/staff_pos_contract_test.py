from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
html = (ROOT / "rms" / "index.html").read_text()
js = (ROOT / "rms" / "rms.js").read_text()
worker = (ROOT / "worker" / "index.js").read_text()
migration = (ROOT / "database" / "migrations" / "0007_pos_order_details.sql").read_text()
css = (ROOT / "rms" / "rms.css").read_text()
legacy_entry = (ROOT / "staff-app" / "index.html").read_text()
css = (ROOT / "rms" / "rms.css").read_text()

checks = {
    "login uses stable username metadata and a native required selector": 'name="username"' in html and 'autocomplete="username"' in html and 'data-error="accountFieldError"' in html and '<option value="" disabled selected>' in html,
    "PIN uses current-password autofill and numeric mobile keyboard": 'autocomplete="current-password"' in html and 'inputmode="numeric"' in html and 'enterkeyhint="done"' in html,
    "PIN visibility toggle is accessible": 'id="togglePin"' in html and 'aria-controls="pin"' in html and 'aria-pressed="false"' in html and '$("togglePin").addEventListener("click"' in js,
    "sign-in errors sync with accessible interaction validity": 'matches(":user-invalid")' in js and 'aria-describedby' in js and 'setAttribute("aria-live","polite")' in js,
    "auth page supports dynamic viewport and user text scale": "100dvh" in css and "font-size: clamp(" in css and "font-size: .875rem" in css,
    "native select picker avoids custom top-layer opt-in": "appearance: base-select" not in css,
    "login shell does not remain hidden after authentication": 'class="layout login-mode"' not in html and '.layout.login-mode .sidebar' not in css,
    "RMS has one login landing page": 'class="auth-landing"' in html and 'id="loginPanel"' in html and 'location.replace("/")' in legacy_entry,
    "legacy staff URL redirects to the same RMS login": 'location.replace("/")' in legacy_entry and 'id="loginForm"' not in legacy_entry,
    "signed-in users branch by Admin and Staff role": 'const canManage=role==="admin"' in js and 'el.hidden=!canManage' in js and 'show("users",role==="admin"' in js and '"owner"' not in js and '"manager"' not in js and "isWebmaster" not in js,
    "only active accounts appear in the one login selector": 'filter(user=>user.active)' in js,
    "POS and voucher scanner share the authenticated RMS page": 'id="pos"' in html and 'id="scan"' in html and 'id="reader"' in html and 'html5-qrcode' in html,
    "voucher scanner navigation remains visible on phones": "@media(max-width:720px){.sidebar .nav{display:block" in css,
    "voucher QR and manual redemption use RMS session": '"/api/staff/redeem"' in js and 'id="manualCode"' in html and "startScanner" in js,
    "POS has all five approved flavours": all(f'data-flavor="{f}"' in html for f in ("bavarian","cheese","ube","choco","strawberry")),
    "POS records customer name and order notes": 'id="customerName"' in html and 'id="orderNotes"' in html and 'customerName:$("customerName").value.trim()' in js and 'orderNotes:$("orderNotes").value.trim()' in js,
    "POS records cash GCash and card": all(f'data-payment="{m}"' in html for m in ("cash","gcash","card")),
    "POS handles cash received and change": 'id="cashReceived"' in html and 'id="changeDue"' in html and 'amountTenderedPesos:received' in js,
    "POS records optional payment reference": 'id="paymentReference"' in html and 'paymentReference:posPayment==="cash"?"":$("paymentReference").value.trim()' in js,
    "cashier checkout posts to authenticated POS endpoint": '"/api/rms/pos/checkout"' in js and 'credentials:"include"' in js,
    "receipt supports printing and next sale": 'id="printReceipt"' in html and 'id="newSale"' in html and "receiptNo" in js,
    "database migration adds order detail fields": all(x in migration for x in ("customer_name","order_notes","payment_reference")),
    "Worker saves and returns order details": all(x in worker for x in ("customer_name,order_notes,payment_reference","customerName:sale.customer_name","orderNotes:sale.order_notes","paymentReference:sale.payment_reference")),
}

failed = [name for name, ok in checks.items() if not ok]
for name, ok in checks.items():
    print(("PASS " if ok else "FAIL ") + name)
if failed:
    raise AssertionError("RMS contract failures: " + ", ".join(failed))
print(f"RMS contract: PASS ({len(checks)} checks)")
