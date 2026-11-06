// Runs apps-script/Code.gs against a fake Google Sheet, and the browser preview store
// against fake storage, so both can be checked with `node --test` and no Google account.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function fakeSheet() {
  const data = []; // rows of values, row 1 = headers
  const width = () => Math.max(0, ...data.map((r) => r.length));
  const sheet = {
    data,
    getLastRow: () => data.length,
    getRange(a, b, c, d) {
      if (typeof a === "string") return { setNumberFormat() { return this; } };
      const row = a, col = b, rows = c || 1, cols = d || 1;
      return {
        getValues() {
          const out = [];
          for (let r = 0; r < rows; r++) {
            const src = data[row - 1 + r] || [];
            out.push(Array.from({ length: cols }, (_, k) => (src[col - 1 + k] === undefined ? "" : src[col - 1 + k])));
          }
          return out;
        },
        setValues(vals) {
          vals.forEach((v, r) => {
            data[row - 1 + r] = data[row - 1 + r] || [];
            v.forEach((x, k) => { data[row - 1 + r][col - 1 + k] = x; });
          });
          return this;
        },
        setValue(x) {
          data[row - 1] = data[row - 1] || [];
          // Sheets drops a leading apostrophe and stores the rest as text.
          data[row - 1][col - 1] = typeof x === "string" && x.startsWith("'") ? x.slice(1) : x;
          return this;
        },
        setFontWeight() { return this; }
      };
    },
    appendRow(v) { data.push(v.map((x) => (typeof x === "string" && x.startsWith("'") ? x.slice(1) : x))); },
    deleteRow(n) { data.splice(n - 1, 1); },
    setFrozenRows() {},
    width
  };
  return sheet;
}

function loadBackend(props = { HOST_PASSPHRASE: "cake" }) {
  const sheet = fakeSheet();
  let n = 0;
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => sheet, insertSheet: () => sheet }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] || null }) },
    ContentService: {
      MimeType: { JSON: "json" },
      createTextOutput: (s) => ({ body: s, setMimeType() { return this; } })
    },
    Utilities: { getUuid: () => "0000000000" + String(++n).padStart(2, "0") + "-aaaa-bbbb" },
    Date, JSON, Math, String, Number, Object, parseInt, isNaN
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../apps-script/Code.gs"), "utf8"), ctx);
  ctx.setup();
  const post = (body) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).body);
  return { post, sheet, ctx };
}

test("host actions need the passphrase", () => {
  const { post } = loadBackend();
  assert.equal(post({ action: "list", passphrase: "nope" }).ok, false);
  assert.equal(post({ action: "list" }).ok, false);
  assert.equal(post({ action: "list", passphrase: "cake" }).ok, true);
});

test("host actions are refused when no passphrase is set", () => {
  const { post } = loadBackend({});
  const res = post({ action: "list", passphrase: "" });
  assert.equal(res.ok, false);
  assert.match(res.error, /HOST_PASSPHRASE/);
});

test("add, open, rsvp, and see it on the list", () => {
  const { post } = loadBackend();
  const added = post({ action: "add", passphrase: "cake", name: "Carol and Jim", phone: "+1 512 555 0100", seats: 2 });
  assert.equal(added.ok, true);
  const token = added.guest.token;
  assert.ok(token.length >= 10);

  // A host checking the link doesn't count as an open.
  post({ action: "guest", token, peek: true });
  let list = post({ action: "list", passphrase: "cake" }).guests;
  assert.equal(list[0].opened, "");

  const g = post({ action: "guest", token });
  assert.deepEqual(g.guest, { name: "Carol and Jim", seats: 2, reply: "", attending: 0, note: "" });
  // Guests never see contact details.
  assert.equal(g.guest.phone, undefined);

  const r = post({ action: "rsvp", token, reply: "yes", attending: 5, note: "=HYPERLINK(\"x\")" });
  assert.equal(r.ok, true);
  assert.equal(r.guest.attending, 5, "guests may bring more than their seats");

  list = post({ action: "list", passphrase: "cake" }).guests;
  assert.equal(list[0].reply, "yes");
  assert.equal(list[0].attending, 5);
  assert.equal(list[0].phone, "+1 512 555 0100");
  assert.ok(list[0].opened && list[0].replied);
  assert.equal(list[0].note, "=HYPERLINK(\"x\")", "stored as text, not a formula");

  const r2 = post({ action: "rsvp", token, reply: "no" });
  assert.equal(r2.guest.attending, 0);
});

