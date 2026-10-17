#!/usr/bin/env node
/* Optionaler Browser-E2E (nicht Teil von npm test, braucht Playwright + Chromium):
 *   NODE_PATH=/pfad/zu/node_modules node test/e2e.browser.js
 * Startet einen lokalen Fake-Confluence (Content Properties, Anhänge, User/Gruppe, Seite) auf
 * Basis von test/helpers.js, lädt htmlMacro.html + persistence.js + app.js und prüft:
 * Migration aus dem Live-Format wpstore v2, Speichern, Speicherfehler-Banner, Schreibschutz bei
 * Ladefehler, Admin-Datenstände + Wiederherstellung, Unload ohne Datenverlust, Build-Version im Fuß. */
"use strict";
var http = require("http"), fs = require("fs"), path = require("path");
var H = require("./helpers"), P = require("../persistence.js");
var pw = require("playwright");
var ROOT = H.ROOT, PID = "4711";

function legacyModel() {
  return { version: 2, config: { confirmWindowDays: 21, reminderLeadDays: 3 }, members: [],
    requests: [{ id: "r1", date: "2027-06-05", dienstVon: "Anna A", dienstVonUser: "anna", eintragVom: "2026-10-01", kann: ["bert"], best: null, passed: [], remindedAt: null, confirmNotifiedAt: null, bestAt: null },
               { id: "r2", date: "2027-06-12", dienstVon: "Bert B", dienstVonUser: "bert", eintragVom: "2026-10-01", kann: [], best: null, passed: [], remindedAt: null, confirmNotifiedAt: null, bestAt: null }] };
}
function setup() {
  var mt = new H.MockTransport(), fake = new H.FakeConfluence(mt, PID);
  var chunks = P.splitChunks(JSON.stringify(legacyModel()), 80);
  chunks.forEach(function (c, i) { mt.store["wpstore-9-lv9-" + i] = { value: JSON.stringify({ d: c }), version: 1 }; });
  mt.store.wpstore = { value: JSON.stringify({ v: 2, gen: 9, n: chunks.length, count: 2, sfx: "lv9" }), version: 4 };
  return { mt: mt, fake: fake };
}
function serve(env, me) {
  var macro = fs.readFileSync(path.join(ROOT, "htmlMacro.html"), "utf8").replace('["USERNAME_1", "USERNAME_2"]', '["carsten"]');
  var page = "<!doctype html><html><head><meta charset='utf-8'><meta name='ajs-page-id' content='" + PID + "'></head><body>" + macro + "</body></html>";
  return http.createServer(function (rq, rs) {
    var body = "";
    rq.on("data", function (c) { body += c; });
    rq.on("end", function () {
      var u = rq.url, p = u.split("?")[0];
      function send(st, txt, ct) { rs.writeHead(st, { "Content-Type": ct || "application/json" }); rs.end(txt); }
      if (p === "/") return send(200, page, "text/html; charset=utf-8");
      if (p === "/download/attachments/" + PID + "/app.js" || p === "/download/attachments/" + PID + "/persistence.js") {
        env.scriptHits.push(u);
        return send(200, fs.readFileSync(path.join(ROOT, p.split("/").pop()), "utf8"), "application/javascript");
      }
      if (p === "/rest/api/user/current") return send(200, JSON.stringify(me.current));
      if (/^\/rest\/api\/group\/.+\/member$/.test(p)) return send(200, JSON.stringify({ results: me.members }));
      if (p === "/rest/api/content/" + PID && rq.method === "GET") return send(200, JSON.stringify({ id: PID, title: "T", space: { key: "S" }, version: { number: 1 }, body: { storage: { value: "" } } }));
      if (p === "/rest/api/content/" + PID && rq.method === "PUT") return send(200, "{}");
      if (env.failGet && env.failGet.test(p) && rq.method === "GET") return send(500, "{}");
      var r = env.fake.handle(rq.method, u, body || null);
      r.text().then(function (t) { send(r.status, t); });
    });
  });
}

var me = { current: { userKey: "carsten", username: "carsten", displayName: "Carsten W" },
  members: [{ userKey: "carsten", username: "carsten", displayName: "Carsten W" }, { userKey: "anna", username: "anna", displayName: "Anna A" }, { userKey: "bert", username: "bert", displayName: "Bert B" }] };

