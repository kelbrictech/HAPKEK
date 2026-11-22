/* HAPKEK player identity: anonymous player ID and display name, kept in storage. */
(function (H) {
  const makeId = () => crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(16) + '-' + Math.random().toString(16).slice(2) + '-' + Math.random().toString(16).slice(2);

  let playerId = H.storage.get('hapkek_player_id');
  if (!playerId) { playerId = makeId(); H.storage.set('hapkek_player_id', playerId); }
  let displayName = H.storage.get('hapkek_player_name') || ('Chef-' + playerId.slice(0, 4).toUpperCase());

  H.player = {
    makeId,
    get id() { return playerId; },
    get name() { return displayName; },
    setName(value) { displayName = value; H.storage.set('hapkek_player_name', value); }
  };
})(window.HAPKEK = window.HAPKEK || {});
