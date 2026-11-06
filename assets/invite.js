(function () {
  "use strict";

  var api = window.PeggyAPI;
  var config = window.PEGGY_CONFIG || {};
  var $ = function (id) { return document.getElementById(id); };

  var form = $("form"), done = $("done"), status = $("status"), send = $("send");
  var countField = $("count-field"), countOut = $("count"), hint = $("count-hint");
  var MINE = "peggy75-my-token";

  var params = new URLSearchParams(location.search);
  var token = (params.get("g") || "").trim();
  var invited = !!token; // came from a host's link, so use the name as the host wrote it
  var peek = params.get("peek") === "1"; // hosts checking a link don't count as an open
  var guest = null;
  var count = 1;

  if (!token) {
    try { token = localStorage.getItem(MINE) || ""; } catch (e) { token = ""; }
  }

  if (api.preview) $("preview-banner").hidden = false;
  if (config.rsvpBy) { $("by").textContent = "Kindly reply by " + config.rsvpBy + "."; $("by").hidden = false; }
  if (config.contactEmail) {
    var foot = $("foot");
    foot.append("Questions? ");
    var a = document.createElement("a");
    a.href = "mailto:" + config.contactEmail + "?subject=" + encodeURIComponent("Peggy’s 75th");
    a.textContent = config.contactEmail;
    foot.append(a);
  }

  function maxSeats() { return guest && guest.seats > 0 ? guest.seats : 10; }

  function setCount(n) {
    count = Math.max(1, Math.min(maxSeats(), n));
    countOut.textContent = String(count);
    $("minus").disabled = count <= 1;
    $("plus").disabled = count >= maxSeats();
  }


  function callName(name) {
    if (!name) return "";
    if (invited) return name;
    return name.split(/\s+/)[0]; // someone who typed "Bob Smith" gets "Bob"
  }

  function chosen() {
    var r = form.querySelector('input[name="reply"]:checked');
    return r ? r.value : "";
  }

  function syncCount() {
    countField.hidden = chosen() !== "yes";
  }

  function showDone(g) {
    var who = callName(g && g.name);
    if (g.reply === "yes") {
      $("done-big").textContent = "See you on the 19th" + (who ? ", " + who : "") + ".";
      $("done-small").textContent = g.attending === 1 ? "We have you down for one." : "We have you down for " + g.attending + ".";
    } else {
      $("done-big").textContent = "We’ll miss you" + (who ? ", " + who : "") + ".";
      $("done-small").textContent = "Thank you for letting us know.";
    }
    form.hidden = true;
    done.hidden = false;
  }

  function fill(g) {
    if (g.reply) {
      var r = form.querySelector('input[value="' + g.reply + '"]');
      if (r) r.checked = true;
    }
    setCount(g.attending || (g.seats > 0 ? g.seats : 1));
    $("note").value = g.note || "";
    if (g.seats > 1) { hint.textContent = "We’ve saved " + g.seats + " seats for you."; hint.hidden = false; }
    syncCount();
  }

  function greet(g) {
    if (!g || !g.name) return;
    $("to").textContent = "For " + g.name;
    $("to").hidden = false;
  }

  form.addEventListener("change", syncCount);
  $("minus").addEventListener("click", function () { setCount(count - 1); });
  $("plus").addEventListener("click", function () { setCount(count + 1); });
  $("change").addEventListener("click", function () {
    done.hidden = true; form.hidden = false; status.textContent = "";
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    status.classList.remove("error");
    var reply = chosen();
    var name = $("name").value.trim();
    if (!token && !name) { status.textContent = "Please add your name."; status.classList.add("error"); $("name").focus(); return; }
    if (!reply) { status.textContent = "Please choose yes or no."; status.classList.add("error"); return; }

    send.disabled = true;
    status.textContent = "Sending…";
    api.rsvp({ token: token, name: name, reply: reply, attending: count, note: $("note").value })
      .then(function (res) {
        if (!token && res.token) {
          token = res.token;
          try { localStorage.setItem(MINE, token); } catch (err) { /* fine */ }
        }
        guest = Object.assign({}, guest || {}, res.guest);
        status.textContent = "";
        showDone(guest);
      })
      .catch(function (err) {
        status.textContent = err.message || "That didn’t go through. Please try again.";
        status.classList.add("error");
      })
      .then(function () { send.disabled = false; });
  });

  setCount(1);

  if (token) {
    api.guest(token, peek)
      .then(function (res) {
        guest = res.guest;
        greet(guest);
        fill(guest);
        if (guest.reply) showDone(guest);
      })
      .catch(function () {
        // Unknown or removed link: fall back to the open form.
        token = "";
        invited = false;
        try { localStorage.removeItem(MINE); } catch (e) { /* fine */ }
        $("name-field").hidden = false;
      });
  } else {
    $("name-field").hidden = false;
  }
})();
