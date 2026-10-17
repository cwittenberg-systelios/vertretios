/* =====================================================================
 * Vertretungspool Wochenendpräsenz — persistence.js
 * Content-Property-Store (gechunkt) mit Copy-on-Write, Manifest-CAS,
 * Nachlesen bei unklarer Antwort, Bereichswechsel-Umzug, Historie und
 * Admin-Wiederherstellung. Port von urlaubios/persistence.js (v1.1.3),
 * angepasst an das vertretios-Datenmodell {version, config, members, requests}.
 *
 * Transport-Interface (alle async, Promise):
 *   get(key)             -> { value:<obj>, version:<int> } | null (404)
 *   put(key, value, ver) -> { version:<int> }  // ver = erwartete Vorversion (0 = darf nicht existieren)
 *   del(key)             -> true               // best effort
 *   list()               -> [key, ...]         // alle Property-Schlüssel der Seite (paginiert)
 * Versions-Konflikt: put wirft Fehler mit .status === 409. Bereichssperre: .spaceMismatch.
 *
 * Schlüssel
 *   wpstore                       Altes Manifest (Rang 0). Wird von der neuen Version nur gelesen
 *                                 (Migration) und danach als PLATZHALTER für alte App-Versionen belegt.
 *   wpstore-<gen>-[<sfx>-]<i>     Alte Chunks {d:"…"} (lesbar, Historie).
 *   wpstore-<gen>-guard-0         Platzhalter-Chunk: absichtlich kein JSON -> alte Version scheitert.
 *   vertretios.manifest(.N)       Neues Manifest (Rang 1, N). Umzug auf den nächsten Schlüssel, wenn
 *                                 Confluence das Update ablehnt (Seite in anderen Bereich verschoben).
 *   vertretios.store-<gen>-<token>-<i>   Neue Chunks {d:"…"}; token eindeutig je Schreibversuch.
 *
 * Manifest-Wert der neuen Version (alle neuen Schlüssel, bei der Migration auch wpstore):
 *   { fmt:3, gen, chunks, token, entries, v:2, n:1, sfx:"guard" }
 *   fmt/gen/chunks/token liest die neue Version; v/n/sfx lenken eine alte Version auf den
 *   Platzhalter-Chunk wpstore-<gen>-guard-0 (Parse-Fehler statt leerem Speichern).
 * Reiner Platzhalter (ohne Datenzeiger): { guard:true, v:2, n:1, sfx:"guard", gen }.
 * ===================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.VertretiosPersistence = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var CHUNK_MAX_BYTES = 24000;          // je Chunk NACH JSON-Escaping/UTF-8 (Confluence-Limit 32 kB)
  var LEGACY = "wpstore";               // altes Manifest (Rang 0)
  var MANIFEST = "vertretios.manifest"; // neues Manifest (Rang 1), danach .2, .3, …
  var CHUNK_PREFIX = "vertretios.store";
  var GUARD_SFX = "guard";
  var GUARD_TEXT = "<<VERTRETIOS 3: Speicherformat geändert – bitte Seite neu laden (Strg+F5)>>"; // absichtlich kein JSON
  var LOAD_RETRIES = 3;
  var KEEP_GENERATIONS = 10;

  function LoadError(msg) { var e = new Error(msg); e.name = "LoadError"; e.isLoadError = true; return e; }

  /* ---------- Schlüssel ---------- */
  function chunkKey(gen, i, token) { return CHUNK_PREFIX + "-" + gen + "-" + token + "-" + i; }
  function legacyChunkKey(gen, i, sfx) { return LEGACY + "-" + gen + (sfx ? "-" + sfx : "") + "-" + i; }
  function setKey(layout, gen, i, token) { return layout === "legacy" ? legacyChunkKey(gen, i, token) : chunkKey(gen, i, token); }
  // -> {layout, gen, token|null, i} | null
  function parseChunkKey(key) {
    var m = /^vertretios\.store-(\d+)-([a-z0-9]+)-(\d+)$/.exec(key || "");
    if (m) return { layout: "new", gen: +m[1], token: m[2], i: +m[3] };
    m = /^wpstore-(\d+)-(?:([a-z0-9]+)-)?(\d+)$/.exec(key || "");
    if (m) return { layout: "legacy", gen: +m[1], token: m[2] || null, i: +m[3] };
    return null;
  }
  var MANIFEST_RE = /^(?:wpstore|vertretios\.manifest(?:\.(\d+))?)$/;
  function manifestRank(key) {
    if (key === LEGACY) return 0;
    var m = /^vertretios\.manifest(?:\.(\d+))?$/.exec(key || "");
    return m ? (m[1] ? +m[1] : 1) : -1;
  }
  function nextManifestKey(key) {
    var r = manifestRank(key) + 1;
    return MANIFEST + (r >= 2 ? "." + r : "");
  }

  /* ---------- Byte-genaues Chunking ---------- */
  function byteCost(ch) {
    var c = ch.charCodeAt(0);
    if (c === 34 || c === 92) return 2;
    if (c < 0x20) return 6;
    if (c < 0x80) return 1;
    if (c < 0x800) return 2;
    return 3;
  }
  function splitChunks(str, maxBytes) {
    maxBytes = maxBytes || CHUNK_MAX_BYTES;
    var out = [], start = 0, bytes = 0;
    for (var i = 0; i < str.length; i++) {
      var b = byteCost(str.charAt(i));
      if (bytes + b > maxBytes && i > start) {
        if (i > 0 && str.charCodeAt(i - 1) >= 0xD800 && str.charCodeAt(i - 1) <= 0xDBFF) i--;
        out.push(str.slice(start, i)); start = i; bytes = 0;
        b = byteCost(str.charAt(i));
      }
      bytes += b;
    }
    out.push(str.slice(start));
    return out;
  }
  function chunkText(v) {
    if (v && typeof v === "object" && typeof v.d === "string") return v.d;
    return typeof v === "string" ? v : null;
  }

  /* ---------- Manifest-Werte deuten ---------- */
  // -> {kind:"new"|"legacy"|"guard"|"bad", gen, count, token}
  function readManifestValue(key, raw) {
    var v = raw;
    if (typeof v === "string") { try { v = JSON.parse(v); } catch (e) { v = null; } }
    if (!v || typeof v !== "object") return { kind: "bad", gen: 0, count: 0, token: null };
    if (v.fmt === 3) return { kind: "new", gen: +v.gen || 0, count: +v.chunks || 0, token: v.token || null };
    if (key === LEGACY && v.guard) return { kind: "guard", gen: +v.gen || 0, count: 0, token: null };
    if (key === LEGACY && v.v === 2) return { kind: "legacy", gen: +v.gen || 0, count: +v.n || 0, token: v.sfx || null };
    return { kind: "bad", gen: +v.gen || 0, count: 0, token: null };
  }
  function newManifestValue(gen, count, token, entries) {
    return { fmt: 3, gen: gen, chunks: count, token: token, entries: entries, v: 2, n: 1, sfx: GUARD_SFX };
  }
  function pureGuardValue(gen) { return { guard: true, v: 2, n: 1, sfx: GUARD_SFX, gen: gen }; }

  /* ---------- Modell ---------- */
  function emptyModel() { return { version: 2, config: {}, members: [], requests: [] }; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function normalizeModel(m) {
    if (!m || typeof m !== "object" || Array.isArray(m)) throw LoadError("Gespeicherte Daten haben ein unerwartetes Format.");
    if (m.requests == null) m.requests = [];
    if (!Array.isArray(m.requests)) throw LoadError("Gespeicherte Daten haben ein unerwartetes Format (requests).");
    if (!m.members) m.members = [];
    if (!m.config) m.config = {};
    return m;
  }
  function entriesOf(m) { return (m && m.requests) ? m.requests.length : 0; }

  /* ---------- Store ---------- */
  // opts.fallbackSource: function() -> Promise<model|null>; nur gefragt, wenn KEIN Manifest existiert
  // (Migration aus dem Alt-Anhang wpdata.json). Fehler dort = Ladefehler, nie „leer".
  function Store(transport, opts) {
    this.t = transport;
    this.opts = opts || {};
    this.gen = 0;
    this.token = null;
    this.layout = null;        // "new" | "legacy" | null
    this.manifestKey = null;
    this.manifestVersion = 0;
    this.floorGen = 0;         // höchste vorhandene Chunk-Generation (neue Generationen liegen darüber)
    this.model = null;
    this.source = null;        // "store" | "legacy" | "attachment" | "recovered" | "empty" (count 0) | "none" (gar kein Manifest)
    this.replayQueue = [];
    this.readOnly = false;
    this.recovered = null;
    this.lastError = null;
  }

  function listKeys(t) {
    if (!t.list) return Promise.resolve(null);
    return Promise.resolve().then(function () { return t.list(); }).then(function (keys) {
      if (!keys || typeof keys.length !== "number") throw new Error("Property-Liste ungültig");
      return keys;
    }, function (e) {
      var err = new Error("Property-Liste nicht lesbar: " + (e && e.message || e)); err.status = e && e.status; throw err;
    });
  }

  // Maßgebliches Manifest bestimmen.
  // -> { key, value:{kind,gen,count,token}, version, none?, stale?, keys }
  // Regeln: Sobald ein Manifest der neuen Version (fmt 3) existiert, zählt nur noch dieses
  // (höchste Generation, bei Gleichstand der höhere Rang). Ein Altformat-wpstore daneben stammt
  // dann von einem alten Browser-Tab und wird ignoriert. Unlesbare neue Manifeste = Ladefehler.
  Store.prototype._manifest = function () {
    var t = this.t, self = this;
    // Listing-Fehler: wie urlaubios auf die bekannten Schlüssel zurückfallen (Lesen bleibt möglich).
    var listFailed = false;
    return listKeys(t).catch(function () { listFailed = true; return null; }).then(function (keys) {
      var cands = {}; cands[LEGACY] = 1;
      if (keys) keys.forEach(function (k) { if (MANIFEST_RE.test(k)) cands[k] = 1; });
      else cands[MANIFEST] = 1;
      var floor = 0;
      if (keys) keys.forEach(function (k) { var p = parseChunkKey(k); if (p && p.token !== GUARD_SFX && p.gen > floor) floor = p.gen; });
      self.floorGen = floor;
      var names = Object.keys(cands);
      return Promise.all(names.map(function (k) {
        return Promise.resolve(t.get(k)).then(function (r) {
          return r ? { key: k, value: readManifestValue(k, r.value), version: r.version } : null;
        });
      })).then(function (rs) {
        var best = null, legacy = null, guard = null, bad = null, hasNewSets = false;
        if (keys) keys.forEach(function (k) { var p = parseChunkKey(k); if (p && p.layout === "new") hasNewSets = true; });
        rs.forEach(function (r) {
          if (!r) return;
          var v = r.value;
          if (v.kind === "new") {
            if (!best || v.gen > best.value.gen || (v.gen === best.value.gen && manifestRank(r.key) > manifestRank(best.key))) best = r;
          } else if (v.kind === "legacy") legacy = r;
          else if (v.kind === "guard") guard = r;
          else bad = r;
        });
        if (bad && bad.key !== LEGACY) throw LoadError("Manifest " + bad.key + " nicht lesbar.");
        self.listFailed = listFailed;
        if (best) { best.keys = keys; return best; }
        // Altformat ist nur gültig, solange es keine neuen Datenstände gibt. Sonst hat ein alter Tab
        // den Zeiger nach der Umstellung überschrieben -> Rückfall (schreibgeschützt), Admin entscheidet.
        if (legacy) { legacy.keys = keys; legacy.stale = hasNewSets; return legacy; }
        // Nur Platzhalter/Unlesbares unter wpstore, aber kein neues Manifest: Datenzeiger fehlt.
        if (guard || bad) {
          var g = guard || bad;
          return { key: g.key, value: { kind: "guard", gen: g.value.gen, count: 0, token: null }, version: g.version, keys: keys, stale: true };
        }
        // „Keine Daten" nur, wenn das Listing sicher sagt, dass kein (umgezogenes) Manifest existiert.
        if (listFailed) throw LoadError("Property-Liste nicht lesbar – Datenstand kann nicht sicher bestimmt werden.");
        return { key: LEGACY, value: { kind: "none", gen: 0, count: 0, token: null }, version: 0, none: true, keys: keys };
      });
    });
  };

  // Chunk-Satz lesen und parsen -> model | LoadError (.missing / .guard)
  Store.prototype._readSet = function (layout, gen, token, count) {
    var t = this.t, reads = [];
    for (var i = 0; i < count; i++) reads.push(Promise.resolve(t.get(setKey(layout, gen, i, token))));
    return Promise.all(reads).then(function (chunks) {
      var parts = [];
      for (var j = 0; j < chunks.length; j++) {
        var txt = chunks[j] ? chunkText(chunks[j].value) : null;
        if (txt === null) { var e = LoadError("Daten unvollständig (Chunk fehlt, Generation " + gen + ")."); e.missing = true; throw e; }
        parts.push(txt);
      }
      if (parts[0] === GUARD_TEXT) { var g = LoadError("Platzhalter, kein Datenstand."); g.guard = true; throw g; }
      var model;
      try { model = JSON.parse(parts.join("")); }
      catch (err) { throw LoadError("Gespeicherte Daten nicht lesbar (JSON, Generation " + gen + ")."); }
      return normalizeModel(model);
    });
  };

  // Alle Chunk-Sätze aus dem Listing -> [{layout, gen, token, count}] absteigend nach gen
  Store.prototype.listSets = function (keys) {
    var t = this.t;
    var p = keys ? Promise.resolve(keys) : listKeys(t).catch(function () { return []; });
    return p.then(function (ks) {
      var sets = {};
      (ks || []).forEach(function (k) {
        var pk = parseChunkKey(k); if (!pk || pk.token === GUARD_SFX) return;
        var id = pk.layout + ":" + pk.gen + ":" + (pk.token || "");
        (sets[id] = sets[id] || { layout: pk.layout, gen: pk.gen, token: pk.token, idx: {} }).idx[pk.i] = 1;
      });
      return Object.keys(sets).map(function (id) {
        var s = sets[id], n = 0; while (s.idx[n]) n++;
        return { layout: s.layout, gen: s.gen, token: s.token, count: n };
      }).filter(function (s) { return s.count > 0; }).sort(function (x, y) {
        if (y.gen !== x.gen) return y.gen - x.gen;
        return (x.layout === "new" ? 0 : 1) - (y.layout === "new" ? 0 : 1);
      });
    });
  };

  // Frischen Stand laden -> {model, gen, token, layout, manifestKey, manifestVersion, source, recovered?}
  Store.prototype._fetchFresh = function (attempt) {
    var self = this; attempt = attempt || 0;
    return this._manifest().then(function (man) {
      var v = man.value;
      function res(model, source) {
        return { model: model, gen: v.gen, token: v.token, layout: v.kind === "legacy" ? "legacy" : "new",
                 manifestKey: man.key, manifestVersion: man.version, source: source };
      }
      if (man.stale) {
        return self._recover(man, LoadError(v.kind === "guard"
          ? "Manifest fehlt (nur Platzhalter vorhanden)."
          : "Altes Speicherformat wurde nach der Umstellung von einer alten App-Version überschrieben."), true);
      }
      if (man.none) {
        var fb = self.opts.fallbackSource;
        if (!fb) return res(emptyModel(), "none");
        return Promise.resolve().then(function () { return fb(); }).then(function (m) {
          if (m) return res(normalizeModel(clone(m)), "attachment");
          return res(emptyModel(), "none");
        }, function (e) {
          if (e && e.isLoadError) throw e;
          throw LoadError("Alt-Anhang nicht lesbar: " + (e && e.message || e));
        });
      }
      if (!v.count) return res(emptyModel(), "empty");
      var layout = v.kind === "legacy" ? "legacy" : "new";
      return self._readSet(layout, v.gen, v.token, v.count).then(function (model) {
        return res(model, layout === "legacy" ? "legacy" : "store");
      }, function (err) {
        if (err && err.missing && attempt + 1 < LOAD_RETRIES) return self._fetchFresh(attempt + 1);
        if (!err || !err.isLoadError) throw err;   // Transportfehler: kein Rückfall
        return self._recover(man, err, false);
      });
    });
  };
  // Rückfall: neuester vollständig lesbarer anderer Satz, nur anzeigen (readOnly).
  Store.prototype._recover = function (man, cause, anyGen) {
    var self = this, v = man.value;
    return this.listSets(man.keys).then(function (sets) {
      var cands = sets.filter(function (s) {
        if (!anyGen && s.gen > v.gen) return false;
        var isCur = s.gen === v.gen && (s.token || null) === (v.token || null) && s.layout === (v.kind === "legacy" ? "legacy" : "new");
        return !isCur;
      });
      function tryNext(i) {
        if (i >= cands.length) throw LoadError(cause.message + " Kein älterer vollständiger Datenstand gefunden – bitte Administrator:in informieren.");
        var c = cands[i];
        return self._readSet(c.layout, c.gen, c.token, c.count).then(function (model) {
          return { model: model, gen: v.gen, token: v.token, layout: v.kind === "legacy" ? "legacy" : "new",
                   manifestKey: man.key, manifestVersion: man.version, source: "recovered",
                   recovered: { fromGen: c.gen, fromToken: c.token, fromLayout: c.layout, manifestGen: v.gen, cause: cause.message } };
        }, function () { return tryNext(i + 1); });
      }
      return tryNext(0);
    });
  };
  Store.prototype._adopt = function (r) {
    this.model = r.model; this.gen = r.gen; this.token = r.token; this.layout = r.layout;
    this.manifestKey = r.manifestKey; this.manifestVersion = r.manifestVersion; this.source = r.source;
  };

  // Laden beim Start. Ladefehler -> readOnly + Fehler weiter; nie still leer.
  Store.prototype.load = function () {
    var self = this;
    return this._fetchFresh().then(function (r) {
      self._adopt(r);
      self.replayQueue = []; self.readOnly = false; self.lastError = null;
      self.recovered = r.recovered || null;
      if (self.recovered) self.readOnly = true;           // bis Admin bewusst wiederherstellt
      else { self.gc(); self.guardPromise = self.ensureGuard(); }   // best effort, nicht awaited
      return self.model;
    }).catch(function (e) {
      self.model = null; self.readOnly = true; self.lastError = e;
      throw e;
    });
  };

  // Generation des maßgeblichen Manifests (für Update-Hinweis).
  // Günstig (Poll alle 60 s): nur bekanntes Manifest + dessen Nachfolger lesen, ohne Property-Listing.
  Store.prototype.peekGen = function () {
    var t = this.t, k = this.manifestKey;
    if (!k || k === LEGACY) return this._manifest().then(function (m) { return m.value.gen || 0; });
    return Promise.all([t.get(k), t.get(nextManifestKey(k))]).then(function (rs) {
      var g = 0;
      rs.forEach(function (r, i) { if (r) { var v = readManifestValue(i ? nextManifestKey(k) : k, r.value); if (v.kind === "new" && v.gen > g) g = v.gen; } });
      return g;
    });
  };

  // Platzhalter für alte App-Versionen sicherstellen (best effort; nach jeder Umstellung/Ladung).
  // wpstore-<gen>-guard-0 = unlesbarer Chunk; wpstore = {v:2, n:1, sfx:"guard"} zeigt darauf.
  // Eine alte Version scheitert damit beim Laden (Parse-Fehler) und beim Speichern (409 -> Neuladen
  // -> Parse-Fehler) statt leer oder veraltet zu speichern.
  Store.prototype.ensureGuard = function () {
    var self = this, t = this.t;
    if (self.layout !== "new" || !self.gen) return Promise.resolve(false);
    var gen = self.gen;
    function ensureChunk(g) {
      var gk = legacyChunkKey(g, 0, GUARD_SFX);
      return Promise.resolve(t.get(gk)).then(function (c) { return c ? false : Promise.resolve(t.put(gk, { d: GUARD_TEXT })).then(function () { return true; }); });
    }
    return Promise.resolve().then(function () { return t.get(LEGACY); }).then(function (r) {
      var v = r ? readManifestValue(LEGACY, r.value) : null;
      if (v && v.kind === "new") {
        // wpstore trägt (noch) einen neuen Zeiger. Liegt der aktuelle Stand nur dort, vertretios.manifest nachziehen.
        var pre = (self.manifestKey === LEGACY && v.gen === gen)
          ? Promise.resolve(t.put(MANIFEST, r.value, 0)).then(function () { self.manifestKey = MANIFEST; }, function () {})
          : Promise.resolve();
        return pre.then(function () { return ensureChunk(v.gen); });
      }
      if (v && v.kind === "guard") return ensureChunk(v.gen);
      if (self.manifestKey === LEGACY) return false;
      // fehlt oder Altformat (alter Tab hat überschrieben): Platzhalter-Chunk zuerst, dann wpstore
      var val = pureGuardValue(gen);
      return ensureChunk(gen).then(function () {
        return Promise.resolve(t.put(LEGACY, val, r ? r.version : 0)).catch(function (err) {
          if (err && err.status !== 409 && (err.spaceMismatch || err.status >= 500)) {
            // Bereichssperre: unkritischen Platzhalter löschen und neu anlegen
            return Promise.resolve(t.del(LEGACY)).then(function () { return t.put(LEGACY, val, 0); });
          }
          throw err;
        });
      }).then(function () { return true; });
    }).catch(function () { return false; });
  };

  // Alte Chunk-Sätze (gen ≤ aktuell − KEEP) entfernen; neuere und Platzhalter nie.
  Store.prototype.gc = function () {
    var self = this, t = this.t;
    if (!t.list || self.recovered || !self.gen) return Promise.resolve(0);
    return Promise.resolve().then(function () { return t.list(); }).then(function (keys) {
      var dels = [];
      (keys || []).forEach(function (k) {
        var p = parseChunkKey(k); if (!p || p.token === GUARD_SFX) return;
        if (p.gen <= self.gen - KEEP_GENERATIONS) dels.push(Promise.resolve().then(function () { return t.del(k); }).catch(function () {}));
      });
      return Promise.all(dels).then(function () { return dels.length; });
    }).catch(function () { return 0; });
  };

  // Copy-on-Write mit Generations-Check. -> {conflict:false, gen, …} | {conflict:true}
  // Copy-on-Write mit Generations-Check. -> {conflict:false, gen, …} | {conflict:true}
  // Migration (maßgebliches Manifest ist noch wpstore): der Commit ist der CAS auf wpstore selbst
  // (ein gleichzeitiger alter Tab bekommt 409 bzw. wir), danach wird vertretios.manifest angelegt.
  // Der neue Wert lenkt alte Versionen über v/n/sfx auf den unlesbaren Platzhalter-Chunk.
  // force: Admin-Wiederherstellung darf auch über ein „stale"-Manifest schreiben.
  Store.prototype._saveChecked = function (model, expectedGen, force) {
    var self = this, t = this.t;
    return this._manifest().then(function (man) {
      var srvGen = man.value.gen || 0;
      if (self.listFailed) { var le = new Error("Property-Liste nicht lesbar – Speichern abgebrochen (kein Datenverlust). Bitte erneut versuchen."); le.status = 0; throw le; }
      if (srvGen !== expectedGen || (man.stale && !force)) return { conflict: true, srvGen: srvGen };
      var newGen = Math.max(expectedGen, self.floorGen || 0) + 1, token = newToken();
      var chunks = splitChunks(JSON.stringify(model));
      var manVal = newManifestValue(newGen, chunks.length, token, entriesOf(model));
      var target = man.key, targetVer = man.version, isMig = man.key === LEGACY;
      var phase = "chunks";
      function done(key, ver, extra) {
        var r = { conflict: false, gen: newGen, token: token, manifestKey: key, manifestVersion: ver, migrated: isMig };
        for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) r[k] = extra[k];
        if (key !== LEGACY) return r;
        // wpstore trägt jetzt den neuen Zeiger -> zusätzlich vertretios.manifest anlegen (best effort)
        return Promise.resolve().then(function () { return t.put(MANIFEST, manVal, 0); }).then(function (pr) {
          r.manifestKey = MANIFEST; r.manifestVersion = pr ? pr.version : undefined; return r;
        }, function () { return r; });
      }
      function dropOwn() {
        return Promise.all(chunks.map(function (c, i) {
          return Promise.resolve().then(function () { return t.del(chunkKey(newGen, i, token)); }).catch(function () {});
        }));
      }
      // 1) neue Chunks unter eigenem Token (bestehende Schlüssel werden nie überschrieben)
      var writes = chunks.map(function (c, i) { return Promise.resolve(t.put(chunkKey(newGen, i, token), { d: c }, 0)); });
      if (isMig) writes.push(Promise.resolve().then(function () { return t.put(legacyChunkKey(newGen, 0, GUARD_SFX), { d: GUARD_TEXT }); }).catch(function () {}));
      return Promise.all(writes).then(function () {
        // 2) Manifest per Versions-CAS umbiegen (bzw. bei Migration neu anlegen)
        phase = "manifest";
        return Promise.resolve(t.put(target, manVal, targetVer));
      }).then(function (putRes) {
        return done(target, putRes ? putRes.version : undefined, {});
      }).catch(function (err) {
        if (phase === "chunks" || (err && err.status === 409)) {
          return dropOwn().then(function () {
            if (err && err.status === 409) return { conflict: true, srvGen: srvGen };
            throw err;
          });
        }
        // 3) unklare Antwort (5xx, Netz): nachlesen; eigene Chunks nur löschen, wenn sicher nicht referenziert
        return self._manifest().then(function (now) {
          if (now.value.token === token && now.value.gen === newGen) return done(now.key, now.version, { afterError: err.message });
          if ((now.value.gen || 0) !== expectedGen) return dropOwn().then(function () { return { conflict: true, srvGen: now.value.gen }; });
          if (err && (err.spaceMismatch || (err.status >= 500 && err.status < 600))) {
            // Update abgelehnt (z. B. Seite in anderen Bereich verschoben): nächsten Schlüssel NEU anlegen
            var nk = nextManifestKey(target);
            return Promise.resolve(t.put(nk, manVal, 0)).then(function (pr) {
              return { conflict: false, gen: newGen, token: token, manifestKey: nk, manifestVersion: pr ? pr.version : undefined, migratedTo: nk, spaceMismatch: !!err.spaceMismatch };
            }, function (err2) {
              return dropOwn().then(function () {
                if (err2 && err2.status === 409) return { conflict: true, srvGen: expectedGen };
                throw err;
              });
            });
          }
          return dropOwn().then(function () { throw err; });
        }, function () { throw err; });   // Nachlesen fehlgeschlagen: nichts löschen
      });
    });
  };

  /* ---------- Admin: Datenstände ---------- */
  // -> { manifest:{key,gen,token}, rows:[{layout, gen, token, count, ok, entries, members, current, error?}] }
  Store.prototype.describeSets = function () {
    var self = this;
    return this._manifest().then(function (man) {
      return self.listSets(man.keys).then(function (sets) {
        return Promise.all(sets.map(function (s) {
          return self._readSet(s.layout, s.gen, s.token, s.count).then(function (m) {
            return { layout: s.layout, gen: s.gen, token: s.token, count: s.count, ok: true, entries: entriesOf(m), members: (m.members || []).length };
          }, function (e) { return e.guard ? null : { layout: s.layout, gen: s.gen, token: s.token, count: s.count, ok: false, error: e.message }; });
        })).then(function (rows) {
          rows = rows.filter(Boolean);
          var curLayout = man.value.kind === "legacy" ? "legacy" : "new";
          rows.forEach(function (x) { x.current = !man.stale && x.layout === curLayout && x.gen === (man.value.gen || 0) && (x.token || null) === (man.value.token || null); });
          return { manifest: { key: man.key, gen: man.value.gen, token: man.value.token, kind: man.value.kind }, rows: rows };
        });
      });
    });
  };
  // Älteren Stand als NEUE Generation wiederherstellen (nichts wird gelöscht).
  Store.prototype.restoreFrom = function (layout, gen, token, count) {
    var self = this;
    return Promise.all([this._manifest(), this._readSet(layout, gen, token || null, count)]).then(function (r) {
      var man = r[0], snap = JSON.stringify(r[1]);
      self.model = JSON.parse(snap); self.gen = man.value.gen || 0; self.token = man.value.token || null;
      self.manifestKey = man.key; self.manifestVersion = man.version;
      self.readOnly = false; self.lastError = null;
      self.replayQueue = [function () { return JSON.parse(snap); }];
      self._restoring = true;
      return self.persist().then(function (res) { self._restoring = false; return res; }, function (e) { self._restoring = false; throw e; });
    });
  };

  /* ---------- Schreiben ---------- */
  Store.prototype.apply = function (replayFn) {
    if (this.readOnly) throw new Error("Daten konnten nicht geladen werden – Schreiben gesperrt. Bitte Seite neu laden.");
    var r = replayFn(this.model); if (r) this.model = r;
    this.replayQueue.push(replayFn);
    return this;
  };
  Store.prototype.refreshAndReplay = function () {
    var self = this;
    return this._fetchFresh().then(function (fresh) {
      if (fresh.recovered && !self._restoring) {
        self.readOnly = true; self.recovered = fresh.recovered;
        var e = LoadError(fresh.recovered.cause); throw e;
      }
      self._adopt(fresh);
      self.replayQueue.forEach(function (fn) { var r = fn(self.model); if (r) self.model = r; });
      return self.model;
    });
  };
  // Persistieren mit Merge (≤ retries Konflikt-Runden). -> {ok:true, gen} | {ok:false, error}
  // Transportfehler -> Rejection; Queue bleibt für „Erneut versuchen".
  Store.prototype.persist = function (retries) {
    if (retries == null) retries = 2;
    var self = this;
    if (self.readOnly) return Promise.reject(new Error("Schreiben gesperrt (Ladefehler)."));
    if (!self.replayQueue.length) return Promise.resolve({ ok: true, gen: self.gen, noop: true });
    return self._saveChecked(self.model, self.gen, !!self._restoring).then(function (res) {
      if (!res.conflict) {
        self.gen = res.gen; self.token = res.token; self.layout = "new"; self.source = "store";
        if (res.manifestKey) self.manifestKey = res.manifestKey;
        if (res.manifestVersion !== undefined) self.manifestVersion = res.manifestVersion;
        self.replayQueue = []; self.recovered = null;
        self.guardPromise = self.ensureGuard();
        return { ok: true, gen: res.gen, migratedTo: res.migratedTo };
      }
      if (retries <= 0) return { ok: false, error: "Dauerkonflikt – andere speichern gerade gleichzeitig. Bitte erneut versuchen." };
      return self.refreshAndReplay().then(function () { return self.persist(retries - 1); });
    });
  };
  // Komfort für die App: lokales Modell + Replay-Funktion speichern -> persistiertes (gemergtes) Modell.
  // baseGen = Generation, auf der localModel beruht. Wichtig nach Fehlern/Dauerkonflikt: der Store kann
  // inzwischen einen neueren Stand kennen; ohne baseGen würde localModel diesen still überschreiben.
  Store.prototype.saveMerge = function (localModel, replay, baseGen) {
    var self = this;
    if (self.readOnly) return Promise.reject(new Error("Schreiben gesperrt – Daten konnten nicht geladen werden. Bitte Seite neu laden."));
    if (baseGen != null) self.gen = baseGen;
    self.model = clone(localModel);
    self.replayQueue = [replay];
    return self.persist().then(function (r) {
      if (!r.ok) { var e = new Error(r.error); e.conflict = true; throw e; }
      return clone(self.model);
    });
  };

  // Replay für Erst-Import (Seed/Alt-Anhang): überschreibt NIE vorhandene Daten.
  function replayInitial(model) {
    var snap = JSON.stringify(model);
    return function (fresh) {
      if (fresh && fresh.requests && fresh.requests.length) return fresh;
      return JSON.parse(snap);
    };
  }

  /* ---------- Confluence-REST-Transport (Content Properties) ----------
   * Port von urlaubios/app.js ConfluenceTransport. fetchFn injizierbar (Tests).
   * put: neu -> POST (CAS „darf nicht existieren" bei expectedVersion 0), sonst PUT version+1.
   * Fehlertext wird ausgewertet: /another space/i -> err.spaceMismatch (Seite verschoben). */
  function ConfluenceTransport(pageId, ctx, fetchFn) {
    this.base = (ctx || "") + "/rest/api/content/" + pageId + "/property";
    this.fetch = fetchFn || (typeof fetch === "function" ? function (u, o) { return fetch(u, o); } : null);
  }
  ConfluenceTransport.prototype._req = function (method, url, body) {
    return this.fetch(url, {
      method: method, credentials: "same-origin",
      headers: { "Content-Type": "application/json", "Accept": "application/json", "X-Atlassian-Token": "no-check" },
      body: body ? JSON.stringify(body) : undefined
    });
  };
  function httpError(what, status) {
    var map = { 0: "Netzwerkfehler", 400: "Anfrage abgelehnt (400) – Daten evtl. zu groß", 401: "nicht angemeldet (401)", 403: "keine Berechtigung (403)", 413: "Daten zu groß (413)" };
    var e = new Error((map[status] || ("HTTP " + status)) + " bei " + what); e.status = status; return e;
  }
  function netError(what) { return function (e) { if (e && e.status != null) throw e; var x = httpError(what, 0); x.cause = e; throw x; }; }
  ConfluenceTransport.prototype.get = function (key) {
    return this._req("GET", this.base + "/" + encodeURIComponent(key)).then(function (r) {
      if (r.status === 404) return null;
      if (!r.ok) throw httpError("GET " + key, r.status);
      return r.json().then(function (j) { return { value: j.value, version: (j.version && j.version.number) || 1 }; });
    }, netError("GET " + key));
  };
  ConfluenceTransport.prototype.put = function (key, value, expectedVersion) {
    var self = this;
    function conflict() { var e = new Error("Versionskonflikt (409) bei " + key); e.status = 409; throw e; }
    function check(r) {
      if (r.status === 409) conflict();
      if (!r.ok) {
        return r.text().catch(function () { return ""; }).then(function (txt) {
          var e = httpError("PUT " + key, r.status);
          e.detail = (txt || "").slice(0, 500);
          e.spaceMismatch = /another space/i.test(txt || "");
          throw e;
        });
      }
      return r.json().then(function (j) { return { version: (j.version && j.version.number) || 1 }; }, function () { return { version: undefined }; });
    }
    return this.get(key).then(function (cur) {
      if (!cur) {
        if (expectedVersion !== undefined && expectedVersion !== 0) conflict();
        return self._req("POST", self.base, { key: key, value: value }).then(function (r) {
          if (r.status === 400 && expectedVersion === 0) {
            // Confluence meldet „existiert schon" teils mit 400 -> nachsehen, ob jetzt vorhanden
            return self.get(key).then(function (now) { if (now) conflict(); return check(r); });
          }
          return check(r);
        }, netError("POST " + key));
      }
      if (expectedVersion !== undefined && expectedVersion !== cur.version) conflict();
      return self._req("PUT", self.base + "/" + encodeURIComponent(key), { key: key, value: value, version: { number: cur.version + 1 } }).then(check, netError("PUT " + key));
    });
  };
  ConfluenceTransport.prototype.del = function (key) {
    return this._req("DELETE", this.base + "/" + encodeURIComponent(key)).then(function () { return true; }, function () { return true; });
  };
  // Alle Property-Schlüssel (paginiert). Fehler werden geworfen (nie stilles leeres Listing).
  ConfluenceTransport.prototype.list = function () {
    var self = this, out = [];
    function page(start) {
      return self._req("GET", self.base + "?limit=200&start=" + start).then(function (r) {
        if (!r.ok) throw httpError("Property-Liste", r.status);
        return r.json().then(function (j) {
          var res = j.results || [];
          res.forEach(function (p) { if (p && p.key) out.push(p.key); });
          var size = j.size != null ? j.size : res.length, lim = j.limit != null ? j.limit : 200;
          if (size >= lim && res.length && start < 20000) return page(start + size);
          return out;
        });
      }, netError("Property-Liste"));
    }
    return page(0);
  };

  function newToken() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  return {
    Store: Store, ConfluenceTransport: ConfluenceTransport, LoadError: LoadError, emptyModel: emptyModel, replayInitial: replayInitial,
    splitChunks: splitChunks, byteCost: byteCost, parseChunkKey: parseChunkKey,
    chunkKey: chunkKey, legacyChunkKey: legacyChunkKey, nextManifestKey: nextManifestKey, manifestRank: manifestRank,
    readManifestValue: readManifestValue,
    LEGACY: LEGACY, MANIFEST: MANIFEST, GUARD_TEXT: GUARD_TEXT, GUARD_SFX: GUARD_SFX,
    KEEP_GENERATIONS: KEEP_GENERATIONS, CHUNK_MAX_BYTES: CHUNK_MAX_BYTES
  };
});
