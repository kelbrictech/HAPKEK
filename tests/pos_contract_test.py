from pathlib import Path
root=Path(__file__).resolve().parents[1]
worker=(root/"worker"/"index.js").read_text()
migration=(root/"database"/"migrations"/"0006_pos_sales.sql").read_text()
checks={
 "fixed server-side price":"const POS_UNIT_PRICE_PESOS = 150;" in worker,
 "15 pieces per box":"const POS_PIECES_PER_BOX = 15;" in worker,
 "five server allowlisted flavors":all('"'+f+'"' in worker for f in ("bavarian","cheese","ube","choco","strawberry")),
 "checkout endpoint":'"/api/rms/pos/checkout"' in worker,
 "idempotent request IDs":"client_request_id" in worker,
 "cashier persists customer name, order notes and payment reference":all(x in worker for x in ("customer_name","order_notes","payment_reference")),
 "cashier detail fields are returned in sale receipt data":all(x in worker for x in ("customerName:sale.customer_name","orderNotes:sale.order_notes","paymentReference:sale.payment_reference")),
 "cashier detail length limits are server-side":all(x in worker for x in ("customerName.length>80","orderNotes.length>500","paymentReference.length>100")),
 "sale item table":"CREATE TABLE IF NOT EXISTS hapkek_pos_sale_items" in migration,
 "fixed-price SQL constraints":"unit_price_pesos INTEGER NOT NULL CHECK (unit_price_pesos = 150)" in migration,
}
failed=[name for name,ok in checks.items() if not ok]
if failed: raise AssertionError("POS contract failure: "+", ".join(failed))
print(f"POS backend contract: PASS ({len(checks)} checks)")