test("open link reply creates a guest", () => {
  const { post } = loadBackend();
  assert.equal(post({ action: "rsvp", reply: "yes" }).ok, false, "needs a name");
  const r = post({ action: "rsvp", name: "Ruth", reply: "yes", attending: 3 });
  assert.equal(r.ok, true);
  assert.ok(r.token);
  const list = post({ action: "list", passphrase: "cake" }).guests;
  assert.equal(list.length, 1);
  assert.equal(list[0].source, "open link");
  assert.equal(list[0].attending, 3);
  // The returned token lets them change their reply later.
  assert.equal(post({ action: "rsvp", token: r.token, reply: "no" }).guest.reply, "no");
});

test("rows typed into the sheet get tokens; Yes typed by hand counts", () => {
  const { post, sheet } = loadBackend();
  sheet.data.push(["", "Uncle Dale", "", "", 3, "Yes", 2, "", "", "", "", ""]);
  const list = post({ action: "list", passphrase: "cake" }).guests;
  assert.equal(list.length, 1);
  assert.ok(list[0].token);
  assert.equal(list[0].reply, "yes");
  assert.equal(post({ action: "guest", token: list[0].token }).guest.name, "Uncle Dale");
});

test("bad input is refused", () => {
  const { post } = loadBackend();
  assert.equal(post({ action: "guest", token: "missing" }).ok, false);
  assert.equal(post({ action: "rsvp", token: "missing", reply: "yes" }).ok, false);
  assert.equal(post({ action: "rsvp", name: "X", reply: "maybe" }).ok, false);
  assert.equal(post({ action: "nope" }).ok, false);
  assert.equal(post({ action: "add", passphrase: "cake", name: "  " }).ok, false);
});

test("remove deletes the right row", () => {
  const { post } = loadBackend();
  const a = post({ action: "add", passphrase: "cake", name: "A", seats: 1 }).guest.token;
  const b = post({ action: "add", passphrase: "cake", name: "B", seats: 1 }).guest.token;
  assert.equal(post({ action: "remove", passphrase: "cake", token: a }).ok, true);
  const list = post({ action: "list", passphrase: "cake" }).guests;
  assert.deepEqual(list.map((g) => g.token), [b]);
});

test("browser preview store behaves like the backend", async () => {
  const store = {};
  const ctx = {
    localStorage: { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; } },
    PEGGY_CONFIG: { apiUrl: "" },
    setTimeout: (fn) => fn(),
    Promise, Math, JSON, Date, Object, String, parseInt
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../assets/api.js"), "utf8"), ctx);
  const api = ctx.PeggyAPI;
  assert.equal(api.preview, true);
  await assert.rejects(api.list("wrong"));
  const added = await api.add("preview", { name: "Test", seats: 2 });
  const t = added.guest.token;
  await api.guest(t, true);
  assert.equal((await api.list("preview")).guests.find((g) => g.token === t).opened, "");
  await api.guest(t);
  const r = await api.rsvp({ token: t, reply: "yes", attending: 9 });
  assert.equal(r.guest.attending, 9);
  const walkin = await api.rsvp({ name: "Walk In", reply: "no" });
  assert.ok(walkin.token);
  await api.remove("preview", t);
  assert.equal((await api.list("preview")).guests.some((g) => g.token === t), false);
});

test("party size starts from seats but tops out at 10", () => {
  const { post } = loadBackend();
  const token = post({ action: "add", passphrase: "cake", name: "Dale", seats: 2 }).guest.token;
  assert.equal(post({ action: "rsvp", token, reply: "yes", attending: 50 }).guest.attending, 10);
});
