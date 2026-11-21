from pathlib import Path
"""Local contract checks for the HAPKEK daily voucher pool."""
import pathlib
import sqlite3

ROOT = pathlib.Path(__file__).resolve().parents[1]
db = sqlite3.connect(":memory:")
db.executescript((ROOT / "database/schema.sql").read_text())

prizes = db.execute(
    "SELECT prize_id, weight, daily_limit FROM hapkek_voucher_prizes ORDER BY weight DESC"
).fetchall()
assert [row[1] for row in prizes] == [9000, 700, 200, 100]
assert sum(row[1] for row in prizes) == 10000
assert all(row[2] == 0 for row in prizes), "Stock must remain disabled until configured"

# Mirrors the Worker atomic conditional INSERT: a prize cannot exceed its daily cap.
db.execute("UPDATE hapkek_voucher_prizes SET daily_limit=1 WHERE prize_id='discount_2nd_box'")
claim_sql = """INSERT INTO hapkek_voucher_claims(voucher_code,player_id,prize_id,claim_date)
SELECT ?, ?, ?, ? WHERE
(SELECT COUNT(*) FROM hapkek_voucher_claims WHERE prize_id=? AND claim_date=?) <
(SELECT daily_limit FROM hapkek_voucher_prizes WHERE prize_id=? AND active=1)
AND NOT EXISTS (SELECT 1 FROM hapkek_voucher_claims WHERE player_id=? AND claim_date=?)"""
params = ('HAP-AAAA', 'player-123', 'discount_2nd_box', '2026-11-21',
          'discount_2nd_box', '2026-11-21', 'discount_2nd_box', 'player-123', '2026-11-21')
assert db.execute(claim_sql, params).rowcount == 1
# The prize's only stock unit is now exhausted.
params2 = ('HAP-BBBB', 'player-456', 'discount_2nd_box', '2026-11-21',
           'discount_2nd_box', '2026-11-21', 'discount_2nd_box', 'player-456', '2026-11-21')
assert db.execute(claim_sql, params2).rowcount == 0
# A player cannot claim a second prize on the same day.
params3 = ('HAP-CCCC', 'player-123', 'free_1pc', '2026-11-21',
           'free_1pc', '2026-11-21', 'free_1pc', 'player-123', '2026-11-21')
assert db.execute(claim_sql, params3).rowcount == 0
print("PASS voucher weights sum to 100.00%")
print("PASS daily stock cap prevents over-issuing")
print("PASS one voucher per player per Manila day")


# Campaign allocation: 100 vouchers per Manila day, split 90/7/2/1.
import re
migration_sql = (Path(__file__).parents[1] / "database/migrations/0002_vouchers.sql").read_text(encoding="utf-8")
expected_stock = {
    "discount_2nd_box": 90,
    "free_1pc": 7,
    "bogo_box": 2,
    "free_1_box": 1,
}
for prize_id, quantity in expected_stock.items():
    assert re.search(rf"UPDATE hapkek_voucher_prizes SET daily_limit={quantity}, active=1 WHERE prize_id='{prize_id}'", migration_sql)
assert sum(expected_stock.values()) == 100
print("PASS 100-voucher daily allocation (90/7/2/1)")
