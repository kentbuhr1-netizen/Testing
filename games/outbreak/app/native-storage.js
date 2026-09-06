/**
 * Keep the save when the WebView loses its storage.
 *
 * The game writes everything — the campaign, the best score, achievements,
 * bonus-shop cooldowns, the licence — to localStorage, which is exactly what
 * a browser should get. Inside an app, iOS is entitled to evict WebView
 * storage under pressure, and a player would open the app to an empty title
 * screen. So when Capacitor's Preferences plugin is present, every write is
 * mirrored into native storage and every launch restores from it first.
 *
 * Loaded as a classic script before the game's module, so the restore has
 * finished before store.js runs. Does nothing at all in a plain browser.
 */
(function () {
  var prefs = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Preferences;
  if (!prefs) return;
  // This game's own keys, plus the licence the payments client keeps under a
  // game-neutral name — the app is one game, so it can only be this game's.
  var PREFIXES = ["outbreak-", 'game-licence'];
  function ours(key) {
    if (typeof key !== 'string') return false;
    for (var i = 0; i < PREFIXES.length; i++) if (key.indexOf(PREFIXES[i]) === 0) return true;
    return false;
  }

  function mirror(key, value) {
    if (!ours(key)) return;
    (value === null ? prefs.remove({ key: key }) : prefs.set({ key: key, value: String(value) })).catch(function () {});
  }

  var setItem = localStorage.setItem.bind(localStorage);
  var removeItem = localStorage.removeItem.bind(localStorage);
  localStorage.setItem = function (k, v) { setItem(k, v); mirror(k, v); };
  localStorage.removeItem = function (k) { removeItem(k); mirror(k, null); };

  // Restore anything the WebView has lost. Synchronous-looking to the game:
  // the module script that follows does not run until this classic script
  // has returned, and the restore is kicked off here and awaited by the
  // entry below only when there is something to restore.
  window.__nativeStorageReady = prefs.keys().then(function (r) {
    var keys = (r && r.keys) || [];
    return Promise.all(keys.filter(ours).map(function (k) {
      return prefs.get({ key: k }).then(function (v) {
        if (v && v.value != null && localStorage.getItem(k) == null) setItem(k, v.value);
      });
    }));
  }).catch(function () {});
})();
