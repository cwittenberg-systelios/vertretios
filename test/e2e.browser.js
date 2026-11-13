#!/usr/bin/env node
/* Optionaler Browser-E2E (nicht Teil von npm test, braucht Playwright + Chromium):
 *   NODE_PATH=/pfad/zu/node_modules node test/e2e.browser.js
 * Startet einen lokalen Fake-Confluence (Content Properties, Anhänge, User/Gruppe, Seite) auf
 * Basis von test/helpers.js, lädt htmlMacro.html + persistence.js + app.js und prüft:
 * Migration aus dem Live-Format wpstore v2, Speichern, Speicherfehler-Banner, Schreibschutz bei
 * Ladefehler, Admin-Datenstände + Wiederherstellung, Unload ohne Datenverlust, Build-Version im Fuß,
 * Nicht-Mitglied (nur Ansicht), zwei Nutzer mit veraltetem Tab (kann/Zusage), Auto-Aktualisierung,
 * Escaping, ausgeschiedene Vertretung, Mails erst nach erfolgreichem Speichern. */
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
      if (p === "/rest/share-page/latest/share") { env.shares.push(JSON.parse(body || "{}")); return send(200, "{}"); }
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
  var env = setup(); env.scriptHits = []; env.shares = [];
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
    ok("E2E: Skripte ohne ?v= geladen, persistence.js zuerst", env.scriptHits.length === 2 && /persistence\.js$/.test(env.scriptHits[0]) && /app\.js$/.test(env.scriptHits[1]));
    ok("E2E: Build-Version im Fuß", /Build dev/.test(await pg.locator("#wp-foot").innerText()));
    ok("E2E: alter Engine-Selbsttest entfernt", (await pg.locator("#diagcard").count()) === 0);
    var w0st = env.mt.writes;
    await pg.locator("#selftestbtn").click();
    await pg.waitForFunction(function () { var e = document.getElementById("selftest2"); return e && /Alle Tests gruen|Rote Tests/.test(e.innerText); }, null, { timeout: 8000 }).catch(function () {});
    var st2 = await pg.locator("#selftest2").innerText();
    ok("E2E: In-App-Selbsttest (Admin) komplett grün, inkl. Sortierung + Regeln", /^Alle Tests gruen/.test(st2) && /Sortierung \(\d+\/\d+\)/.test(st2) && /Regeln \(\d+\/\d+\)/.test(st2), st2.split("\n").filter(function (l) { return /\u2717/.test(l); }).join(" | "));
    ok("E2E: Selbsttest schreibt nichts", env.mt.writes === w0st);
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
    // 7) Nicht-Mitglied (nicht in der Gruppe): nur Ansicht, kein Gesuch, kein Schreiben, keine JS-Fehler
    var meSave = me.current; me.current = { userKey: "gast", username: "gast", displayName: "Gabi Gast" };
    var w7 = env.mt.writes, pg7 = await open();
    ok("E2E Gast: Nur-Ansicht-Banner, Termine sichtbar", (await pg7.locator("#wp-guestbar").count()) === 1 && (await pg7.locator("#future .row").count()) === 2);
    ok("E2E Gast: + Gesuch und Aktionsknöpfe ausgeblendet", !(await pg7.locator("#addbtn").isVisible()) && !(await pg7.locator('#future .row [data-act="kann"]').first().isVisible()));
    await pg7.evaluate(function () { document.getElementById("g-date").value = "2027-07-03"; document.getElementById("g-name").value = "Gabi Gast"; document.getElementById("savebtn").click(); var b = document.querySelector('[data-act="kann"]'); if (b) b.click(); });
    await new Promise(function (r) { setTimeout(r, 2500); });
    var G7 = new P.Store(env.mt); var m7 = await G7.load();
    ok("E2E Gast: erzwungene Klicks ändern und speichern nichts", env.mt.writes === w7 && m7.requests.length === 2 && (await pg7.locator("#future .row").count()) === 2);
    me.current = meSave; await pg7.close();
    // ---- ab hier: mehrere Nutzer ----
    var U = { carsten: me.members[0], anna: me.members[1], bert: me.members[2] };
    function iso(n) { var d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
    function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    async function stored() { var S = new P.Store(env.mt); return await S.load(); }
    function byId(m, id) { return m.requests.filter(function (x) { return x.id === id; })[0]; }
    async function openAs(u) { me.current = U[u]; var p = await open(); return p; }
    // 8) Veralteter Tab: Bert und Anna klicken nacheinander "kann" -> beide bleiben
    var pa = await openAs("anna"), pb = await openAs("bert");
    await pb.locator('#future .row [data-act="kann"]').nth(1).click(); await wait(3000);
    await pa.locator('#future .row [data-act="kann"]').nth(1).click(); await wait(3500);
    var k8 = byId(await stored(), "r2").kann;
    ok("E2E 2 Nutzer: kann aus veraltetem Tab überschreibt fremdes kann nicht", k8.indexOf("anna") >= 0 && k8.indexOf("bert") >= 0, JSON.stringify(k8));
    ok("E2E: Mitglieder werden nicht mitgespeichert", (await stored()).members.length === 0);
    // 8b) Auto-Aktualisierung: Berts Tab ist jetzt veraltet und hat nichts offen -> lädt beim Prüfen selbst nach
    await pb.evaluate(function () { document.dispatchEvent(new Event("visibilitychange")); }); await wait(2000);
    ok("E2E: unbeschäftigter Tab aktualisiert sich selbst (ohne Banner-Klick)", (await pb.locator('#future .row').nth(1).innerHTML()).indexOf('title="Anna A') >= 0 && !(await pb.locator("#wp-update").isVisible().catch(function () { return false; })));
    await pa.close(); await pb.close();
    // 9) Zusage aus veraltetem Tab ersetzt fremde Zusage nicht; genau eine Benachrichtigung
    var pc = await openAs("carsten");
    await pc.locator("#addbtn").click(); await pc.fill("#g-date", iso(10)); await pc.fill("#g-name", "Carsten W"); await pc.locator("#savebtn").click(); await wait(3000);
    var pa2 = await openAs("anna"), pb2 = await openAs("bert"), sh0 = env.shares.length;
    await pb2.locator('#future .row [data-act="ueb"]').first().click(); await wait(3000);
    await pa2.locator('#future .row [data-act="ueb"]').first().click(); await wait(3500);
    var m9 = await stored(), r9 = m9.requests.filter(function (x) { return x.date === iso(10); })[0];
    ok("E2E 2 Nutzer: Zusage aus veraltetem Tab ersetzt fremde Zusage nicht", !!r9 && r9.best === "bert", r9 && r9.best);
    ok("E2E 2 Nutzer: nur eine Zusage-Mail (an den Ersteller)", env.shares.length === sh0 + 1 && env.shares[sh0].users[0] === "carsten", JSON.stringify(env.shares.slice(sh0)));
    ok("E2E 2 Nutzer: Verliererin sieht Hinweis und den echten Stand", /nicht übernommen/.test(await pa2.locator("#wp-msgs").innerText().catch(function () { return ""; })) && /Vertretung: Bert B/.test(await pa2.locator("#future .row").first().innerText()));
    await pa2.locator("#wp-msgs button").first().click();
    ok("E2E: Hinweis lässt sich schließen", (await pa2.locator("#wp-msgs > div").count()) === 0);
    await pa2.close(); await pb2.close();
    // 10) Escaping: HTML im Freitext "Dienst von" wird nicht ausgeführt
    await pc.locator("#addbtn").click(); await pc.fill("#g-date", iso(40)); await pc.fill("#g-name", '<img src=x onerror="window.__xss=1">'); await pc.locator("#savebtn").click(); await wait(3000);
    await pc.close();
    var px = await openAs("anna"); await px.evaluate(function () { document.getElementById("tab-a").click(); }); await wait(300);
    await px.evaluate(function () { document.getElementById("tab-c").click(); var d = document.querySelector('#future [data-detail]'); if (d) d.click(); }); await wait(300);
    ok("E2E: HTML in 'Dienst von' wird nicht ausgeführt", (await px.evaluate(function () { return window.__xss; })) === undefined && (await px.locator("#future img").count()) === 0 && (await stored()).requests.some(function (x) { return /<img/.test(x.dienstVon); }));
    await px.close();
    // 11) Ausgeschiedene Vertretung + fällige Erinnerung; Mail erst nach erfolgreichem Speichern
    var S11 = new P.Store(env.mt); await S11.load();
    S11.apply(function (m) {
      m.requests.push({ id: "dep", date: iso(2), dienstVon: "Anna A", dienstVonUser: "anna", eintragVom: iso(-9), kann: ["weg"], best: "weg", passed: [], remindedAt: null, confirmNotifiedAt: iso(-3), bestAt: iso(-3) });
      m.requests.push({ id: "due", date: iso(1), dienstVon: "Anna A", dienstVonUser: "anna", eintragVom: iso(-9), kann: ["bert"], best: "bert", passed: [], remindedAt: null, confirmNotifiedAt: iso(-3), bestAt: iso(-3) });
      return m;
    });
    await S11.persist();
    env.mt.failPutMatching = /^vertretios\.store-/; var sh1 = env.shares.length;
    var pd = await openAs("carsten"); await wait(3500);
    ok("E2E: ausgeschiedene Vertretung legt die App nicht lahm", (await pd.locator("#wp-loaderr").count()) === 0 && (await pd.locator("#future .row").count()) >= 4 && !(await pd.evaluate(function () { return document.getElementById("wp-root").classList.contains("wp-ro"); })));
    ok("E2E: Speichern fehlgeschlagen -> keine Erinnerungs-Mail", env.shares.length === sh1 && await pd.locator("#wp-saveerr").isVisible().catch(function () { return false; }));
    env.mt.failPutMatching = null;
    await pd.locator('#wp-saveerr [data-status-act="retry"]').click(); await wait(3000);
    var m11 = await stored();
    ok("E2E: nach erfolgreichem Speichern genau eine Erinnerung an die Vertretung", env.shares.length === sh1 + 1 && env.shares[sh1].users[0] === "bert" && byId(m11, "due").remindedAt === iso(0) && !byId(m11, "dep").remindedAt, JSON.stringify(env.shares.slice(sh1)));
    var pe = await openAs("anna"); await wait(2500);
    ok("E2E: zweiter Seitenaufruf verschickt die Erinnerung nicht erneut", env.shares.length === sh1 + 1);
    await pd.close(); await pe.close();
    ok("E2E: keine JS-Fehler", errors.length === 0, errors.join(" | "));
  } catch (e) { console.error(e); ok("E2E ohne Ausnahme", false, String(e)); }
  await browser.close(); srv.close();
  process.exit(H.summary("vertretios E2E") ? 1 : 0);
})();
