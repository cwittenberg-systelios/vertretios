/* Test-Helfer: Mini-Runner, Mock-Transport (Versionen, 409, Hooks, 500 nach/ohne Commit,
 * Bereichssperre, Listing) und ein Fake-Confluence-REST auf demselben Speicher, damit
 * ConfluenceTransport und die ALTE App-Version (test/fixtures) gegen dieselben Daten laufen. */
"use strict";
var fs = require("fs"), path = require("path"), vm = require("vm");
var ROOT = path.join(__dirname, "..");

/* ---------- Mini-Runner ---------- */
var results = [];
function ok(name, cond, info) { results.push({ name: name, ok: !!cond, info: info || "" }); if (!cond) console.log("  ✗ " + name + (info ? "  — " + info : "")); }
function eq(name, a, b) { ok(name, JSON.stringify(a) === JSON.stringify(b), "ist " + JSON.stringify(a) + ", erwartet " + JSON.stringify(b)); }
function summary(label) {
  var pass = results.filter(function (r) { return r.ok; }).length;
  console.log((pass === results.length ? "✓ " : "✗ ") + label + ": " + pass + "/" + results.length + " Assertions grün");
  return results.length - pass;
}

/* ---------- Mock-Transport ---------- */
// store[key] = { value: <JSON-String>, version: <int> }
function MockTransport(store) {
  this.store = store || {}; this.writes = 0;
  this.beforePut = null; this.beforeGet = null;
  this.failPutMatching = null;          // 400 vor Commit
  this.failPut500Matching = null;       // 500 ohne Commit
  this.failAfterCommitMatching = null;  // 500 nach Commit
  this.spaceLocked = null;              // {key:true}: Update eines BESTEHENDEN Schlüssels -> 500 spaceMismatch
  this.failGetMatching = null;          // GET -> 500
  this.failList = false;
}
MockTransport.prototype.get = function (key) {
  var self = this;
  return Promise.resolve().then(function () { return self.beforeGet ? self.beforeGet(key) : null; }).then(function () {
    if (self.failGetMatching && self.failGetMatching.test(key)) { var ge = new Error("HTTP 500 bei GET " + key); ge.status = 500; throw ge; }
    var e = self.store[key]; return e ? { value: JSON.parse(e.value), version: e.version } : null;
  });
};
MockTransport.prototype.put = function (key, value, expectedVersion) {
  var self = this;
  return Promise.resolve().then(function () { return self.beforePut ? self.beforePut(key) : null; }).then(function () {
    self.writes++;
    if (self.failPutMatching && self.failPutMatching.test(key)) { var fe = new Error("HTTP 400 bei PUT " + key); fe.status = 400; throw fe; }
    if (self.failPut500Matching && self.failPut500Matching.test(key)) { var f5 = new Error("HTTP 500 bei PUT " + key); f5.status = 500; throw f5; }
    var e = self.store[key], cur = e ? e.version : 0;
    if (expectedVersion !== undefined && expectedVersion !== cur) { var err = new Error("conflict"); err.status = 409; throw err; }
    if (e && self.spaceLocked && self.spaceLocked[key]) { var se = new Error("HTTP 500 bei PUT " + key); se.status = 500; se.spaceMismatch = true; throw se; }
    var nv = cur + 1; self.store[key] = { value: JSON.stringify(value), version: nv };
    if (self.failAfterCommitMatching && self.failAfterCommitMatching.test(key)) { var ce = new Error("HTTP 500 bei PUT " + key); ce.status = 500; throw ce; }
    return { version: nv };
  });
};
MockTransport.prototype.del = function (key) { delete this.store[key]; return Promise.resolve(true); };
MockTransport.prototype.list = function () {
  if (this.failList) { var e = new Error("HTTP 500 bei Liste"); e.status = 500; return Promise.reject(e); }
  return Promise.resolve(Object.keys(this.store));
};
MockTransport.prototype.keys = function () { return Object.keys(this.store).sort(); };
MockTransport.prototype.val = function (key) { var e = this.store[key]; return e ? JSON.parse(e.value) : undefined; };

