from pathlib import Path

worker = (Path(__file__).parents[1] / "worker" / "index.js").read_text(encoding="utf-8")
client = (Path(__file__).parents[1] / "src" / "js" / "vouchers.js").read_text(encoding="utf-8")

assert 'Date.parse("2026-11-22T01:00:00.000Z")' in worker
assert '2026-11-22T09:00:00+08:00' in worker
assert "if (Date.now() < VOUCHER_LAUNCH_AT)" in worker
assert worker.index("if (Date.now() < VOUCHER_LAUNCH_AT)") < worker.index("const existing = await getExistingVoucher")
assert "error.notStarted = Boolean(data.notStarted)" in client
print("Voucher launch gate checks passed.")
