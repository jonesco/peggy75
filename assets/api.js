// Talks to the Apps Script web app that keeps the guest list in a Google Sheet.
// With no apiUrl in config.js it runs a preview store in this browser instead,
// so the pages can be tried before anything is set up.
(function (root) {
  "use strict";

  var config = root.PEGGY_CONFIG || {};
  var url = (config.apiUrl || "").trim();
  var preview = !url;

  function call(action, payload) {
    var body = Object.assign({ action: action }, payload || {});
    if (preview) {
      return new Promise(function (resolve, reject) {
        setTimeout(function () {
          try { resolve(Preview.handle(body)); } catch (e) { reject(e); }
        }, 250);
      });
    }
    // text/plain keeps this a simple request, which Apps Script accepts across origins.
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body)
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data || !data.ok) throw new Error((data && data.error) || "Something went wrong.");
        return data;
      });
  }

  // ---- Preview store (localStorage). Mirrors apps-script/Code.gs. ----
  var Preview = (function () {
    var KEY = "peggy75-preview";
    var memory = null;

    function load() {
      try {
        var raw = root.localStorage.getItem(KEY);
        if (raw) return JSON.parse(raw);
      } catch (e) { /* storage blocked */ }
      if (memory) return memory;
      var now = new Date().toISOString();
      return [
        { token: "demo-carol", name: "Carol and Jim", email: "", phone: "", seats: 2, reply: "yes", attending: 2, note: "Wouldn’t miss it.", opened: now, replied: now, added: now, source: "host" },
        { token: "demo-ruth", name: "Aunt Ruth", email: "", phone: "", seats: 1, reply: "", attending: 0, note: "", opened: now, replied: "", added: now, source: "host" },
        { token: "demo-dale", name: "The Wagner family", email: "", phone: "", seats: 4, reply: "", attending: 0, note: "", opened: "", replied: "", added: now, source: "host" }
      ];
    }
    function save(rows) {
      memory = rows;
      try { root.localStorage.setItem(KEY, JSON.stringify(rows)); } catch (e) { /* keep in memory */ }
    }
    function find(rows, token) {
      for (var i = 0; i < rows.length; i++) if (rows[i].token === token) return rows[i];
      return null;
    }
    function newToken() { return Math.random().toString(16).slice(2, 12); }
    function pub(g) { return { name: g.name, seats: g.seats, reply: g.reply, attending: g.attending, note: g.note }; }
    function clean(v, max) { return String(v == null ? "" : v).trim().slice(0, max || 200); }

    function handle(b) {
      var rows = load();
      var now = new Date().toISOString();
      var g;
      switch (b.action) {
        case "guest":
          g = find(rows, b.token);
          if (!g) throw new Error("We couldn’t find that invitation.");
          if (!g.opened && !b.peek) { g.opened = now; save(rows); }
          return { ok: true, guest: pub(g) };
        case "rsvp":
          var reply = b.reply === "yes" ? "yes" : b.reply === "no" ? "no" : "";
          if (!reply) throw new Error("Please choose yes or no.");
          if (b.token) {
            g = find(rows, b.token);
            if (!g) throw new Error("We couldn’t find that invitation.");
          } else {
            var name = clean(b.name, 120);
            if (!name) throw new Error("Please add your name.");
            g = { token: newToken(), name: name, email: clean(b.email), phone: "", seats: 0, reply: "", attending: 0, note: "", opened: now, replied: "", added: now, source: "open link" };
            rows.push(g);
          }
          var max = g.seats > 0 ? g.seats : 10;
          g.reply = reply;
          g.attending = reply === "yes" ? Math.max(1, Math.min(max, parseInt(b.attending, 10) || 1)) : 0;
          g.note = clean(b.note, 500);
          g.replied = now;
          save(rows);
          return { ok: true, token: g.token, guest: pub(g) };
        default:
          if (b.passphrase !== "preview") throw new Error("That passphrase didn’t work.");
          if (b.action === "list") return { ok: true, guests: rows };
          if (b.action === "add") {
            var n = clean(b.name, 120);
            if (!n) throw new Error("Add a name.");
            g = { token: newToken(), name: n, email: clean(b.email), phone: clean(b.phone, 40), seats: Math.max(1, Math.min(20, parseInt(b.seats, 10) || 1)), reply: "", attending: 0, note: "", opened: "", replied: "", added: now, source: "host" };
            rows.push(g); save(rows);
            return { ok: true, guest: g };
          }
          if (b.action === "remove") {
            save(rows.filter(function (r) { return r.token !== b.token; }));
            return { ok: true };
          }
          throw new Error("Unknown request.");
      }
    }
    return { handle: handle, reset: function () { memory = null; try { root.localStorage.removeItem(KEY); } catch (e) {} } };
  })();

  root.PeggyAPI = {
    preview: preview,
    guest: function (token, peek) { return call("guest", { token: token, peek: !!peek }); },
    rsvp: function (data) { return call("rsvp", data); },
    list: function (passphrase) { return call("list", { passphrase: passphrase }); },
    add: function (passphrase, guest) { return call("add", Object.assign({ passphrase: passphrase }, guest)); },
    remove: function (passphrase, token) { return call("remove", { passphrase: passphrase, token: token }); },
    _preview: Preview
  };
})(typeof window !== "undefined" ? window : globalThis);
