/**
 * Peggy 75 guest list backend.
 *
 * Paste this whole file into the Apps Script editor of the guest list Google Sheet
 * (Extensions > Apps Script). The sheet is the record: you and your dad can open it
 * any time, and edits made there show up on the host page.
 *
 * One setting lives in Project Settings > Script Properties:
 *   HOST_PASSPHRASE  the phrase that opens host.html
 */

var SHEET_NAME = "Guests";
var HEADERS = ["Token", "Name", "Email", "Phone", "Seats", "Reply", "Attending", "Note", "Opened", "Replied", "Added", "Source"];
var COL = {};
HEADERS.forEach(function (h, i) { COL[h] = i; });
var MAX_PARTY = 10; // guests may bring more than the seats you set, up to this

/** Run once from the editor. Creates the Guests tab with headers. */
function setup() {
  var sheet = getSheet_();
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight("bold");
  sheet.setFrozenRows(1);
  // Keep tokens and phone numbers as plain text so Sheets doesn't reformat them.
  sheet.getRange("A:A").setNumberFormat("@");
  sheet.getRange("D:D").setNumberFormat("@");
}

function doGet() {
  return json_({ ok: true, service: "peggy75" });
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || "{}"); } catch (err) { body = {}; }
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    return json_(route_(body));
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  } finally {
    lock.releaseLock();
  }
}

function route_(b) {
  switch (b.action) {
    case "guest": return guest_(b);
    case "rsvp": return rsvp_(b);
    case "list": checkHost_(b); return list_();
    case "add": checkHost_(b); return add_(b);
    case "remove": checkHost_(b); return remove_(b);
    default: throw new Error("Unknown request.");
  }
}

// ---------- Guest actions ----------

function guest_(b) {
  var rows = read_();
  var r = findRow_(rows, b.token);
  if (!r) throw new Error("We couldn’t find that invitation.");
  if (!r.g.opened && !b.peek) {
    writeCell_(r.row, "Opened", new Date());
    r.g.opened = new Date().toISOString();
  }
  return { ok: true, guest: public_(r.g) };
}

function rsvp_(b) {
  var reply = b.reply === "yes" ? "yes" : b.reply === "no" ? "no" : "";
  if (!reply) throw new Error("Please choose yes or no.");
  var now = new Date();
  var note = clean_(b.note, 500);
  var r;

  if (b.token) {
    r = findRow_(read_(), b.token);
    if (!r) throw new Error("We couldn’t find that invitation.");
  } else {
    var name = clean_(b.name, 120);
    if (!name) throw new Error("Please add your name.");
    var token = newToken_();
    appendGuest_({ token: token, name: name, email: clean_(b.email, 200), source: "open link", opened: now });
    r = findRow_(read_(), token);
  }

  var attending = reply === "yes" ? Math.max(1, Math.min(MAX_PARTY, parseInt(b.attending, 10) || 1)) : 0;
  writeCell_(r.row, "Reply", reply);
  writeCell_(r.row, "Attending", attending);
  writeCell_(r.row, "Note", note);
  writeCell_(r.row, "Replied", now);
  if (!r.g.opened) writeCell_(r.row, "Opened", now);

  r.g.reply = reply; r.g.attending = attending; r.g.note = note;
  return { ok: true, token: r.g.token, guest: public_(r.g) };
}

// ---------- Host actions ----------

function checkHost_(b) {
  var want = PropertiesService.getScriptProperties().getProperty("HOST_PASSPHRASE");
  if (!want) throw new Error("Set HOST_PASSPHRASE in Script Properties first.");
  if (String(b.passphrase || "") !== want) throw new Error("That passphrase didn’t work.");
}

function list_() {
  var rows = read_();
  // Rows typed straight into the sheet get a token the first time the list loads.
  rows.forEach(function (r) {
    if (r.g.name && !r.g.token) {
      r.g.token = newToken_();
      writeCell_(r.row, "Token", r.g.token);
      if (!r.g.source) writeCell_(r.row, "Source", "sheet");
    }
  });
  return {
    ok: true,
    guests: rows.filter(function (r) { return r.g.name; }).map(function (r) { return r.g; })
  };
}

function add_(b) {
  var name = clean_(b.name, 120);
  if (!name) throw new Error("Add a name.");
  var seats = Math.max(1, Math.min(20, parseInt(b.seats, 10) || 1));
  var token = newToken_();
  appendGuest_({ token: token, name: name, email: clean_(b.email, 200), phone: clean_(b.phone, 40), seats: seats, source: "host" });
  return { ok: true, guest: findRow_(read_(), token).g };
}

function remove_(b) {
  var r = findRow_(read_(), b.token);
  if (!r) throw new Error("That guest is already gone.");
  getSheet_().deleteRow(r.row);
  return { ok: true };
}

// ---------- Sheet helpers ----------

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
}

function read_() {
  var sheet = getSheet_();
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var values = sheet.getRange(2, 1, last - 1, HEADERS.length).getValues();
  return values.map(function (v, i) {
    return {
      row: i + 2,
      g: {
        token: String(v[COL.Token] || "").trim(),
        name: String(v[COL.Name] || "").trim(),
        email: String(v[COL.Email] || "").trim(),
        phone: String(v[COL.Phone] || "").trim(),
        seats: Number(v[COL.Seats]) || 0,
        reply: normReply_(v[COL.Reply]),
        attending: Number(v[COL.Attending]) || 0,
        note: String(v[COL.Note] || ""),
        opened: iso_(v[COL.Opened]),
        replied: iso_(v[COL.Replied]),
        added: iso_(v[COL.Added]),
        source: String(v[COL.Source] || "")
      }
    };
  });
}

function findRow_(rows, token) {
  token = String(token || "").trim();
  if (!token) return null;
  for (var i = 0; i < rows.length; i++) if (rows[i].g.token === token) return rows[i];
  return null;
}

function appendGuest_(g) {
  var row = HEADERS.map(function () { return ""; });
  row[COL.Token] = g.token;
  row[COL.Name] = g.name;
  row[COL.Email] = g.email || "";
  row[COL.Phone] = g.phone || "";
  row[COL.Seats] = g.seats || "";
  row[COL.Opened] = g.opened || "";
  row[COL.Added] = new Date();
  row[COL.Source] = g.source || "";
  getSheet_().appendRow(row);
}

function writeCell_(row, header, value) {
  getSheet_().getRange(row, COL[header] + 1).setValue(value);
}

function public_(g) {
  return { name: g.name, seats: g.seats, reply: g.reply, attending: g.attending, note: g.note };
}

// Hosts may type Yes/No by hand in the sheet.
function normReply_(v) {
  var s = String(v || "").trim().toLowerCase();
  if (s === "yes" || s === "y") return "yes";
  if (s === "no" || s === "n") return "no";
  return "";
}

function iso_(v) {
  if (!v) return "";
  if (Object.prototype.toString.call(v) === "[object Date]") return isNaN(v) ? "" : v.toISOString();
  var d = new Date(v);
  return isNaN(d) ? "" : d.toISOString();
}

// Trims, caps length, and stops guest text from being read as a sheet formula.
function clean_(v, max) {
  var s = String(v == null ? "" : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max || 200);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function newToken_() {
  return Utilities.getUuid().replace(/-/g, "").slice(0, 12);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
