"""Leaderboard ranking test. Run: python3 tests/leaderboard_sql_test.py   (add --perf for a 200,000-row timing run)

It loads the REAL SQL out of worker/index.js and database/schema.sql, fills an in-memory SQLite database with
random scores, and compares daily / weekly / all-time rankings against an independent Python model
(Asia/Manila dates, weeks start Monday). It does not touch Cloudflare or the live database.
"""
import datetime as dt, pathlib, random, re, sqlite3, sys, time, uuid

ROOT = pathlib.Path(__file__).resolve().parent.parent
worker = (ROOT / "worker" / "index.js").read_text(encoding="utf-8")
SCHEMA = (ROOT / "database" / "schema.sql").read_text(encoding="utf-8")
periods = dict(re.findall(r'(daily|weekly|alltime):\s*"(.*?)",?\n', worker))
template = re.search(r"const sql = `(.*?)`;", worker, re.S).group(1)
assert set(periods) == {"daily", "weekly", "alltime"}, "could not read periods from worker/index.js"

def board_sql(period):
    return template.replace("${periods[period]}", periods[period])

def iso(d):
    return d.strftime("%Y-%m-%dT%H:%M:%S.") + f"{d.microsecond // 1000:03d}Z"

def utcnow():
    return dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)

def correctness():
    random.seed(7)
    db = sqlite3.connect(":memory:"); db.executescript(SCHEMA)
    now = utcnow()
    players = [str(uuid.uuid4()) for _ in range(300)]
    rows = []
    for _ in range(4000):
        p = random.choice(players)
        created = now - dt.timedelta(seconds=random.randint(0, 20 * 86400))
        rows.append((str(uuid.uuid4()), p, "P" + p[:4], random.randint(3500, 30000), iso(created), created))
    for k in range(5):  # exact ties, to test tie-breaking
        created = now - dt.timedelta(minutes=k)
        rows.append((str(uuid.uuid4()), players[k], "T" + str(k), 4000, iso(created), created))
    db.executemany("INSERT INTO hapkek_scores(game_id,player_id,display_name,elapsed_ms,created_at) VALUES (?,?,?,?,?)",
                   [r[:5] for r in rows])
    today = (now + dt.timedelta(hours=8)).date(); week_start = today - dt.timedelta(days=today.weekday())

    def expected(period):
        best = {}
        for _, p, _, ms, ci, cd in rows:
            d = (cd + dt.timedelta(hours=8)).date()
            if not {"daily": d == today, "weekly": d >= week_start, "alltime": True}[period]:
                continue
            if p not in best or (ms, ci) < best[p]:
                best[p] = (ms, ci)
        order = sorted(best.items(), key=lambda kv: (kv[1][0], kv[1][1], kv[0]))
        return [(p, i + 1, b[0]) for i, (p, b) in enumerate(order)]

    fails = 0
    for period in periods:
        exp = expected(period); ranks = {p: (r, ms) for p, r, ms in exp}
        for probe in players[:60] + [""]:
            res = db.execute(board_sql(period), (probe,)).fetchall()
            if [(r[0], r[4], r[2]) for r in res if r[4] <= 3] != exp[:3]: fails += 1; print("TOP MISMATCH", period)
            mine = [r for r in res if r[0] == probe]
            if probe in ranks and (not mine or (mine[0][4], mine[0][2]) != ranks[probe]): fails += 1; print("YOU MISMATCH", period)
            if probe not in ranks and mine: fails += 1; print("PHANTOM ROW", period)
            if res and res[0][5] != len(exp): fails += 1; print("TOTAL MISMATCH", period)
        print(f"{period}: {len(exp)} ranked players, top 3 = {[x[2] for x in exp[:3]]} ms")
    print("FAILURES:", fails)
    return fails

def perf(n=200000, players_n=20000):
    db = sqlite3.connect(":memory:"); db.executescript(SCHEMA)
    now = utcnow(); pl = [str(uuid.uuid4()) for _ in range(players_n)]
    db.executemany("INSERT INTO hapkek_scores(game_id,player_id,display_name,elapsed_ms,created_at) VALUES (?,?,?,?,?)",
        [(str(uuid.uuid4()), random.choice(pl), "x", random.randint(3500, 30000),
          iso(now - dt.timedelta(seconds=random.randint(0, 30 * 86400)))) for _ in range(n)])
    for period in periods:
        t = time.perf_counter(); db.execute(board_sql(period), (pl[0],)).fetchall()
        print(f"{period}: {(time.perf_counter() - t) * 1000:.0f} ms over {n} scores")

if __name__ == "__main__":
    print("sqlite", sqlite3.sqlite_version)
    bad = correctness()
    if "--perf" in sys.argv: perf()
    sys.exit(1 if bad else 0)