(async function () {
  var env = setup(); env.scriptHits = [];
  var srv = serve(env, me); await new Promise(function (r) { srv.listen(0, r); });
  var base = "http://127.0.0.1:" + srv.address().port + "/";
  var browser = await pw.chromium.launch({ executablePath: process.env.CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  var errors = [];
  async function open() {
    var ctx = await browser.newContext(), pg = await ctx.newPage();
    pg.on("pageerror", function (e) { errors.push(String(e)); });
    pg.on("dialog", function (d) { d.accept(); });
    await pg.goto(base); await pg.waitForSelector("#counts .chip", { timeout: 8000 }).catch(function () {});
    await pg.evaluate(function () { var t = document.getElementById("tab-c"); if (t) t.click(); });   // Listenansicht
    return pg;
  }
  var ok = H.ok;
  try {
    // 1) Laden aus Live-Format, nichts geschrieben
    var before = JSON.stringify(env.mt.store);
    var pg = await open();
    ok("E2E: App lädt Altformat (2 Termine)", (await pg.locator("#future .row").count()) === 2);
    ok("E2E: Laden schreibt nichts", JSON.stringify(env.mt.store) === before);
    ok("E2E: Skripte mit Cache-Bust geladen, persistence.js zuerst", env.scriptHits.length === 2 && /persistence\.js\?v=\d+/.test(env.scriptHits[0]) && /app\.js\?v=\d+/.test(env.scriptHits[1]));
    ok("E2E: Build-Version im Fuß", /Build dev/.test(await pg.locator("#wp-foot").innerText()));
    // 2) Änderung -> Migration beim ersten Speichern
    await pg.locator('#future .row [data-act="kann"]').first().click();
    await pg.waitForFunction(function () { return true; });
    await new Promise(function (r) { setTimeout(r, 2500); });
    var nm = env.mt.val("vertretios.manifest");
    ok("E2E: erstes Speichern migriert (vertretios.manifest gen 10)", nm && nm.fmt === 3 && nm.gen === 10);
    ok("E2E: wpstore ist Platzhalter für alte Tabs", env.mt.val("wpstore").sfx === P.GUARD_SFX);
    ok("E2E: Fuß zeigt Generation", /Generation 10/.test(await pg.locator("#wp-foot").innerText()));
    // 3) Speicherfehler sichtbar + Erneut versuchen
    env.mt.failPutMatching = /^vertretios\.store-/;
    await pg.locator('#future .row [data-act="kann"]').nth(1).click();
    await pg.waitForSelector("#wp-saveerr", { timeout: 6000 }).catch(function () {});
    ok("E2E: Speicherfehler-Banner sichtbar", await pg.locator("#wp-saveerr").isVisible().catch(function () { return false; }));
    env.mt.failPutMatching = null;
    await pg.locator('#wp-saveerr [data-status-act="retry"]').click();
    await new Promise(function (r) { setTimeout(r, 1500); });
    ok("E2E: Erneut versuchen speichert, Banner weg", (await pg.locator("#wp-saveerr").count()) === 0 && env.mt.val("vertretios.manifest").gen === 11);
    // 4) Unload: kein Sync-Save, keine Löschungen
    var keysBefore = env.mt.keys().length;
    await pg.locator('#future .row [data-act="kann"]').first().click();
    await pg.evaluate(function () { document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("beforeunload")); });
    await new Promise(function (r) { setTimeout(r, 1500); });
    var F = new P.Store(env.mt); var fm = await F.load();
    ok("E2E: Verstecken/Unload -> async Save, nichts gelöscht, Daten ladbar", env.mt.keys().length > keysBefore && fm.requests.length === 2 && !F.readOnly);
    await pg.close();
    // 5) Ladefehler (Chunk-GET 500) -> schreibgeschützt
    var man = env.mt.val("vertretios.manifest");
    env.failGet = new RegExp("vertretios\\.store-" + man.gen + "-");
    var pg2 = await open();
    await pg2.waitForSelector("#wp-loaderr", { timeout: 6000 }).catch(function () {});
    ok("E2E: Ladefehler-Banner sichtbar", await pg2.locator("#wp-loaderr").isVisible().catch(function () { return false; }));
    env.failGet = null; await pg2.close();
    // 6) Chunk gelöscht -> Rückfall schreibgeschützt -> Admin stellt wieder her
    delete env.mt.store[P.chunkKey(man.gen, 0, man.token)];
    var w0 = env.mt.writes;
    var pg3 = await open();
    await pg3.waitForSelector("#wp-recbar", { timeout: 6000 }).catch(function () {});
    ok("E2E: Rückfall-Banner + schreibgeschützt", await pg3.locator("#wp-recbar").isVisible().catch(function () { return false; }) && await pg3.evaluate(function () { return document.getElementById("wp-root").classList.contains("wp-ro"); }));
    await pg3.evaluate(function () { var b = document.querySelector('[data-act="kann"]'); if (b) b.click(); });
    await new Promise(function (r) { setTimeout(r, 2000); });
    ok("E2E: im Rückfall wird nichts gespeichert", env.mt.writes === w0);
    await pg3.locator("#dsload").click();
    await pg3.waitForSelector("#dslist table", { timeout: 6000 });
    ok("E2E: Datenstände-Tabelle zeigt Alt- und Neuformat", /alt \(v2\)/.test(await pg3.locator("#dslist").innerText()) && /neu/.test(await pg3.locator("#dslist").innerText()));
    await pg3.locator("#dslist button[data-ds]").first().click();
    await new Promise(function (r) { setTimeout(r, 2000); });
    var G = new P.Store(env.mt); await G.load();
    ok("E2E: Wiederherstellung -> neue Generation, nicht mehr schreibgeschützt", !G.readOnly && G.gen > man.gen && (await pg3.locator("#wp-recbar").count()) === 0 && !(await pg3.evaluate(function () { return document.getElementById("wp-root").classList.contains("wp-ro"); })));
    ok("E2E: keine JS-Fehler", errors.length === 0, errors.join(" | "));
  } catch (e) { console.error(e); ok("E2E ohne Ausnahme", false, String(e)); }
  await browser.close(); srv.close();
  process.exit(H.summary("vertretios E2E") ? 1 : 0);
})();
