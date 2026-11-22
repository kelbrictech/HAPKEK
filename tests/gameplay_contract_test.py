"""Static regression checks for HAPKEK input/timing/retry behaviour. Run with python3 tests/gameplay_contract_test.py."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
game = (ROOT / "src/js/game.js").read_text(encoding="utf-8")
leaderboard = (ROOT / "src/js/leaderboard.js").read_text(encoding="utf-8")
animations = (ROOT / "src/css/animations.css").read_text(encoding="utf-8")
styles = (ROOT / "src/css/styles.css").read_text(encoding="utf-8")

checks = {
    "150ms gameplay flip": "const FLIP_MS = 150;" in game,
    "150ms CSS flip animation": "pancakeReveal .15s" in animations,
    "correct tap is not delayed by flip wait": "if (letter !== target[progress])" in game and "selected.push(c); progress++; renderWord();" in game,
    "timer starts from input timestamp": "startClock(tappedAt)" in game,
    "timer stops at final input timestamp": "stopClock(tappedAt)" in game,
    "touch/pointer-down input": "addEventListener('pointerdown'" in game,
    "keyboard access retained": "addEventListener('keydown'" in game,
    "tap handling avoids 600ms lock": "const FLIP_MS = 600" not in game,
    "persistent pending-score queue": "hapkek_pending_scores" in leaderboard,
    "retry on reconnect": "addEventListener('online', flushPendingScores)" in leaderboard,
    "retry after tab becomes visible": "visibilitychange" in leaderboard,
    "duplicate-safe retry": "res.status === 409" in leaderboard,
    "touch-friendly cake controls": "touch-action:manipulation" in styles,
}
failed = [name for name, ok in checks.items() if not ok]
for name, ok in checks.items():
    print(("PASS" if ok else "FAIL") + " " + name)
raise SystemExit(1 if failed else 0)