/* ---------- Fake-Confluence-REST (Content Properties + Anhänge) ---------- */
// Arbeitet auf mt.store; spaceLocked aus mt gilt auch hier (500 + Confluence-Fehlertext).
function FakeConfluence(mt, pageId) {
  this.mt = mt; this.pid = String(pageId || "4711"); this.attachments = {}; this.requests = [];
}
function resp(status, body, text) {
  return {
    status: status, ok: status >= 200 && status < 300,
    json: function () { return body === undefined ? Promise.reject(new Error("no json")) : Promise.resolve(JSON.parse(JSON.stringify(body))); },
    text: function () { return Promise.resolve(text != null ? text : (body !== undefined ? JSON.stringify(body) : "")); }
  };
}
FakeConfluence.prototype.handle = function (method, url, bodyStr) {
  var mt = this.mt, st = mt.store, base = "/rest/api/content/" + this.pid;
  this.requests.push(method + " " + url);
  var u = url.replace(/^https?:\/\/[^/]+/, "");
  var q = u.indexOf("?"), p = q >= 0 ? u.slice(0, q) : u, qs = q >= 0 ? u.slice(q + 1) : "";
  var body = bodyStr ? JSON.parse(bodyStr) : null;
  function params() { var o = {}; qs.split("&").forEach(function (kv) { if (!kv) return; var i = kv.indexOf("="); o[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1)); }); return o; }
  if (p === base + "/property" && method === "GET") {
    var pr = params(), start = +pr.start || 0, limit = +pr.limit || 10;
    var keys = Object.keys(st).sort(), page = keys.slice(start, start + limit);
    return resp(200, { results: page.map(function (k) { return { key: k }; }), start: start, limit: limit, size: page.length });
  }
  function injected(key) {
    if (mt.failPutMatching && mt.failPutMatching.test(key)) return resp(400, { message: "rejected" });
    if (mt.failPut500Matching && mt.failPut500Matching.test(key)) return resp(500, undefined, "boom");
    return null;
  }
  if (p === base + "/property" && method === "POST") {
    var inj = injected(body.key); if (inj) return inj;
    if (st[body.key]) return resp(409, { message: "already exists" });
    st[body.key] = { value: JSON.stringify(body.value), version: 1 };
    return resp(200, { key: body.key, value: body.value, version: { number: 1 } });
  }
  if (p.indexOf(base + "/property/") === 0) {
    var key = decodeURIComponent(p.slice((base + "/property/").length)), e = st[key];
    if (method === "GET") return e ? resp(200, { key: key, value: JSON.parse(e.value), version: { number: e.version } }) : resp(404, { message: "not found" });
    if (method === "DELETE") { delete st[key]; return resp(204); }
    if (method === "PUT") {
      var inj2 = injected(key); if (inj2) return inj2;
      if (!e) return resp(404, { message: "not found" });
      if (!body.version || body.version.number !== e.version + 1) return resp(409, { message: "version conflict" });
      if (mt.spaceLocked && mt.spaceLocked[key]) return resp(500, undefined, "java.lang.IllegalArgumentException: Can't add an owner from another space");
      st[key] = { value: JSON.stringify(body.value), version: e.version + 1 };
      return resp(200, { key: key, value: body.value, version: { number: e.version + 1 } });
    }
  }
  if (p === base + "/child/attachment" && method === "GET") {
    var fn = params().filename, a = this.attachments[fn];
    return resp(200, { results: a ? [{ id: "att-" + fn, title: fn, version: { number: 1 } }] : [] });
  }
  var dl = "/download/attachments/" + this.pid + "/";
  if (p.indexOf(dl) === 0 && method === "GET") {
    var f = decodeURIComponent(p.slice(dl.length));
    return this.attachments[f] ? resp(200, this.attachments[f]) : resp(404);
  }
  return resp(404, { message: "unbekannt: " + method + " " + p });
};
FakeConfluence.prototype.fetch = function () {
  var self = this;
  return function (url, opts) {
    opts = opts || {};
    return Promise.resolve().then(function () { return self.handle(opts.method || "GET", url, opts.body); });
  };
};
/* ---------- Alte App-Version (Stand main, PropertyStore v2) in einer Sandbox ---------- */
// Liefert das PropertyStore-Objekt der Altversion, das gegen den Fake-Server läuft.
function legacyStore(fake) {
  var src = fs.readFileSync(path.join(__dirname, "fixtures", "legacy-propertystore-v2.js"), "utf8");
  var syncStore = fake.mt.store;
  // Synchroner XHR: Fake-Server direkt aufrufen (Antworttext synchron aus dem JSON-Body).
  function SyncXHR() { this.status = 0; this.responseText = ""; }
  SyncXHR.prototype.open = function (m, u) { this.m = m; this.u = u; };
  SyncXHR.prototype.setRequestHeader = function () {};
  SyncXHR.prototype.send = function (b) {
    var r = fake.handle(this.m, this.u, b);
    this.status = r.status;
    var key = /\/property\/([^?]+)$/.exec(this.u);
    if (this.m === "GET" && key && syncStore[decodeURIComponent(key[1])]) {
      var e = syncStore[decodeURIComponent(key[1])];
      this.responseText = JSON.stringify({ value: JSON.parse(e.value), version: { number: e.version } });
    }
  };
  var f = fake.fetch();
  var sandbox = {
    PID: fake.pid, CTX: "", fetch: f, XMLHttpRequest: SyncXHR, Promise: Promise, JSON: JSON, Date: Date, Math: Math,
    encodeURIComponent: encodeURIComponent, window: { console: { warn: function () {} } }, console: { warn: function () {}, log: function () {} },
    jget: function (p) { return f(p).then(function (r) { if (!r.ok) throw new Error("GET " + p + " -> " + r.status); return r.json(); }); }
  };
  vm.createContext(sandbox);
  vm.runInContext(src + "\n;this.__PS = PropertyStore();", sandbox);
  return sandbox.__PS;
}

module.exports = { ok: ok, eq: eq, summary: summary, results: results, MockTransport: MockTransport, FakeConfluence: FakeConfluence, legacyStore: legacyStore, ROOT: ROOT };
