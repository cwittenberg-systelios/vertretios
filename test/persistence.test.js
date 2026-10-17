/* Unit-Tests persistence.js (Übergabe §3.2): Interleaving, 500 nach/ohne Commit, Chunk-Verlust,
 * Lesefehler, Bereichssperre, Migration aus dem v2-Format (beide Chunk-Schlüsselformen) und aus
 * wpdata.json, Platzhalter gegen alte Browser-Tabs (echter Altcode aus main), Historie/GC,
 * Admin-Datenstände + Wiederherstellung, ConfluenceTransport. */
"use strict";
var H = require("./helpers"), ok = H.ok, eq = H.eq, MockTransport = H.MockTransport;
var P = require("../persistence.js");

function req(id, date, o) { o = o || {}; return { id: id, date: date, dienstVon: o.dv || "Anna", kann: o.kann || [], best: o.best || null, passed: [] }; }
function baseModel() { return { version: 2, config: { confirmWindowDays: 21 }, members: [{ id: "u1", name: "Anna" }], requests: [req("r1", "2026-11-07"), req("r2", "2026-11-14")] }; }
function upsert(r) { return function (m) { m.requests = m.requests.filter(function (x) { return x.id !== r.id; }); m.requests.push(JSON.parse(JSON.stringify(r))); return m; }; }
function remove(id) { return function (m) { m.requests = m.requests.filter(function (x) { return x.id !== id; }); return m; }; }
function ids(m) { return (m.requests || []).map(function (r) { return r.id; }).sort(); }
function has(m, id) { return (m.requests || []).some(function (r) { return r.id === id; }); }

// Live-Format der aktuellen App (main): Manifest wpstore {v:2,gen,n,count,sfx}, Chunks {d:"…"}
function legacyV2(mt, model, gen, sfx, parts) {
  var chunks = P.splitChunks(JSON.stringify(model), parts || 24000);
  chunks.forEach(function (c, i) { mt.store[P.legacyChunkKey(gen, i, sfx)] = { value: JSON.stringify({ d: c }), version: 1 }; });
  var man = { v: 2, gen: gen, n: chunks.length, count: model.requests.length }; if (sfx) man.sfx = sfx;
  mt.store[P.LEGACY] = { value: JSON.stringify(man), version: 7 };
  return mt;
}
function seeded() {
  var mt = new MockTransport(), s = new P.Store(mt);
  return s.load().then(function () { s.apply(function () { return baseModel(); }); return s.persist(); }).then(function () { return mt; });
}
function newMan(mt) {
  var best = null;
  mt.keys().forEach(function (k) { if (P.manifestRank(k) >= 1) { var v = mt.val(k); if (!best || v.gen > best.v.gen) best = { k: k, v: v }; } });
  return best;
}
function settle(s) { return Promise.resolve(s && s.guardPromise).then(function () { return new Promise(function (r) { setTimeout(r, 0); }); }); }

