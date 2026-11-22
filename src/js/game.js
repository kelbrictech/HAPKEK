/* HAPKEK game: board logic, timer, win sequence, coupon and share. */
(function (H) {
  const target = ['H', 'A', 'P', 'K', 'E', 'K'], cakes = [...document.querySelectorAll('.cake')];
  const timer = document.getElementById('timerText'), word = document.getElementById('wordText'), status = document.getElementById('statusText');
  const winGroup = document.getElementById('winGroup'), playControls = document.getElementById('playControls');
  const overlay = document.getElementById('modalOverlay'), modalTitle = document.getElementById('modalTitle'), modalBody = document.getElementById('modalBody');
  let order = [], progress = 0, startAt = 0, elapsed = 0, timerId = null, running = false, locked = false, selected = [], coupon = '', gameId = H.player.makeId();
  const FLIP_MS = 150;
  const music = document.getElementById('gameMusic');
  const musicToggle = document.getElementById('musicToggle');
  let musicStarted = false;
  music.volume = 0.28;
  async function playMusic() {
    try {
      await music.play(); musicStarted = true;
      musicToggle.textContent = '♫ Music: On'; musicToggle.setAttribute('aria-pressed', 'true');
      musicToggle.setAttribute('aria-label', 'Turn background music off');
    } catch (_) {
      musicToggle.textContent = '♫ Tap for music';
    }
  }
  function pauseMusic() {
    music.pause(); musicToggle.textContent = '♫ Music: Off';
    musicToggle.setAttribute('aria-pressed', 'false'); musicToggle.setAttribute('aria-label', 'Turn background music on');
  }
  musicToggle.addEventListener('click', () => {
    if (!music.paused) pauseMusic(); else playMusic();
  });
  // Start only after a real player gesture; browsers block unsolicited autoplay.
  document.addEventListener('pointerdown', e => {
    if (e.target !== musicToggle && !musicStarted) playMusic();
  }, { once: true, capture: true });
  document.addEventListener('keydown', () => {
    if (!musicStarted) playMusic();
  }, { once: true, capture: true });

  const fmt = ms => { let t = ms / 1000, m = Math.floor(t / 60), s = Math.floor(t % 60), d = Math.floor(ms % 1000 / 100); return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${d}`; };
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { let j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  H.fmt = fmt;

  function showModal(title, html) { modalTitle.textContent = title; modalBody.innerHTML = html; overlay.classList.add('show'); }
  H.showModal = showModal;

  function tick() { elapsed = performance.now() - startAt; timer.textContent = fmt(elapsed); }
  function startClock(at = performance.now()) { if (running) return; running = true; startAt = at; timerId = setInterval(tick, 50); }
  function stopClock(at = performance.now()) {
    if (timerId) clearInterval(timerId);
    timerId = null;
    if (running) { elapsed = Math.max(0, at - startAt); timer.textContent = fmt(elapsed); }
    running = false;
  }
  function renderWord() { word.textContent = target.map((c, i) => i < progress ? c : '_').join(' '); }
  function resetCakes() { cakes.forEach(c => { c.classList.remove('revealed'); c.setAttribute('aria-label', 'Covered pancake'); }); }

  function newGame() {
    stopClock(); elapsed = 0; timer.textContent = '00:00.0'; progress = 0; running = false; locked = false; selected = []; gameId = H.player.makeId();
    order = shuffle([...target]);
    cakes.forEach((c, i) => {
      c.dataset.letter = order[i]; c.querySelector('.letter').textContent = order[i];
      c.classList.remove('revealed', 'winner-color'); c.style.zIndex = ''; c.style.translate = ''; c.style.transition = '';
      c.setAttribute('aria-label', `Covered pancake ${i + 1}`);
    });
    renderWord(); status.style.opacity = '1'; status.textContent = 'Tap the cakes in order: H - A - P - K - E - K';
    document.getElementById('cakes').classList.remove('fade-away'); document.getElementById('finalCakes').classList.remove('show');
    winGroup.classList.remove('show'); playControls.classList.remove('hide');
  }

  async function choose(c, tappedAt = performance.now()) {
    if (locked || winGroup.classList.contains('show') || c.classList.contains('revealed')) return;
    if (!running) startClock(tappedAt);
    const letter = c.dataset.letter;
    c.classList.add('revealed');
    c.setAttribute('aria-label', 'Revealed ' + letter);

    if (letter !== target[progress]) {
      locked = true;
      await wait(FLIP_MS);
      resetCakes(); progress = 0; renderWord();
      status.textContent = `Wrong letter (${letter}). Positions have not changed — try H again.`;
      locked = false;
      return;
    }

    // Correct selections count at the input timestamp; visual feedback does not delay the clock.
    selected.push(c); progress++; renderWord();
    if (progress === target.length) {
      stopClock(tappedAt);
      await win();
      return;
    }
    status.textContent = `Correct! Find ${target[progress]} next.`;
  }

  async function win() {
    locked = true;
    status.style.opacity = '0';
    // Save immediately after the final input, independently of the victory animation.
    H.leaderboard.recordScore({ gameId, elapsedMs: Math.max(100, Math.round(elapsed)) });
    for (const c of selected) { c.classList.add('winner-color'); await wait(180); }
    document.getElementById('cakes').classList.add('fade-away');
    await wait(520);
    document.getElementById('finalCakes').classList.add('show');
    await wait(560);
    document.getElementById('finalTimeSvg').textContent = fmt(elapsed);
    playControls.classList.add('hide'); winGroup.classList.add('show');
  }

  let voucherRequest = null;
  async function couponPanel() {
    showModal('HAPKEK Daily Prize', `<div class="panel"><p>Checking today's voucher pool…</p></div>`);
    if (!voucherRequest) voucherRequest = H.vouchers.claimDailyVoucher();
    try {
      const result = await voucherRequest;
      voucherRequest = null;
      const v = result.voucher;
      const code = String(v.voucher_code);
      const label = String(v.label);
      const art = {
        discount_2nd_box: '10-percent-off-2nd-box.png',
        free_1pc: 'free-1-pc-hapkek.png',
        bogo_box: 'buy-1-get-1-free.png',
        free_1_box: 'free-1-box-hapkek.png'
      }[v.prize_id];
      const note = result.alreadyClaimed
        ? "You have already used today's draw. This is your original voucher."
        : 'Your first draw for today is complete.';
      showModal('Your HAPKEK Prize', `<div class="panel"><img src="assets/images/vouchers/${art}" alt="${H.leaderboard.escapeText(label)}" style="display:block;width:min(100%,340px);height:auto;margin:0 auto 12px"><h2>${H.leaderboard.escapeText(label)}</h2><div style="font-size:27px;font-weight:1000;letter-spacing:3px">${H.leaderboard.escapeText(code)}</div><p>${note}</p><div id="qrcode"></div><p class="note">One draw per player per day · Resets at 00:00 Philippine time.</p></div><button id="copyCoupon">Copy voucher code</button>`);
      const payload = JSON.stringify({ brand: 'HAPKEK', voucher: code, prize: v.prize_id, date: v.claim_date });
      const q = document.getElementById('qrcode');
      if (window.QRCode) new QRCode(q, { text: payload, width: 170, height: 170 });
      document.getElementById('copyCoupon').onclick = async () => {
        try { await navigator.clipboard.writeText(code); document.getElementById('copyCoupon').textContent = 'Copied'; }
        catch { showModal('Voucher code', `<p>${H.leaderboard.escapeText(code)}</p>`); }
      };
    } catch (error) {
      const message = error.soldOut
        ? 'All vouchers for today have been claimed. The pool resets at 00:00 Philippine time.'
        : 'The voucher service could not be reached. Please try again.';
      showModal(error.soldOut ? "Today's Vouchers Are Fully Claimed" : "Voucher Unavailable", `<div class="panel"><p>${message}</p></div>`);
      voucherRequest = null;
    }
  }

  async function share() {
    let msg = progress === 6 ? `I completed the HAPKEK Memory Game in ${fmt(elapsed)}!` : 'Can you spell HAPKEK in the right order? Try the HAPKEK Memory Game!';
    const shareUrl = 'https://kelbric.com/games/hapkek/';
    let data = { title: 'HAPKEK Japanese Cake — Memory Game', text: msg, url: shareUrl };
    try {
      if (navigator.share) await navigator.share(data);
      else if (navigator.clipboard) { await navigator.clipboard.writeText(msg + ' ' + shareUrl); showModal('Share link copied', '<p>Send the copied challenge link to a friend.</p>'); }
      else showModal('Share HAPKEK', `<p>${msg}</p>`);
    } catch (e) { if (e.name !== 'AbortError') showModal('Sharing unavailable', '<p>Your browser does not support the share action.</p>'); }
  }

  function bind(id, fn) { const el = document.getElementById(id); el.addEventListener('click', fn); el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } }); }
  cakes.forEach(c => {
    c.addEventListener('pointerdown', e => {
      if (e.isPrimary === false || e.button > 0) return;
      e.preventDefault();
      choose(c, performance.now());
    });
    c.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(c, performance.now()); }
    });
  });
  bind('newAction', newGame); bind('againAction', newGame); bind('shareAction', share); bind('sharePlayAction', share); bind('couponAction', couponPanel); bind('leaderAction', H.leaderboard.open);
  document.getElementById('modalClose').onclick = () => overlay.classList.remove('show');
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('show'); });
  newGame();
})(window.HAPKEK = window.HAPKEK || {});
