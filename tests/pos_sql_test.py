import sqlite3
from pathlib import Path
root=Path(__file__).resolve().parents[1]
sql=(root/"database"/"migrations"/"0006_pos_sales.sql").read_text()+(root/"database"/"migrations"/"0007_pos_order_details.sql").read_text()
db=sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys=ON")
db.execute("CREATE TABLE hapkek_staff_users(id INTEGER PRIMARY KEY,display_name TEXT)")
db.execute("INSERT INTO hapkek_staff_users VALUES(1,'Cashier')")
db.executescript(sql)
db.execute("""INSERT INTO hapkek_pos_sales
(receipt_no,client_request_id,boxes_sold,pieces_sold,unit_price_pesos,total_pesos,payment_method,amount_tendered_pesos,change_due_pesos,cashier_staff_id,cashier_name,customer_name,order_notes,payment_reference)
VALUES ('HAP-TEST-1','request-000000000001',3,45,150,450,'cash',500,50,1,'Cashier','Test customer','Hold for pickup','')""")
sale_id=db.execute("SELECT id FROM hapkek_pos_sales").fetchone()[0]
for flavor,boxes in [('bavarian',2),('ube',1)]:
 db.execute("INSERT INTO hapkek_pos_sale_items(sale_id,flavor,boxes_sold,pieces_sold,unit_price_pesos,line_total_pesos) VALUES(?,?,?,?,?,?)",(sale_id,flavor,boxes,boxes*15,150,boxes*150))
assert db.execute("SELECT SUM(boxes_sold),SUM(pieces_sold),SUM(line_total_pesos) FROM hapkek_pos_sale_items").fetchone()==(3,45,450)
invalid=[
 ('bad pieces',('cheese',1,14,150,150)),
 ('bad flavor',('mango',1,15,150,150)),
 ('bad price',('cheese',1,15,120,120)),
 ('duplicate flavor',('bavarian',1,15,150,150)),
]
for label,args in invalid:
 try: db.execute("INSERT INTO hapkek_pos_sale_items(sale_id,flavor,boxes_sold,pieces_sold,unit_price_pesos,line_total_pesos) VALUES(?,?,?,?,?,?)",(sale_id,*args))
 except sqlite3.IntegrityError: pass
 else: raise AssertionError("Constraint failed: "+label)
assert db.execute("SELECT customer_name,order_notes,payment_reference FROM hapkek_pos_sales").fetchone()==("Test customer","Hold for pickup","")
print("POS SQL constraints and order details: PASS")
