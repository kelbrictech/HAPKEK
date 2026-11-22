-- HAPKEK POS cashier details: customer, order notes and non-cash payment reference.
-- Apply after 0006_pos_sales.sql.
ALTER TABLE hapkek_pos_sales ADD COLUMN customer_name TEXT NOT NULL DEFAULT '';
ALTER TABLE hapkek_pos_sales ADD COLUMN order_notes TEXT NOT NULL DEFAULT '';
ALTER TABLE hapkek_pos_sales ADD COLUMN payment_reference TEXT NOT NULL DEFAULT '';
