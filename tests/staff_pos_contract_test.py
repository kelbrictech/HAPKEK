from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
html = (ROOT / "staff-app" / "index.html").read_text()
js = (ROOT / "staff-app" / "staff.js").read_text()
worker = (ROOT / "worker" / "index.js").read_text()
migration = (ROOT / "database" / "migrations" / "0007_pos_order_details.sql").read_text()

checks = {
    "staff app is a POS-first workspace": 'id="posWorkspace"' in html and 'id="posTab"' in html and 'switchWorkspace("pos")' in js,
    "staff login filters to active accounts": "data.users.filter(user=>user.active)" in js,
    "staff can switch directly to voucher scanning": 'id="voucherTab"' in html and 'id="reader"' in html and "html5-qrcode" in html,
    "staff can redeem a QR or manually entered code": '"/api/staff/redeem"' in js and 'id="manualCode"' in html and "startScanner" in js,
    "POS has all five approved flavours": all(f'data-flavor="{f}"' in html for f in ("bavarian","cheese","ube","choco","strawberry")),
    "POS records customer name and order notes": 'id="customerName"' in html and 'id="orderNotes"' in html and 'customerName:$("customerName").value.trim()' in js and 'orderNotes:$("orderNotes").value.trim()' in js,
    "POS records cash GCash and card": all(f'data-payment="{m}"' in html for m in ("cash","gcash","card")),
    "POS handles cash received and change": 'id="cashReceived"' in html and 'id="changeDue"' in html and 'amountTenderedPesos:received' in js,
    "POS records optional payment reference": 'id="paymentReference"' in html and 'paymentReference:paymentMethod==="cash"?"":$("paymentReference").value.trim()' in js,
    "cashier checkout posts to authenticated POS endpoint": '"/api/rms/pos/checkout"' in js and 'credentials:"include"' in js,
    "receipt supports printing and next sale": 'id="printReceipt"' in html and 'id="newSale"' in html and "receiptNo" in js,
    "database migration adds order detail fields": all(x in migration for x in ("customer_name","order_notes","payment_reference")),
    "Worker saves and returns order details": all(x in worker for x in ("customer_name,order_notes,payment_reference","customerName:sale.customer_name","orderNotes:sale.order_notes","paymentReference:sale.payment_reference")),
}

failed = [name for name, ok in checks.items() if not ok]
for name, ok in checks.items():
    print(("PASS " if ok else "FAIL ") + name)
if failed:
    raise AssertionError("Staff POS contract failures: " + ", ".join(failed))
print(f"Staff POS contract: PASS ({len(checks)} checks)")
