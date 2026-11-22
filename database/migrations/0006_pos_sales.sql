-- HAPKEK POS sales ledger with fixed-price flavor lines.
-- Apply after 0005_nickname_pin_access.sql. Source-only: do not run automatically.
CREATE TABLE IF NOT EXISTS hapkek_pos_sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_no TEXT NOT NULL UNIQUE,
  client_request_id TEXT NOT NULL UNIQUE,
  boxes_sold INTEGER NOT NULL CHECK (boxes_sold BETWEEN 1 AND 99),
  pieces_sold INTEGER NOT NULL CHECK (pieces_sold = boxes_sold * 15),
  unit_price_pesos INTEGER NOT NULL CHECK (unit_price_pesos = 150),
  total_pesos INTEGER NOT NULL CHECK (total_pesos = boxes_sold * 150),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash','gcash','card')),
  amount_tendered_pesos INTEGER NOT NULL CHECK (amount_tendered_pesos >= total_pesos),
  change_due_pesos INTEGER NOT NULL CHECK (change_due_pesos = amount_tendered_pesos - total_pesos),
  cashier_staff_id INTEGER NOT NULL REFERENCES hapkek_staff_users(id),
  cashier_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_hapkek_pos_sales_created ON hapkek_pos_sales(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hapkek_pos_sales_cashier ON hapkek_pos_sales(cashier_staff_id,created_at DESC);

CREATE TABLE IF NOT EXISTS hapkek_pos_sale_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER NOT NULL REFERENCES hapkek_pos_sales(id) ON DELETE CASCADE,
  flavor TEXT NOT NULL CHECK (flavor IN ('bavarian','cheese','ube','choco','strawberry')),
  boxes_sold INTEGER NOT NULL CHECK (boxes_sold BETWEEN 1 AND 99),
  pieces_sold INTEGER NOT NULL CHECK (pieces_sold = boxes_sold * 15),
  unit_price_pesos INTEGER NOT NULL CHECK (unit_price_pesos = 150),
  line_total_pesos INTEGER NOT NULL CHECK (line_total_pesos = boxes_sold * 150),
  UNIQUE (sale_id,flavor)
);
CREATE INDEX IF NOT EXISTS idx_hapkek_pos_sale_items_flavor ON hapkek_pos_sale_items(flavor,sale_id);
