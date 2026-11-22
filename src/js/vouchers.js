/* HAPKEK server-issued daily gacha voucher client. */
(function (H) {
  const API = H.leaderboard.API;
  async function claimDailyVoucher() {
    const response = await fetch(API + "/api/vouchers/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId: H.player.id }),
      cache: "no-store"
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || "Voucher service unavailable");
      error.soldOut = Boolean(data.soldOut);
      error.notStarted = Boolean(data.notStarted);
      error.launchAt = data.launchAt || null;
      throw error;
    }
    if (!data.voucher?.voucher_code || !data.voucher?.prize_id) throw new Error("Invalid voucher response");
    return data;
  }
  H.vouchers = { claimDailyVoucher };
})(window.HAPKEK = window.HAPKEK || {});
