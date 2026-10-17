/* Statische Prüfungen app.js / htmlMacro.html (ohne Browser): gefährliche Pfade entfernt,
 * Bootstrap mit Cache-Bust und richtiger Reihenfolge, Build-Version, Syntax. */
"use strict";
var fs = require("fs"), path = require("path"), vm = require("vm");
var H = require("./helpers"), ok = H.ok;

module.exports = function () {
  var app = fs.readFileSync(path.join(H.ROOT, "app.js"), "utf8");
  var macro = fs.readFileSync(path.join(H.ROOT, "htmlMacro.html"), "utf8");

  var syntaxOk = true; try { new vm.Script(app, { filename: "app.js" }); } catch (e) { syntaxOk = false; console.log(e); }
  ok("app.js: Syntax gültig", syntaxOk);

  ok("app.js: kein synchroner Speicherpfad mehr (writeModelSync/saveSync/doSaveSync)", !/writeModelSync|saveSync|doSaveSync|setPropSync|delPropSync/.test(app));
  ok("app.js: keine eigene Property-Schreiblogik mehr (casManifest/setProp/writeModel/migrate)", !/function (casManifest|setProp|writeModel|migrate|cleanupGen)\(/.test(app));
  ok("app.js: Persistenz über VertretiosPersistence.Store", /window\.VertretiosPersistence/.test(app) && /new P\.Store\(new P\.ConfluenceTransport/.test(app));
  var unload = /addEventListener\("beforeunload",function\(ev\)\{([^]*?)\}\);/.exec(app);
  ok("app.js: beforeunload stößt nur async Save an (kein Löschen, kein Sync-XHR)", !!unload && /flushPendingAsync\(\)/.test(unload[1]) && !/del|XMLHttpRequest|sx\(/.test(unload[1]));
  ok("app.js: Speichern mit Basis-Generation (saveMerge(local,replay,_baseGen))", /storage\.saveMerge\(local,replay,_baseGen\)/.test(app));
  ok("app.js: Laden speichert nicht mehr (kein storage.save beim Versionsstempel)", !/upgradeData\(data\)\)\{[^}]*storage\.save/.test(app));
  ok("app.js: sichtbares Speicherfehler-Banner mit Erneut versuchen", /id="wp-saveerr"/.test(app) && /Erneut versuchen/.test(app));
  ok("app.js: Ladefehler-Banner + Schreibschutz", /id="wp-loaderr"/.test(app) && /function isReadOnly\(\)/.test(app) && /wp-ro/.test(app));
  ok("app.js: Admin-Datenstände + Wiederherstellung", /id="dscard"/.test(app) && /function renderDataStates\(\)/.test(app) && /storage\.restore\(row\)/.test(app) && /if\(!isAdmin\(\)\)/.test(app));
  ok("app.js: Build-Version-Platzhalter + Anzeige im Fuß/Konsole", /var BUILD_VERSION="__BUILD_VERSION__"/.test(app) && /"Build "\+BUILD_VERSION/.test(app) && /console\.log\("\[WP\] Vertretungspool Build "/.test(app));

  ok("app.js: Engine-Selbsttest (save/load-Roundtrip) läuft nie gegen Confluence", /function selftest\(\)\{if\(!SEED\|\|IS_CONF\)\{/.test(app));
  ok("htmlMacro: lädt persistence.js vor app.js", /\["persistence\.js", "app\.js"\]/.test(macro));
  ok("htmlMacro: Cache-Bust ?v=Date.now()", /Date\.now\(\)/.test(macro) && /"\?v=" \+ bust/.test(macro));
  ok("htmlMacro: kein CDATA / keine Velocity-$", !/CDATA/.test(macro) && !/\$[a-zA-Z{]/.test(macro));
  ok("htmlMacro: WP_ADMINS bleibt Admin-Konzept", /window\.WP_ADMINS\s*=/.test(macro));
  return Promise.resolve();
};