module.exports = function () {
  return Promise.resolve()

  /* --- Chunking + Schlüssel --- */
  .then(function () {
    var txt = JSON.stringify({ x: "Müller \"Örtchen\" ß€\n".repeat(3000) });
    var chunks = P.splitChunks(txt, 4000);
    var maxBytes = Math.max.apply(null, chunks.map(function (c) { return Buffer.byteLength(JSON.stringify({ d: c }), "utf8") - 6; }));
    ok("splitChunks: jeder Chunk ≤ Limit nach Escaping/UTF-8", maxBytes <= 4002, "max=" + maxBytes);
    eq("splitChunks: verlustfrei", chunks.join(""), txt);
    var em = "😀".repeat(1000), ce = P.splitChunks(em, 100);
    ok("splitChunks trennt keine Surrogat-Paare", ce.every(function (c) { return c.length % 2 === 0; }) && ce.join("") === em);
    eq("parseChunkKey neu", P.parseChunkKey("vertretios.store-7-abc123-2"), { layout: "new", gen: 7, token: "abc123", i: 2 });
    eq("parseChunkKey alt mit sfx", P.parseChunkKey("wpstore-7-mvb19c-0"), { layout: "legacy", gen: 7, token: "mvb19c", i: 0 });
    eq("parseChunkKey alt ohne sfx", P.parseChunkKey("wpstore-7-3"), { layout: "legacy", gen: 7, token: null, i: 3 });
    ok("parseChunkKey Manifeste = null", P.parseChunkKey("wpstore") === null && P.parseChunkKey("vertretios.manifest.2") === null);
    eq("Manifest-Folge wpstore -> .manifest -> .2 -> .3",
      [P.nextManifestKey("wpstore"), P.nextManifestKey("vertretios.manifest"), P.nextManifestKey("vertretios.manifest.2")],
      ["vertretios.manifest", "vertretios.manifest.2", "vertretios.manifest.3"]);
    eq("manifestRank", [P.manifestRank("wpstore"), P.manifestRank("vertretios.manifest"), P.manifestRank("vertretios.manifest.4"), P.manifestRank("x")], [0, 1, 4, -1]);
  })

  /* --- Migration aus dem v2-Format (neue Chunk-Form mit sfx), verlustfrei, beim ersten Speichern --- */
  .then(function () {
    var mt = legacyV2(new MockTransport(), baseModel(), 12, "mabc12xyz", 60);
    var before = JSON.stringify(mt.store), s = new P.Store(mt);
    return s.load().then(function (m) {
      eq("v2 (sfx): Altformat verlustfrei gelesen", ids(m), ["r1", "r2"]);
      ok("v2 (sfx): Laden schreibt nichts (Migration erst beim Speichern)", JSON.stringify(mt.store) === before && s.source === "legacy");
      s.apply(upsert(req("r3", "2026-11-21")));
      return s.persist();
    }).then(function (r) {
      var nm = mt.val("vertretios.manifest");
      ok("v2 (sfx): erstes Speichern migriert auf neues Manifest", r.ok && nm && nm.fmt === 3 && nm.gen === 13);
      ok("v2 (sfx): alte Chunks bleiben als Historie", !!mt.store[P.legacyChunkKey(12, 0, "mabc12xyz")]);
      var w = mt.val("wpstore");
      ok("v2 (sfx): wpstore zeigt alte Version auf den Platzhalter", w.v === 2 && w.n === 1 && w.sfx === P.GUARD_SFX && w.gen === 13);
      ok("v2 (sfx): Platzhalter-Chunk ist kein JSON", (function () { try { JSON.parse(mt.val(P.legacyChunkKey(13, 0, P.GUARD_SFX)).d); return false; } catch (e) { return true; } })());
      return new P.Store(mt).load();
    }).then(function (m) { eq("v2 (sfx): nach Migration alles da", ids(m), ["r1", "r2", "r3"]); });
  })

  /* --- Migration aus dem v2-Format (alte Chunk-Form ohne sfx) --- */
  .then(function () {
    var mt = legacyV2(new MockTransport(), baseModel(), 5, null, 50), s = new P.Store(mt);
    return s.load().then(function (m) {
      eq("v2 (ohne sfx): gelesen", ids(m), ["r1", "r2"]);
      s.apply(remove("r1"));
      return s.persist();
    }).then(function (r) {
      return new P.Store(mt).load().then(function (m) {
        ok("v2 (ohne sfx): Migration + Änderung verlustfrei", r.ok && JSON.stringify(ids(m)) === '["r2"]' && !!mt.store["wpstore-5-0"]);
      });
    });
  })

  /* --- Migration aus wpdata.json (kein Manifest vorhanden) --- */
  .then(function () {
    var mt = new MockTransport(), att = baseModel();
    var s = new P.Store(mt, { fallbackSource: function () { return Promise.resolve(att); } });
    return s.load().then(function (m) {
      ok("wpdata.json: als Quelle erkannt, nichts geschrieben", s.source === "attachment" && ids(m).length === 2 && mt.writes === 0);
      // ein anderer Tab hat inzwischen schon migriert und weitergearbeitet -> Erst-Import darf das nicht überschreiben
      var O = new P.Store(mt);
      return O.load().then(function () { O.apply(function () { var b = baseModel(); b.requests.push(req("rx", "2026-12-05")); return b; }); return O.persist(); })
        .then(function () { return s.saveMerge(m, P.replayInitial(m)); });
    }).then(function (saved) {
      ok("wpdata.json: Erst-Import überschreibt fremde Migration nicht", has(saved, "rx"));
    });
  })
  .then(function () {
    var mt = new MockTransport();
    var s = new P.Store(mt, { fallbackSource: function () { return Promise.reject(new Error("HTTP 500 Anhang")); } });
    return s.load().then(function () { ok("Anhang-Lesefehler -> Ladefehler", false); }, function (e) {
      ok("Anhang-Lesefehler -> Ladefehler, schreibgeschützt, kein Seed-Überschreiben", e.isLoadError && s.readOnly && mt.writes === 0);
    });
  })

  /* --- Alte App-Version (echter Code aus main) nach der Umstellung: scheitert statt zu überschreiben --- */
  .then(function () {
    var mt = legacyV2(new MockTransport(), baseModel(), 20, "oldsfx1", 60), fake = new H.FakeConfluence(mt);
    var oldTab = H.legacyStore(fake), oldModel;
    return oldTab.load().then(function (m) {
      oldModel = m;
      ok("Altversion liest den Live-Stand vor der Umstellung", m && m.requests.length === 2);
      var s = new P.Store(mt);
      return s.load().then(function () { s.apply(upsert(req("n1", "2026-12-12"))); return s.persist(); }).then(function () { return settle(s); });
    }).then(function () {
      var snap = JSON.stringify(mt.val("vertretios.manifest"));
      // (1) offener alter Tab speichert mit CAS -> 409 -> lädt neu -> Parse-Fehler am Platzhalter
      var local = JSON.parse(JSON.stringify(oldModel)); local.requests = [];   // „leer speichern"-Szenario
      return oldTab.saveMerge(local, function () { return local; }).then(function () { return "saved"; }, function (e) { return e; }).then(function (res) {
        ok("alter Tab: saveMerge scheitert", res !== "saved");
        ok("alter Tab: neues Manifest unverändert", JSON.stringify(mt.val("vertretios.manifest")) === snap);
        // (2) frisch geöffneter alter Tab: Laden scheitert (kein leeres Modell)
        var fresh = H.legacyStore(fake);
        return fresh.load().then(function () { return "loaded"; }, function (e) { return e; });
      }).then(function (res) {
        ok("alter Tab: Laden scheitert am Platzhalter (Parse-Fehler)", res instanceof Error || (res && res.name === "SyntaxError"), String(res));
        // (3) gefährlicher Unload-Pfad der Altversion (blinder Sync-PUT) -> neue Version lädt trotzdem korrekt
        oldTab.saveSync({ version: 2, config: {}, members: [], requests: [] });
        var s2 = new P.Store(mt);
        return s2.load().then(function (m) {
          ok("alter Tab Unload-Sync: neue Version lädt weiterhin den echten Stand", has(m, "n1") && m.requests.length === 3 && !s2.readOnly);
          return settle(s2).then(function () {
            var w = mt.val("wpstore");
            ok("alter Tab Unload-Sync: Platzhalter wird beim Laden wieder gesetzt", w && w.guard === true && w.sfx === P.GUARD_SFX);
            return H.legacyStore(fake).load().then(function () { return "loaded"; }, function (e) { return e; });
          });
        }).then(function (res) { ok("alter Tab: scheitert auch nach erneutem Platzhalter", res !== "loaded"); });
      });
    });
  })

  /* --- Zwei Schreiber verschachtelt -> beide Änderungen überleben, keine Verlierer-Chunks --- */
  .then(seeded).then(function (mt) {
    var A = new P.Store(mt), B = new P.Store(mt);
    return A.load().then(function () { return B.load(); }).then(function () {
      A.apply(upsert(req("ea", "2026-12-19")));
      B.apply(upsert(req("eb", "2026-12-26")));
      var fired = false;
      mt.beforePut = function (key) {
        if (fired || !/^vertretios\.store-/.test(key)) return null;
        fired = true; mt.beforePut = null;
        return B.persist();
      };
      return A.persist();
    }).then(function (rA) {
      ok("Interleaving: A meldet Erfolg nach Merge", rA.ok);
      return new P.Store(mt).load().then(function (m) {
        ok("Interleaving: beide Änderungen überleben", has(m, "ea") && has(m, "eb") && has(m, "r1"));
        var perGen = {}; mt.keys().forEach(function (k) { var pk = P.parseChunkKey(k); if (pk && pk.layout === "new") (perGen[pk.gen] = perGen[pk.gen] || {})[pk.token] = 1; });
        ok("Interleaving: keine Verlierer-Chunks", Object.keys(perGen).every(function (g) { return Object.keys(perGen[g]).length === 1; }), JSON.stringify(perGen));
      });
    });
  })

  /* --- Dauerkonflikt -> ok:false, Queue bleibt, Retry gelingt --- */
  .then(seeded).then(function (mt) {
    var s = new P.Store(mt), O = new P.Store(mt), n = 0, inHook = false;
    return s.load().then(function () { return O.load(); }).then(function () {
      s.apply(upsert(req("ec", "2027-01-02")));
      mt.beforePut = function (key) {
        if (inHook || key !== "vertretios.manifest" || n >= 3) return null;
        n++; inHook = true; O.apply(upsert(req("o" + n, "2027-01-0" + (n + 2))));
        return O.persist().then(function () { inHook = false; });
      };
      return s.persist();
    }).then(function (r) {
      mt.beforePut = null;
      ok("Dauerkonflikt -> ok:false", !r.ok && /konflikt/i.test(r.error));
      eq("Dauerkonflikt: eigene Deltas bleiben", s.replayQueue.length, 1);
      return s.persist();
    }).then(function (r2) {
      return new P.Store(mt).load().then(function (m) { ok("Retry nach Dauerkonflikt: alles da", r2.ok && has(m, "ec") && has(m, "o1") && has(m, "o3")); });
    });
  })

  /* --- 500 nach Commit -> Erfolg erkannt, Daten ladbar --- */
  .then(seeded).then(function (mt) {
    var s = new P.Store(mt);
    return s.load().then(function () {
      s.apply(upsert(req("h1", "2027-01-09")));
      mt.failAfterCommitMatching = /^vertretios\.manifest$/;
      return s.persist();
    }).then(function (r) {
      mt.failAfterCommitMatching = null;
      ok("500 nach Commit: als Erfolg erkannt", r.ok);
      var F = new P.Store(mt);
      return F.load().then(function (m) { ok("500 nach Commit: Chunks nicht gelöscht, ladbar", !F.recovered && has(m, "h1")); });
    });
  })

  /* --- 500 ohne Commit -> Fehler, Daten unverändert, Retry klappt --- */
  .then(seeded).then(function (mt) {
    var s = new P.Store(mt), before = mt.store["vertretios.manifest"].value;
    return s.load().then(function () {
      s.apply(upsert(req("h2", "2027-01-16")));
      mt.failPutMatching = /^vertretios\.manifest$/;          // 400: kein Umzug, klarer Fehler
      return s.persist().then(function () { ok("Fehler ohne Commit -> rejected", false); }, function (e) {
        mt.failPutMatching = null;
        ok("Fehler ohne Commit -> rejected, Manifest unverändert, Queue erhalten", e.status === 400 && mt.store["vertretios.manifest"].value === before && s.replayQueue.length === 1);
        var stray = mt.keys().filter(function (k) { var pk = P.parseChunkKey(k); return pk && pk.layout === "new" && pk.gen > JSON.parse(before).gen; });
        eq("Fehler ohne Commit: eigene Chunks aufgeräumt", stray, []);
        return s.persist();
      });
    }).then(function (r) {
      return new P.Store(mt).load().then(function (m) { ok("Fehler ohne Commit -> Retry gelingt", r.ok && has(m, "h2")); });
    });
  })
  .then(seeded).then(function (mt) {
    var s = new P.Store(mt), before = mt.store["vertretios.manifest"].value;
    return s.load().then(function () {
      s.apply(upsert(req("h3", "2027-01-23")));
      mt.failPut500Matching = /^vertretios\.manifest(\.\d+)?$/;   // 500 ohne Commit, auch Umzug scheitert
      return s.persist().then(function () { ok("500 ohne Commit -> rejected", false); }, function (e) {
        mt.failPut500Matching = null;
        ok("500 ohne Commit -> rejected, Manifest unverändert", e.status === 500 && mt.store["vertretios.manifest"].value === before);
        return s.persist();
      });
    }).then(function (r) {
      return new P.Store(mt).load().then(function (m) { ok("500 ohne Commit -> Retry gelingt", r.ok && has(m, "h3")); });
    });
  })
  /* --- Nachlesen nach 5xx scheitert -> nichts löschen --- */
  .then(seeded).then(function (mt) {
    var s = new P.Store(mt);
    return s.load().then(function () {
      s.apply(upsert(req("h4", "2027-01-30")));
      mt.failAfterCommitMatching = /^vertretios\.manifest$/;
      var armed = false;
      mt.beforeGet = function (key) { if (armed && key === "wpstore") { var e = new Error("Netz weg"); e.status = 0; throw e; } return null; };
      var origPut = mt.put.bind(mt);
      mt.put = function (k, v, ver) { return origPut(k, v, ver).catch(function (e) { if (k === "vertretios.manifest") armed = true; throw e; }); };
      return s.persist().then(function () { return "ok"; }, function (e) { return e; }).then(function (res) {
        mt.beforeGet = null; mt.failAfterCommitMatching = null; mt.put = origPut;
        var man = mt.val("vertretios.manifest");
        ok("Nachlesen scheitert -> Fehler gemeldet, Chunks des Manifests nicht gelöscht", res !== "ok" && !!mt.store[P.chunkKey(man.gen, 0, man.token)]);
      });
    });
  })

  /* --- Manifest zeigt auf gelöschten Chunk -> Retry, dann Rückfall schreibgeschützt; kein leeres Speichern --- */
  .then(seeded).then(function (mt) {
    var s0 = new P.Store(mt);
    return s0.load().then(function () { s0.apply(upsert(req("g2", "2027-02-06"))); return s0.persist(); }).then(function () {
      var man = mt.val("vertretios.manifest"), gets = 0;
      delete mt.store[P.chunkKey(man.gen, 0, man.token)];
      var w0 = mt.writes, s = new P.Store(mt);
      mt.beforeGet = function (k) { if (k === "vertretios.manifest") gets++; return null; };
      return s.load().then(function (m) {
        mt.beforeGet = null;
        ok("Chunk fehlt: Manifest 3x neu gelesen", gets === 3, "gets=" + gets);
        ok("Chunk fehlt: Rückfall auf vorige Generation, schreibgeschützt", s.recovered && s.recovered.fromGen === man.gen - 1 && s.readOnly && ids(m).join() === "r1,r2");
        var threw = false; try { s.apply(upsert(req("x", "2027-02-13"))); } catch (e) { threw = true; }
        ok("Chunk fehlt: apply verweigert", threw);
        return s.saveMerge({ version: 2, requests: [] }, function (f) { return f; }).then(function () { return "saved"; }, function () { return "blocked"; });
      }).then(function (res) {
        ok("Chunk fehlt: kein Speichern, keine Schreibzugriffe", res === "blocked" && mt.writes === w0);
        ok("Chunk fehlt: kein GC nach Rückfall", mt.keys().filter(function (k) { return /^vertretios\.store-/.test(k); }).length >= 1);
      });
    });
  })
  .then(function () {
    var mt = new MockTransport();
    mt.store["vertretios.manifest"] = { value: JSON.stringify({ fmt: 3, gen: 4, chunks: 1, token: "t4" }), version: 3 };
    var s = new P.Store(mt);
    return s.load().then(function () { ok("Chunk fehlt ohne Historie -> Ladefehler", false); }, function (e) {
      ok("Chunk fehlt ohne Historie -> Ladefehler, schreibgeschützt, keine Schreibzugriffe", e.isLoadError && s.readOnly && s.model === null && mt.writes === 0);
    });
  })

  /* --- Kaputtes JSON / unlesbares Manifest -> Ladefehler, nie leer --- */
  .then(function () {
    var mt = new MockTransport();
    mt.store["vertretios.manifest"] = { value: JSON.stringify({ fmt: 3, gen: 1, chunks: 1, token: "t1" }), version: 1 };
    mt.store[P.chunkKey(1, 0, "t1")] = { value: JSON.stringify({ d: "{\"requests\":[" }), version: 1 };
    var s = new P.Store(mt);
    return s.load().then(function () { ok("kaputtes JSON -> rejected", false); }, function (e) {
      ok("kaputtes JSON -> LoadError, readOnly, nichts geschrieben", e.isLoadError && s.readOnly && mt.writes === 0);
    });
  })
  .then(function () {
    var mt = new MockTransport();
    mt.store.wpstore = { value: JSON.stringify("kaputt{"), version: 2 };
    var s = new P.Store(mt, { fallbackSource: function () { return Promise.resolve(baseModel()); } });
    return s.load().then(function () { ok("unlesbares wpstore -> kein Seed/Anhang drüber", false); }, function (e) {
      ok("unlesbares wpstore (früher: migrate() überschrieb) -> Ladefehler, nichts geschrieben", e.isLoadError && mt.writes === 0);
    });
  })
  .then(function () {
    var mt = new MockTransport();
    mt.store.wpstore = { value: JSON.stringify({ v: 2, gen: 3, n: 0, count: 0 }), version: 2 };
    return new P.Store(mt).load().then(function (m) { ok("count/n = 0 -> leer erlaubt", m.requests.length === 0); });
  })

  /* --- Lesefehler (HTTP 500 beim GET) -> Ladefehler, KEIN Rückfall --- */
  .then(seeded).then(function (mt) {
    var s0 = new P.Store(mt);
    return s0.load().then(function () { s0.apply(upsert(req("n1", "2027-02-20"))); return s0.persist(); }).then(function () {
      var man = mt.val("vertretios.manifest");
      mt.failGetMatching = new RegExp("^" + P.chunkKey(man.gen, 0, man.token).replace(/\./g, "\\.") + "$");
      var s = new P.Store(mt);
      return s.load().then(function () { ok("GET-500 -> rejected", false); }, function (e) {
        mt.failGetMatching = null;
        ok("GET-500 -> Ladefehler, schreibgeschützt, kein Rückfall", s.readOnly && !s.recovered && e.status === 500);
      });
    });
  })
  .then(seeded).then(function (mt) {
    mt.failGetMatching = /^vertretios\.manifest$/;
    var s = new P.Store(mt);
    return s.load().then(function () { ok("Manifest-GET-500 -> rejected", false); }, function (e) {
      mt.failGetMatching = null;
      ok("Manifest-GET-500 -> Ladefehler (nicht „keine Daten“)", s.readOnly && e.status === 500 && mt.writes > 0);
    });
  })
  .then(function () {
    var mt = new MockTransport(); mt.failList = true;
    var s = new P.Store(mt, { fallbackSource: function () { return Promise.resolve(baseModel()); } });
    return s.load().then(function () { ok("Listing-Fehler ohne Manifest -> rejected", false); }, function (e) {
      ok("Listing-Fehler ohne Manifest -> Ladefehler statt Erst-Import", e.isLoadError && mt.writes === 0);
    });
  })

  /* --- Bereichssperre -> Umzug auf .manifest.2 / .3, weiteres Speichern und Laden ok --- */
  .then(seeded).then(function (mt) {
    mt.spaceLocked = { "vertretios.manifest": true, "wpstore": true };
    var s = new P.Store(mt);
    return s.load().then(function () { s.apply(upsert(req("sp1", "2027-03-06"))); return s.persist(); }).then(function (r) {
      ok("Bereichswechsel: Umzug auf vertretios.manifest.2", r.ok && r.migratedTo === "vertretios.manifest.2");
      var F = new P.Store(mt);
      return F.load().then(function (m) {
        ok("Bereichswechsel: Laden findet .2", F.manifestKey === "vertretios.manifest.2" && has(m, "sp1"));
        F.apply(upsert(req("sp2", "2027-03-13")));
        return F.persist();
      }).then(function (r2) {
        ok("Bereichswechsel: weiteres Speichern aktualisiert .2", r2.ok && !r2.migratedTo && mt.val("vertretios.manifest.2").gen === r2.gen && mt.store["vertretios.manifest.2"].version === 2);
        mt.spaceLocked["vertretios.manifest.2"] = true;
        F.apply(upsert(req("sp3", "2027-03-20")));
        return F.persist();
      }).then(function (r3) {
        var G = new P.Store(mt);
        return G.load().then(function (m) {
          ok("Bereichswechsel 2x: Umzug auf .3, alle Einträge da", r3.ok && G.manifestKey === "vertretios.manifest.3" && has(m, "sp1") && has(m, "sp2") && has(m, "sp3") && has(m, "r1"));
        });
      });
    });
  })
  /* --- Bereichssperre schon bei der Migration (Seite verschoben, Altformat) --- */
  .then(function () {
    var mt = legacyV2(new MockTransport(), baseModel(), 30, "zz9", 60), fake = new H.FakeConfluence(mt);
    mt.spaceLocked = { wpstore: true };
    var s = new P.Store(new P.ConfluenceTransport(fake.pid, "", fake.fetch()));
    return s.load().then(function () { s.apply(upsert(req("mv1", "2027-03-27"))); return s.persist(); }).then(function (r) {
      ok("Migration + Bereichssperre: Speichern über vertretios.manifest (ConfluenceTransport, spaceMismatch)", r.ok && mt.val("vertretios.manifest").gen === 31);
      return settle(s);
    }).then(function () {
      var w = mt.val("wpstore");
      ok("Migration + Bereichssperre: Platzhalter per Löschen + Neuanlegen gesetzt", w && w.guard === true && mt.store.wpstore.version === 1);
      return H.legacyStore(fake).load().then(function () { return "loaded"; }, function (e) { return e; });
    }).then(function (res) {
      ok("Migration + Bereichssperre: alte Version scheitert", res !== "loaded");
      return new P.Store(new P.ConfluenceTransport(fake.pid, "", fake.fetch())).load();
    }).then(function (m) { ok("Migration + Bereichssperre: Laden ok", has(m, "mv1") && has(m, "r2")); });
  })
  /* --- ConfluenceTransport: Fehlertext -> spaceMismatch; Listing paginiert --- */
  .then(function () {
    var mt = new MockTransport(), fake = new H.FakeConfluence(mt), t = new P.ConfluenceTransport(fake.pid, "", fake.fetch());
    for (var i = 0; i < 450; i++) mt.store["k" + i] = { value: "1", version: 1 };
    return t.list().then(function (keys) {
      ok("ConfluenceTransport.list paginiert (450 Schlüssel)", keys.length === 450);
      return t.put("a", { x: 1 }, 0);
    }).then(function () { return t.put("a", { x: 2 }, 0).then(function () { return "ok"; }, function (e) { return e.status; }); })
      .then(function (st) {
        ok("ConfluenceTransport: anlegen mit erwarteter Version 0 auf bestehendem Schlüssel -> 409", st === 409);
        mt.spaceLocked = { a: true };
        return t.put("a", { x: 3 }, 1).then(function () { return null; }, function (e) { return e; });
      }).then(function (e) {
        ok("ConfluenceTransport: 500 + „another space“ -> spaceMismatch", e && e.status === 500 && e.spaceMismatch === true);
      });
  })

  /* --- Historie: GC entfernt nur ≤ aktuell − 10, nie Neueres/Platzhalter --- */
  .then(seeded).then(function (mt) {
    var K = P.KEEP_GENERATIONS, man = mt.val("vertretios.manifest"), g = man.gen + 20;
    mt.store["vertretios.manifest"].value = JSON.stringify({ fmt: 3, gen: g, chunks: man.chunks, token: man.token });
    mt.store[P.chunkKey(g, 0, man.token)] = mt.store[P.chunkKey(man.gen, 0, man.token)];
    mt.store[P.chunkKey(g - K, 0, "old")] = { value: "{\"d\":\"x\"}", version: 1 };
    mt.store[P.chunkKey(g - K + 1, 0, "keep")] = { value: "{\"d\":\"x\"}", version: 1 };
    mt.store[P.chunkKey(g + 1, 0, "inflight")] = { value: "{\"d\":\"x\"}", version: 1 };
    mt.store["wpstore-3-0"] = { value: "{\"d\":\"x\"}", version: 1 };
    mt.store[P.legacyChunkKey(2, 0, P.GUARD_SFX)] = { value: JSON.stringify({ d: P.GUARD_TEXT }), version: 1 };
    var s = new P.Store(mt);
    return s.load().then(function () { return s.gc(); }).then(function () {
      ok("GC: Generation ≤ aktuell − 10 entfernt (neu + alt)", !mt.store[P.chunkKey(g - K, 0, "old")] && !mt.store["wpstore-3-0"]);
      ok("GC: jüngere Historie bleibt", !!mt.store[P.chunkKey(g - K + 1, 0, "keep")]);
      ok("GC: Generation in Arbeit bleibt", !!mt.store[P.chunkKey(g + 1, 0, "inflight")]);
      ok("GC: Platzhalter-Chunks bleiben", !!mt.store[P.legacyChunkKey(2, 0, P.GUARD_SFX)]);
    });
  })
  .then(seeded).then(function (mt) {
    var s = new P.Store(mt), k0 = mt.keys().filter(function (k) { return /^vertretios\.store-/.test(k); });
    return s.load().then(function () { s.apply(upsert(req("q1", "2027-04-03"))); return s.persist(); }).then(function () {
      ok("Speichern löscht alte Generation NICHT", k0.every(function (k) { return !!mt.store[k]; }));
    });
  })

  /* --- Admin: Datenstände auflisten + älteren Stand als neue Generation wiederherstellen --- */
  .then(function () {
    var mt = legacyV2(new MockTransport(), baseModel(), 40, "aa1", 60), s = new P.Store(mt), W = new P.Store(mt);
    return s.load().then(function () { s.apply(upsert(req("a3", "2027-04-10"))); return s.persist(); })
      .then(function () { return W.load(); })
      .then(function () { W.apply(function (m) { m.requests = []; return m; }); return W.persist(); })   // „Wipe"
      .then(function () { return s.describeSets(); })
      .then(function (d) {
        var cur = d.rows.filter(function (r) { return r.current; })[0];
        var legacyRow = d.rows.filter(function (r) { return r.layout === "legacy" && r.gen === 40; })[0];
        var prev = d.rows.filter(function (r) { return !r.current && r.ok && r.entries === 3; })[0];
        ok("Datenstände: aktueller (leerer) Stand markiert", cur && cur.entries === 0 && cur.gen === 42);
        ok("Datenstände: Altformat-Stand gelistet", legacyRow && legacyRow.ok && legacyRow.entries === 2);
        ok("Datenstände: Platzhalter nicht als Datenstand gelistet", d.rows.every(function (r) { return r.token !== P.GUARD_SFX; }));
        return s.restoreFrom(prev.layout, prev.gen, prev.token, prev.count);
      }).then(function (r) {
        var F = new P.Store(mt);
        return F.load().then(function (m) {
          ok("Wiederherstellung: als neue Generation, Daten zurück, nichts gelöscht", r.ok && r.gen === 43 && m.requests.length === 3 && !!mt.store["wpstore-40-aa1-0"]);
        });
      });
  })
  /* --- Rückfall + Wiederherstellung nach Chunk-Verlust --- */
  .then(seeded).then(function (mt) {
    var s0 = new P.Store(mt);
    return s0.load().then(function () { s0.apply(upsert(req("z1", "2027-04-17"))); return s0.persist(); }).then(function () {
      var man = mt.val("vertretios.manifest");
      delete mt.store[P.chunkKey(man.gen, 0, man.token)];
      var s = new P.Store(mt);
      return s.load().then(function () { return s.describeSets(); }).then(function (d) {
        var c = d.rows.filter(function (x) { return x.ok; })[0];
        return s.restoreFrom(c.layout, c.gen, c.token, c.count);
      }).then(function () {
        s.apply(upsert(req("z2", "2027-04-24")));
        return s.persist();
      }).then(function (r) {
        var F = new P.Store(mt);
        return F.load().then(function (m) { ok("Rückfall -> Admin-Wiederherstellung -> normales Speichern", r.ok && !F.recovered && !F.readOnly && has(m, "z2") && has(m, "r1")); });
      });
    });
  })
  /* --- alter Tab hat wpstore nach Migration überschrieben und neues Manifest fehlt -> erkannt --- */
  .then(function () {
    var mt = legacyV2(new MockTransport(), baseModel(), 50, "bb2", 60), s = new P.Store(mt);
    return s.load().then(function () { s.apply(upsert(req("c1", "2027-05-01"))); return s.persist(); }).then(function () {
      delete mt.store["vertretios.manifest"];   // simuliert: Anlegen bei Migration fehlgeschlagen
      var m2 = baseModel(); m2.requests = [];
      legacyV2(mt, m2, 51, null, 60);            // alter Tab schreibt Altformat (leer) blind
      var F = new P.Store(mt);
      return F.load().then(function (m) {
        ok("alter Tab überschrieb wpstore: kein stilles Übernehmen, Rückfall schreibgeschützt", F.readOnly && F.recovered && has(m, "c1"));
      }, function (e) { ok("alter Tab überschrieb wpstore: Ladefehler statt leer", e.isLoadError); });
    });
  })

  /* --- saveMerge mit Basis-Generation: nach Dauerkonflikt kein Lost Update --- */
  .then(seeded).then(function (mt) {
    var s = new P.Store(mt), O = new P.Store(mt), n = 0, inHook = false, base, local;
    return s.load().then(function () { base = s.gen; return O.load(); }).then(function () {
      local = JSON.parse(JSON.stringify(s.model)); local.requests.push(req("me1", "2027-05-08"));
      mt.beforePut = function (key) {
        if (inHook || key !== "vertretios.manifest" || n >= 3) return null;
        n++; inHook = true; O.apply(upsert(req("fx" + n, "2027-05-1" + n)));
        return O.persist().then(function () { inHook = false; });
      };
      var rp = function (f) { return upsert(req("me1", "2027-05-08"))(f); };
      return s.saveMerge(local, rp, base).then(function () { return "ok"; }, function (e) { return e; }).then(function (r1) {
        mt.beforePut = null;
        ok("saveMerge: Dauerkonflikt wird als Fehler gemeldet", r1 !== "ok" && r1.conflict);
        // Store kennt danach (z. B. durch einen Update-Poll/Neuladen) einen neueren Stand; die App
        // wiederholt mit ihrem alten lokalen Modell und dessen Basis-Generation.
        return s.refreshAndReplay().then(function () { return s.saveMerge(local, rp, base); });
      });
    }).then(function (saved) {
      return new P.Store(mt).load().then(function (m) {
        ok("saveMerge Retry: fremde Änderungen bleiben (kein Lost Update)", has(m, "me1") && has(m, "fx1") && has(m, "fx3") && has(saved, "fx3"));
      });
    });
  })

  /* --- Update-Poll: peekGen erkennt neue Generation, auch nach Umzug --- */
  .then(seeded).then(function (mt) {
    var s = new P.Store(mt), O = new P.Store(mt);
    return s.load().then(function () { return O.load(); }).then(function () {
      mt.spaceLocked = { "vertretios.manifest": true };
      O.apply(upsert(req("pk", "2027-05-22"))); return O.persist();
    }).then(function (r) { return s.peekGen().then(function (g) { ok("peekGen: neue Generation nach Umzug erkannt", g === r.gen && g > s.gen); }); });
  })

  /* --- persist ohne Änderungen = noop --- */
  .then(seeded).then(function (mt) {
    var s = new P.Store(mt), w0;
    return s.load().then(function () { w0 = mt.writes; return s.persist(); }).then(function (r) {
      ok("persist ohne Deltas schreibt nichts", r.ok && r.noop && mt.writes === w0);
    });
  });
};
