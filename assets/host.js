(function () {
  "use strict";

  var api = window.PeggyAPI;
  var $ = function (id) { return document.getElementById(id); };
  var KEY = "peggy75-pass";
  var pass = "";
  var guests = [];
  var filter = "all";

  try { pass = sessionStorage.getItem(KEY) || ""; } catch (e) { pass = ""; }
  if (api.preview) $("preview-banner").hidden = false;

  function inviteUrl(token) {
    var u = new URL("./", location.href);
    if (token) u.searchParams.set("g", token);
    return u.toString();
  }
  function message(link) {
    return "You’re invited to Peggy’s 75th birthday. Saturday, December 19, 2 to 4 PM, at Schobels’ in Columbus. Details and RSVP: " + link;
  }
  function day(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function copy(text, btn) {
    var done = function () { var t = btn.textContent; btn.textContent = "Copied"; setTimeout(function () { btn.textContent = t; }, 1400); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { window.prompt("Copy this link", text); });
    } else {
      window.prompt("Copy this link", text);
    }
  }

  function totals() {
    var coming = 0, no = 0, wait = 0;
    guests.forEach(function (g) {
      if (g.reply === "yes") coming += Number(g.attending) || 0;
      else if (g.reply === "no") no++;
      else wait++;
    });
    $("t-coming").textContent = coming;
    $("t-no").textContent = no;
    $("t-wait").textContent = wait;
    $("t-all").textContent = guests.length;
  }

  function matches(g) {
    if (filter === "yes") return g.reply === "yes";
    if (filter === "no") return g.reply === "no";
    if (filter === "wait") return !g.reply;
    if (filter === "unopened") return !g.opened && !g.reply;
    return true;
  }

  function order(a, b) {
    // Newest replies first, then waiting guests by name.
    if (a.replied && b.replied) return a.replied < b.replied ? 1 : -1;
    if (a.replied) return -1;
    if (b.replied) return 1;
    return String(a.name).localeCompare(String(b.name));
  }

  function row(g) {
    var li = el("li", "guest");
    var top = el("div", "top");
    top.append(el("span", "name", g.name || "(no name)"));
    var badge;
    if (g.reply === "yes") badge = el("span", "badge yes", "Coming · " + g.attending);
    else if (g.reply === "no") badge = el("span", "badge no", "Can’t come");
    else badge = el("span", "badge wait", g.opened ? "Opened" : "Not opened");
    top.append(badge);
    li.append(top);

    var bits = [];
    if (g.seats) bits.push(g.seats + (g.seats === 1 ? " seat" : " seats"));
    if (g.reply === "yes" && g.seats && g.attending > g.seats) bits.push((g.attending - g.seats) + " more than planned");
    if (g.replied) bits.push("replied " + day(g.replied));
    else if (g.opened) bits.push("opened " + day(g.opened));
    if (g.source === "open link") bits.push("via open link");
    if (bits.length) li.append(el("span", "meta", bits.join(" · ")));
    if (g.note) li.append(el("p", "note", "“" + g.note + "”"));

    var link = inviteUrl(g.token);
    var acts = el("div", "acts");
    var c = el("button", "btn ghost small", "Copy link"); c.type = "button";
    c.addEventListener("click", function () { copy(link, c); });
    acts.append(c);
    if (g.phone) {
      var t = el("a", "btn ghost small", "Text");
      t.href = "sms:" + g.phone.replace(/[^\d+]/g, "") + "?&body=" + encodeURIComponent(message(link));
      acts.append(t);
    }
    if (g.email) {
      var m = el("a", "btn ghost small", "Email");
      m.href = "mailto:" + g.email.replace(/[^\w.+@-]/g, "") + "?subject=" + encodeURIComponent("You’re invited: Peggy’s 75th birthday") + "&body=" + encodeURIComponent(message(link));
      acts.append(m);
    }
    var v = el("a", "btn ghost small", "View");
    var peekUrl = new URL(link); peekUrl.searchParams.set("peek", "1");
    v.href = peekUrl.toString(); v.target = "_blank"; v.rel = "noopener";
    acts.append(v);
    var r = el("button", "btn ghost small", "Remove"); r.type = "button";
    r.addEventListener("click", function () {
      if (!window.confirm("Remove " + (g.name || "this guest") + " from the list?")) return;
      r.disabled = true;
      api.remove(pass, g.token).then(load, function (err) { r.disabled = false; $("list-status").textContent = err.message; });
    });
    acts.append(r);
    li.append(acts);
    return li;
  }

  function render() {
    totals();
    var ul = $("guests");
    ul.replaceChildren();
    var shown = guests.filter(matches).sort(order);
    if (!shown.length) {
      ul.append(el("li", "empty", guests.length ? "No one here yet." : "Add the first guest above."));
      return;
    }
    shown.forEach(function (g) { ul.append(row(g)); });
  }

  function load() {
    $("list-status").textContent = "";
    return api.list(pass).then(function (res) {
      guests = res.guests || [];
      render();
    });
  }

  function unlock() {
    $("gate").hidden = true;
    $("app").hidden = false;
    $("open-link").textContent = inviteUrl("");
  }

  function lock(msg) {
    pass = "";
    try { sessionStorage.removeItem(KEY); } catch (e) { /* fine */ }
    $("app").hidden = true;
    $("gate").hidden = false;
    $("gate-status").textContent = msg || "";
    $("pass").value = "";
    $("pass").focus();
  }

  $("gate-form").addEventListener("submit", function (e) {
    e.preventDefault();
    pass = $("pass").value;
    $("gate-status").textContent = "Opening…";
    load().then(function () {
      try { sessionStorage.setItem(KEY, pass); } catch (err) { /* fine */ }
      $("gate-status").textContent = "";
      unlock();
    }, function (err) { lock(err.message); $("gate-status").classList.add("error"); });
  });

  $("add-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var s = $("add-status");
    var name = $("g-name").value.trim();
    if (!name) { s.textContent = "Add a name."; $("g-name").focus(); return; }
    $("add-btn").disabled = true;
    s.textContent = "Adding…";
    api.add(pass, {
      name: name,
      phone: $("g-phone").value.trim(),
      email: $("g-email").value.trim(),
      seats: $("g-seats").value
    }).then(function () {
      s.textContent = "Added " + name + ".";
      $("g-name").value = ""; $("g-phone").value = ""; $("g-email").value = ""; $("g-seats").value = "2";
      $("g-name").focus();
      return load();
    }, function (err) { s.textContent = err.message; })
      .then(function () { $("add-btn").disabled = false; });
  });

  document.querySelectorAll(".filters button").forEach(function (b) {
    b.addEventListener("click", function () {
      filter = b.getAttribute("data-f");
      document.querySelectorAll(".filters button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      render();
    });
  });
  $("refresh").addEventListener("click", function () { load().catch(function (err) { $("list-status").textContent = err.message; }); });
  $("signout").addEventListener("click", function () { lock(""); });
  $("copy-open").addEventListener("click", function () { copy(inviteUrl(""), $("copy-open")); });

  if (pass) {
    load().then(unlock, function () { lock(""); });
  }
})();
