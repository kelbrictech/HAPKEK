/* HAPKEK leaderboard: score submission, board rendering and the leaderboard modal.
   Needs H.fmt and H.showModal, which game.js provides before any of these functions run. */
(function (H) {
  const API = 'https://hapkek-leaderboard.kelbrictech.workers.dev';

  function escapeText(v) {
    return String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  const QUEUE_KEY = 'hapkek_pending_scores';
  let flushing = false, retryTimer = null, retryDelay = 2000;

  function readQueue() {
    try {
      const value = JSON.parse(H.storage.get(QUEUE_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch { return []; }
  }
  function writeQueue(queue) { H.storage.set(QUEUE_KEY, JSON.stringify(queue)); }

  async function flushPendingScores() {
    if (flushing || !navigator.onLine) return false;
    const queue = readQueue();
    if (!queue.length) return true;
    flushing = true;
    let allSaved = true;
    try {
      for (const item of queue) {
        try {
          const res = await fetch(API + '/api/scores', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item),
            cache: 'no-store'
          });
          let data = {};
          try { data = await res.json(); } catch {}
          // A 409 means the first request was accepted but its response may have been lost.
          if (res.ok || (res.status === 409 && /already submitted/i.test(data.error || ''))) {
            const current = readQueue().filter(x => x.gameId !== item.gameId);
            writeQueue(current);
          } else {
            allSaved = false;
            console.warn('HAPKEK score retry deferred:', data.error || res.status);
            break;
          }
        } catch (e) {
          allSaved = false;
          console.warn('HAPKEK score retry failed:', e);
          break;
        }
      }
    } finally {
      flushing = false;
    }
    if (allSaved && readQueue().length === 0) {
      retryDelay = 2000;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      return true;
    }
    scheduleRetry();
    return false;
  }

  function scheduleRetry() {
    if (retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      flushPendingScores();
    }, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 60000);
  }

  async function recordScore({ gameId, elapsedMs }) {
    const item = {
      gameId, playerId: H.player.id, displayName: H.player.name,
      elapsedMs: Math.max(100, Math.round(elapsedMs))
    };
    const queue = readQueue();
    if (!queue.some(x => x.gameId === gameId)) {
      queue.push(item);
      writeQueue(queue);
    }
    return flushPendingScores();
  }

  window.addEventListener('online', flushPendingScores);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') flushPendingScores();
  });
  // Resume any score that was queued before a refresh or closed tab.
  if (readQueue().length) scheduleRetry();

  function renderBoard(data, period) {
    const medals = ['🥇', '🥈', '🥉'];
    const me = data.you;
    const top = (data.top || []).map((r, i) =>
      `<div class="leader-row ${r.player_id === H.player.id ? 'you' : ''}"><span><b>${medals[i]} ${escapeText(r.display_name)}</b><small>${r.player_id === H.player.id ? 'YOU' : ''}</small></span><strong>${H.fmt(Number(r.best_ms))}</strong></div>`
    ).join('');
    const yourLine = me
      ? `<div class="leader-me">Your placement: #${me.rank} · ${H.fmt(Number(me.best_ms))}</div>`
      : '<div class="leader-me">Your placement: Not ranked in this period yet.</div>';
    const reset = period === 'daily' ? 'Resets at midnight' : period === 'weekly' ? 'Resets Monday' : 'All recorded time';
    document.getElementById('leaderResults').innerHTML =
      (data.totalPlayers ? top : '<p>No scores recorded for this period yet.</p>') + yourLine +
      `<p class="note">${data.totalPlayers || 0} players · Times shown are each player’s best result · ${reset} (Philippine time)</p>`;
  }

  async function loadBoard(period) {
    document.querySelectorAll('[data-period]').forEach(b => b.classList.toggle('active', b.dataset.period === period));
    const box = document.getElementById('leaderResults');
    box.innerHTML = '<p>Loading live rankings…</p>';
    try {
      const res = await fetch(API + '/api/leaderboard?period=' + encodeURIComponent(period) + '&playerId=' + encodeURIComponent(H.player.id), { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to load leaderboard');
      renderBoard(data, period);
    } catch (e) {
      box.innerHTML = '<p class="leader-error">Live leaderboard unavailable. Check your connection and try again.</p>';
    }
  }

  function open() {
    H.showModal('HAPKEK Leaderboard',
      `<div class="panel"><div class="leader-profile"><label for="leaderName">Player name</label><input id="leaderName" maxlength="20" value="${escapeText(H.player.name)}"><button class="leader-name-save" id="saveLeaderName">Save</button></div><div class="leader-tabs"><button data-period="daily" class="active">Daily</button><button data-period="weekly">Weekly</button><button data-period="alltime">All-time high</button></div><div id="leaderResults"><p>Loading live rankings…</p></div></div>`);
    document.querySelectorAll('[data-period]').forEach(b => b.addEventListener('click', () => loadBoard(b.dataset.period)));
    document.getElementById('saveLeaderName').onclick = () => {
      const v = document.getElementById('leaderName').value.trim().slice(0, 20);
      if (v.length < 2) { alert('Use at least 2 characters for your player name.'); return; }
      H.player.setName(v);
      loadBoard(document.querySelector('[data-period].active')?.dataset.period || 'daily');
    };
    loadBoard('daily');
  }

  H.leaderboard = { API, escapeText, recordScore, flushPendingScores, renderBoard, loadBoard, open };
})(window.HAPKEK = window.HAPKEK || {});
