/* HAPKEK storage: localStorage with an in-memory fallback.
   Some in-app browsers (and private modes) block localStorage and throw; this keeps the game running. */
(function (H) {
  const memory = {};
  H.storage = {
    get(key) {
      try { return localStorage.getItem(key); }
      catch (e) { return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null; }
    },
    set(key, value) {
      try { localStorage.setItem(key, value); }
      catch (e) { memory[key] = String(value); }
    }
  };
})(window.HAPKEK = window.HAPKEK || {});
