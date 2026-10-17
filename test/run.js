#!/usr/bin/env node
/* Node-Testlauf (nur Node-Bordmittel). Aufruf: npm test  (bzw. node test/run.js). Exit-Code 1 bei Fehlern. */
"use strict";
var H = require("./helpers");
Promise.resolve()
  .then(function () { console.log("· persistence.js"); return require("./persistence.test.js")(); })
  .then(function () { console.log("· app.js / htmlMacro.html (statisch)"); return require("./app.test.js")(); })
  .then(function () { process.exit(H.summary("vertretios") ? 1 : 0); })
  .catch(function (e) { console.error("Testlauf abgebrochen:", e && e.stack || e); H.summary("vertretios"); process.exit(1); });
