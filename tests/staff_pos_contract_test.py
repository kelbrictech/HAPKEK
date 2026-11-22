from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
html = (ROOT / "rms" / "index.html").read_text()
js = (ROOT / "rms" / "rms.js").read_text()
worker = (ROOT / "worker" / "index.js").read_text()
migration = (ROOT / "database" / "migrations" / "0007_pos_order_details.sql").read_text()
legacy_entry = (ROOT / "staff-app" / "index.html").read_text()

checks = {
    "RMS has one login landing page": 'class="layout login-mode"' in html and 'id="loginPanel"' in html and 'location.replace("/")' in legacy_entry,
    "legacy staff URL redirects to the same RMS login": 'location.replace("/")' in legacy_entry and 'id="loginForm"' not in legacy_entry,
    "signed-in users branch by role": 'const canManage=["owner","admin","manager"].includes(role)' in js and 'el.hidden=!canManage' in js and 'el.hidden=!isWebmaster' in js,
    "only active accounts appear in the one login selector": 'd.users.filter(u=>u.active)' in js,
    "POS and voucher scanner share the authenticated RMS page": 'id="pos"' in html and 'id="scan"' in html and 'id="reader"' in html and 'html5-qrcode' in html,
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
