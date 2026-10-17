/* Vertretungspool Wochenendpräsenz — app.js (einzige Logikquelle: lokal + Confluence)
   Persistenz: persistence.js (muss VOR app.js geladen sein, s. htmlMacro.html). */
(function(){
  "use strict";var GROUP="Wochenendpräsenz";var userCache={};
var BUILD_VERSION="__BUILD_VERSION__";if(BUILD_VERSION.indexOf("__")===0)BUILD_VERSION="dev";  // build.sh setzt git describe ein
if(window.console)console.log("[WP] Vertretungspool Build "+BUILD_VERSION);
function wpAdmins(){var list=(window.WP_ADMINS&&window.WP_ADMINS.length)?window.WP_ADMINS:[];var out=[];for(var i=0;i<list.length;i++){out.push(String(list[i]).toLowerCase());}return out;}
function isAdmin(){var m=byId[cur]||null;var uname=String((m&&m.username)||"").toLowerCase();var ukey=String((m&&m.id)||cur||"").toLowerCase();var A=wpAdmins();for(var i=0;i<A.length;i++){if(A[i]&&(A[i]===uname||A[i]===ukey))return true;}return false;}
function isOwner(r){if(!r)return false;var me=byId[cur]||null;if(r.dienstVonUser){if(r.dienstVonUser===cur)return true;return !!(me&&me.username&&r.dienstVonUser===me.username);}var mn=String((me&&me.name)||"").toLowerCase();return !!(r.dienstVon&&mn&&String(r.dienstVon).toLowerCase()===mn);}
function canDelete(r){if(!r)return false;if(isAdmin())return true;if(r.best)return false;return isOwner(r);}var __importDiag=null;var __CSS=`
  :root{
    --fg:#172b4d;--muted:#5e6c84;--line:#dfe1e6;--bg:#fff;--soft:#f4f5f7;--r:6px;
    --info:#0747a6;--infobg:#deebff;--ok:#216e4e;--okbg:#dcfff1;
    --amber:#974f0c;--amberbg:#fff7e6;--danger:#ae2a19;--dangerbg:#ffeceb;
    --c-sammeln:#4c9aff;--c-vergabe:#ffab00;--c-kritisch:#de350b;--c-vergeben:#36b37e;
    --c-erledigt:#c1c7d0;--c-durch:#de350b;
  }
  *{box-sizing:border-box}
  body{margin:0;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:var(--fg);background:var(--soft);padding:20px}
  .wrap{max-width:920px;margin:0 auto}
  h1{font-size:20px;font-weight:600;margin:0 0 2px}
  .sub{color:var(--muted);font-size:13px;margin-bottom:14px}
  .printhead{display:none}
  .bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:16px}
  .bar .grow{flex:1}
  label.id{font-size:13px;color:var(--muted);display:flex;align-items:center;gap:6px}
  select,input[type=date],input[type=text]{font:inherit;padding:6px 8px;border:1px solid var(--line);border-radius:var(--r);background:#fff;color:var(--fg)}
  .tabs{display:inline-flex;border:1px solid var(--line);border-radius:var(--r);overflow:hidden}
  .tabs button{font:inherit;font-size:13px;padding:6px 12px;border:0;background:#fff;color:var(--muted);cursor:pointer}
  .tabs button.act{background:var(--info);color:#fff}
  .btn{font:inherit;font-size:13px;padding:5px 10px;border:1px solid var(--line);border-radius:var(--r);background:#fff;color:var(--fg);cursor:pointer}
  .btn:hover{background:var(--soft)}
  .btn.prim{background:var(--info);border-color:var(--info);color:#fff}.btn.prim:hover{filter:brightness(1.08)}
  .btn.on{background:var(--okbg);border-color:var(--c-vergeben);color:var(--ok)}
  .btn.warn{border-color:var(--danger);color:var(--danger)}
  .btn.sm{font-size:12px;padding:3px 8px}
  .card{background:var(--bg);border:1px solid var(--line);border-radius:var(--r);padding:14px 16px;margin-bottom:16px}
  .card h2{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin:0 0 10px}
  .chips{display:flex;flex-wrap:wrap;gap:6px}
  .chip{background:var(--soft);border:1px solid var(--line);border-radius:20px;padding:3px 10px;font-size:12px;display:inline-flex;gap:6px;align-items:center}
  .chip b{font-weight:600}.chip .n{background:var(--info);color:#fff;border-radius:10px;padding:0 6px;font-size:11px;min-width:18px;text-align:center}
  .chip.lo .n{background:var(--ok)}.chip.me{outline:2px solid var(--info)}
  .gform{display:none;gap:10px;flex-wrap:wrap;align-items:flex-end}
  .gform.open{display:flex}
  .gform .f{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--muted)}
  .ghint{font-size:12px;margin-top:6px}
  /* Inbox (A) */
  .sec{margin-bottom:14px}
  .sec h3{font-size:13px;font-weight:600;margin:0 0 8px;display:flex;align-items:center;gap:8px}
  .sec .cnt{background:var(--soft);color:var(--muted);border-radius:10px;font-size:11px;padding:0 7px}
  .icard{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid var(--line);border-radius:var(--r);padding:9px 12px;margin-bottom:7px;background:#fff}
  .icard.rec{border:2px solid var(--c-vergeben)}
  .icard.crit{border-color:var(--c-kritisch)}.icard.mit{border-color:var(--info)}
  .icard .t{font-weight:600}
  .icard .m{font-size:12px;color:var(--muted);margin-top:2px}
  .pill{display:inline-block;font-size:11px;font-weight:600;padding:1px 7px;border-radius:4px}
  .pill.rec{background:var(--okbg);color:var(--ok)}.pill.crit{background:var(--dangerbg);color:var(--danger)}.pill.due{background:var(--amberbg);color:var(--amber)}.pill.mit{background:var(--infobg);color:var(--info)}
  .empty{color:var(--muted);font-size:13px;padding:6px 0}
  .iacts{display:flex;gap:6px;flex:none}
  /* Liste (C) */
  .month{font-size:13px;font-weight:600;color:var(--muted);margin:14px 0 8px}
  .row{display:flex;align-items:stretch;border:1px solid var(--line);border-radius:var(--r);overflow:hidden;margin-bottom:8px;background:#fff}
  .rail{width:4px;flex:none}
  .rbody{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:9px 12px;flex:1;min-width:0}
  .dline{font-weight:600;white-space:nowrap}
  .kw{color:var(--muted);font-weight:400;font-size:12px;margin-left:4px}
  .feier{display:inline-block;font-size:11px;color:var(--info);background:var(--infobg);border-radius:4px;padding:0 6px;margin-left:6px}
  .badge{display:inline-block;font-size:11px;padding:1px 7px;border-radius:4px;font-weight:600;margin-top:3px}
  .b-sammeln{background:var(--infobg);color:var(--info)}.b-vergabe{background:var(--amberbg);color:var(--amber)}
  .b-kritisch{background:var(--dangerbg);color:var(--danger)}.b-vergeben{background:var(--okbg);color:var(--ok)}.b-erledigt{background:var(--soft);color:var(--muted)}
  .meta{color:var(--muted);font-size:12px;margin-top:3px}
  .dran{color:var(--ok);font-weight:600}
  .rright{display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex:none}
  .avs{display:flex}
  .av{width:24px;height:24px;border-radius:50%;background:var(--soft);border:1.5px solid #fff;box-shadow:0 0 0 1px var(--line);color:var(--muted);font-size:10px;font-weight:600;display:flex;align-items:center;justify-content:center;margin-left:-6px;position:relative}
  .av:first-child{margin-left:0}.av.sug{background:var(--okbg);color:var(--ok);box-shadow:0 0 0 1px var(--c-vergeben)}
  .acts{display:flex;gap:6px}
  .em{color:var(--muted);font-size:12px}
  details summary{cursor:pointer;font-weight:600;color:var(--muted);font-size:13px;padding:6px 0}
  .pastbar{display:flex;align-items:center;gap:12px}
  .past .row{opacity:.7}
  .log{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.7;max-height:160px;overflow:auto}
  .log .t{color:var(--muted)} .log .ov{color:var(--danger);font-weight:600}
  .diag{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.8}
  .guide{font-size:13px;line-height:1.6}.guide .sum{color:var(--muted)}.guide h4{font-size:13px;margin:12px 0 4px}.guide ul{margin:4px 0 8px 18px;padding:0}.guide li{margin:2px 0}.guide p{margin:4px 0}.hint-green{background:rgb(243,249,244);border:1px solid rgb(145,200,156);border-radius:5px;padding:10px 14px;font-size:14px;margin-bottom:6px}.hint-green a{color:#216e4e;font-weight:600}.muted{color:var(--muted);font-size:12px}.exptbl{width:100%;border-collapse:collapse;font-size:12px;margin-top:4px}.exptbl th,.exptbl td{text-align:left;padding:4px 8px;border-bottom:1px solid var(--border);white-space:nowrap}.exptbl th{color:var(--muted);font-weight:600}.exptbl td:last-child,.exptbl th:last-child{text-align:right}.exptbl tr.x-crit td{color:var(--c-kritisch)}.exptbl tr.x-ok td:nth-child(4){color:var(--c-vergeben);font-weight:600}.statbox{margin-top:12px;padding-top:10px;border-top:1px solid var(--border)}.statbox h3{font-size:13px;margin:0 0 6px}.rank{margin:4px 0 0 20px;padding:0}.rank li{margin:1px 0}
  .pass{color:var(--ok)}.fail{color:var(--danger);font-weight:600}
  .tline{display:flex;align-items:center;gap:10px;margin:6px 0 12px;color:var(--danger);font-size:12px;font-weight:600}
  .tline:before,.tline:after{content:"";height:1px;background:var(--danger);opacity:.35;flex:1}
  @media print{
    @page{size:A4 landscape;margin:12mm}
    body{background:#fff;padding:0;font-size:12px}
    .wrap{max-width:none}
    .bar,.gform,.acts,.iacts,.noprint,.tline,.log,.diag,details summary,.pastbar{display:none!important}
    .printhead{display:flex!important;align-items:flex-end;justify-content:space-between;border-bottom:2px solid var(--fg);padding-bottom:6px;margin-bottom:10px}
    .printhead .logo{border:1px dashed var(--muted);color:var(--muted);font-size:11px;padding:10px 16px;border-radius:4px}
    h1,.sub{display:none}
    .row,.icard{break-inside:avoid}
    .rright{display:none}
    details{display:block!important}
  }
  .wp-update-banner{display:none;align-items:center;gap:12px;background:var(--infobg);border:1px solid var(--c-sammeln);border-radius:var(--r);padding:8px 14px;margin:0 auto 12px;max-width:920px;font-size:13px;color:var(--info)}
  .wp-update-banner .txt{flex:1;font-weight:600}
  .wp-update-banner button{font:inherit;font-size:13px;padding:5px 10px;border:1px solid var(--info);border-radius:var(--r);background:var(--info);color:#fff;cursor:pointer}
  .wp-update-banner button:hover{filter:brightness(1.08)}
  @media print{ .wp-update-banner{display:none!important} }
  .clk{cursor:pointer}
  .clk:hover{box-shadow:0 1px 0 var(--line),0 0 0 1px var(--c-sammeln) inset}
  .row.clk:hover{box-shadow:0 0 0 1px var(--c-sammeln) inset}
  .wp-modal-ov{position:fixed;inset:0;background:rgba(20,28,38,.45);z-index:9998}
  .wp-modal{position:fixed;z-index:9999;top:50%;left:50%;transform:translate(-50%,-50%);width:min(560px,92vw);max-height:88vh;overflow:auto;background:#fff;border:1px solid var(--line);border-radius:10px;box-shadow:0 18px 50px rgba(0,0,0,.28);padding:18px 20px}
  .wp-modal-x{position:absolute;top:10px;right:12px;border:0;background:transparent;font-size:22px;line-height:1;color:var(--muted);cursor:pointer;padding:2px 6px}
  .wp-modal-x:hover{color:var(--fg)}
  .wp-modal-h{padding-right:28px;margin-bottom:10px}
  .wp-modal-h h3{margin:6px 0 0;font-size:17px}
  .wp-modal-h .kw{font-size:11px;color:var(--muted);font-weight:600;margin-left:8px}
  .wp-modal-b h4{font-size:12px;text-transform:uppercase;letter-spacing:.03em;color:var(--muted);margin:14px 0 6px}
  .dmeta{font-size:13px;color:var(--fg);padding:8px 10px;background:var(--soft);border-radius:6px}
  .dempty{font-size:13px;color:var(--muted)}
  .dapp{list-style:none;margin:0;padding:0}
  .dapp li,.dsub{display:flex;align-items:center;gap:9px;padding:6px 4px;border-bottom:1px solid var(--border)}
  .dsub{border:0;padding:8px 4px}
  .dapp li:last-child{border-bottom:0}
  .dav{width:26px;height:26px;border-radius:50%;background:var(--soft);color:var(--muted);font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex:none}
  .dav.sug{background:var(--okbg);color:var(--ok);box-shadow:0 0 0 1px var(--c-vergeben)}
  .dav.ok{background:var(--okbg);color:var(--ok)}
  .dnm{font-weight:600;font-size:13px}
  .dcnt{font-size:11px;color:var(--muted);margin-left:auto}
  .dtag{font-size:10px;font-weight:700;padding:1px 7px;border-radius:10px;margin-left:6px}
  .dtag.pick{background:var(--okbg);color:var(--ok)}.dtag.tie{background:var(--infobg);color:var(--info)}.dtag.pass{background:var(--amberbg);color:var(--amber)}.dtag.me{background:var(--soft);color:var(--muted)}
  .dtl{list-style:none;margin:0;padding:0;font-size:12.5px}
  .dtl li{display:flex;gap:10px;padding:3px 4px}
  .dtl .dtd{color:var(--muted);font-variant-numeric:tabular-nums;flex:none;min-width:78px}
  .wp-modal-f{display:flex;flex-wrap:wrap;gap:7px;margin-top:16px;padding-top:12px;border-top:1px solid var(--border)}
  .wp-modal-f:empty{display:none}
  @media print{ .wp-modal-ov,.wp-modal{display:none!important} }
  .admbox{margin-top:16px;padding-top:12px;border-top:2px dashed var(--line)}
  .admbox h4{font-size:12px;text-transform:uppercase;letter-spacing:.03em;color:var(--amber);margin:12px 0 6px}
  .admgrid{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end}
  .admf{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--muted)}
  .admf input,.admbox select{font:inherit;padding:6px 8px;border:1px solid var(--line);border-radius:var(--r);background:#fff;color:var(--fg)}
  .admchips{display:flex;flex-wrap:wrap;gap:6px}
  .admchip{font:inherit;font-size:12px;padding:4px 10px;border:1px solid var(--line);border-radius:20px;background:#fff;color:var(--fg);cursor:pointer}
  .admchip:hover{background:var(--soft)}
  .admchip.on{background:var(--okbg);border-color:var(--c-vergeben);color:var(--ok);font-weight:600}
  @media print{ .admbox{display:none!important} }
  .wp-errbar,.wp-warnbar{display:flex;flex-wrap:wrap;align-items:center;gap:10px;border-radius:var(--r);padding:9px 14px;margin:0 auto 12px;max-width:920px;font-size:13px}
  .wp-errbar{background:var(--dangerbg);border:1px solid var(--danger);color:var(--danger)}
  .wp-warnbar{background:var(--amberbg);border:1px solid var(--amber);color:var(--amber)}
  .wp-errbar .txt,.wp-warnbar .txt{flex:1;min-width:200px}
  .wp-ro .acts,.wp-ro .iacts,.wp-ro .wp-modal-f,.wp-ro .admbox,.wp-ro #addbtn,.wp-ro #gcard,.wp-ro #cleanbtn,.wp-ro #resetbtn{display:none!important}
  .wp-foot{color:var(--muted);font-size:11px;text-align:center;margin:8px 0 0}
  .dstbl{width:100%;border-collapse:collapse;font-size:12px}
  .dstbl th,.dstbl td{text-align:left;padding:4px 8px;border-bottom:1px solid var(--line)}
  .dstbl tr.cur td{font-weight:600;color:var(--ok)}
  .dstbl tr.bad td{color:var(--danger)}
  @media print{ .wp-errbar,.wp-warnbar,.wp-foot{display:none!important} }
`;var __SHELL=`
  <div class="hint-green">Schnick-Schnack-Schuck um die Wochenendpräsenz! Du weißt nicht, wie man spielt? <a href="#wp-anleitung">Hier zur Spielanleitung.</a></div>

  <div class="bar">
    <label class="id">Angemeldet als <select id="who"></select></label>
    <span class="tabs"><button id="tab-a">Inbox</button><button id="tab-c">Liste</button></span>
    <span class="grow"></span>
    <button class="btn prim" id="addbtn">+ Gesuch</button>
    <button class="btn" id="resetbtn">Zurücksetzen</button><button class="btn" id="selftestbtn" style="display:none">Selbsttest</button>
  </div>

  <div class="card" id="gcard" style="display:none"><div class="gform open" id="gform"><div class="f">Termin-Datum<input type="date" id="g-date"></div><div class="f">Dienst von<input type="text" id="g-name" list="names" placeholder="Name (Pool-User oder Freitext)" autocomplete="off"></div><div class="f" id="g-adm-ein" style="display:none">Eingetragen am<input type="date" id="g-ein"></div><div class="f" id="g-adm-best" style="display:none">Übernommen von<select id="g-best"></select></div><button class="btn prim" id="savebtn">Gesuch speichern</button><div class="ghint" id="g-hint"></div></div><datalist id="names"></datalist></div>

  <div id="myreq"></div>
  

  <div id="view-a"></div>
  <div id="view-c">
    <div id="future"></div>
    <div class="tline" id="tline"></div>
    <div class="pastbar"><details id="pastwrap" style="flex:1"><summary></summary><div class="past" id="past"></div></details><button class="btn sm" id="cleanbtn">Aufräumen (≥12 Mon.)</button></div>
  </div>

  
  <div class="card"><h2>Bisher übernommen — laufendes Jahr <span id="cy"></span> (grün = wenigste, umrandet = du)</h2><div class="chips" id="counts"></div></div>
  <div class="card"><details><summary><h2 style="display:inline-block;margin:0">Jahresübersicht &amp; Export</h2></summary><div class="bar" style="margin:8px 0"><label>Jahr <select id="exp-year"></select></label><button class="btn" id="exp-csv">CSV herunterladen</button></div><div id="exp-table"></div></details></div>
  <div class="card noprint"><h2>Aktivität / Protokoll (rot = Override; [STUB] = Teilen-Benachrichtigung)</h2><div class="log" id="log"></div></div>
  <div class="card noprint"><h2>Selbsttest (Engine & Live-Invarianten)</h2><div class="diag" id="diag"></div></div>
  <div class="card noprint" id="selftest2card" style="display:none"><h2>Selbsttest — Unit &amp; Integration</h2><div class="diag" id="selftest2"></div></div>
  <div class="card noprint" id="dscard" style="display:none"><h2>Datenstände (Admin)</h2><div class="muted">Gespeicherte Generationen (die letzten 10 bleiben als Historie). Ein älterer Stand wird als <b>neue</b> Generation wiederhergestellt; nichts wird gelöscht.</div><div class="bar" style="margin:8px 0"><button class="btn sm" id="dsload">Datenstände anzeigen</button></div><div id="dslist"></div></div>
  <div class="card guide" id="wp-anleitung"><h2>Anleitung</h2><div class="sum">Trag deinen zu vertretenden Dienst über „+ Gesuch" ein. Als Poolmitglied markierst du bei passenden Terminen „kann"; das System schlägt fair vor, wer als Nächstes dran ist. Mit „zusagen" übernimmst du verbindlich, mit „Nicht ich – weitergeben" reichst du an die/den Nächste(n) weiter. Ganz oben siehst du deine eigenen Gesuche, in der Inbox was für dich zu tun ist, in der Liste den Gesamtüberblick.</div><details><summary>… mehr Details</summary><h4>Worum geht es</h4><p>Die Liste verteilt Vertretungen für Wochenend- und Feiertagsdienste. Du entscheidest immer selbst — das System macht nur faire Vorschläge.</p><h4>Wenn du selbst eine Vertretung suchst</h4><ul><li>Öffne „+ Gesuch", wähle das Datum und trag dich als „Dienst von" ein.</li><li>Im Bereich „Meine Vertretungsgesuche" (ganz oben) siehst du den Status: wie viele Angebote es gibt, ob schon jemand zugesagt hat und ab wann mit einer Zusage zu rechnen ist.</li><li>Brauchst du keine Vertretung mehr: „zurückziehen". Tut sich nichts: „Pool erinnern".</li></ul><h4>Wenn du Dienste übernehmen kannst (Pool)</h4><ul><li>Markiere bei jedem Termin, den du übernehmen könntest, „kann".</li><li>Das System schlägt unter allen, die „kann" markiert haben, die Person mit den wenigsten bisher übernommenen Diensten im laufenden Jahr vor.</li><li>Stehst du im „Vorschlag für dich", kannst du mit „zusagen" verbindlich übernehmen — oder „Nicht ich – weitergeben", dann rückt der Vorschlag zur/zum Nächsten.</li></ul><h4>Gleichstand</h4><p>Haben mehrere gleich wenige Dienste, wird fair zufällig eine Person vorgeschlagen; die anderen werden als „gleichauf" mit genannt, damit ihr euch absprechen könnt, für wen es am besten passt.</p><h4>Inbox und Liste</h4><ul><li><b>Inbox</b>: zeigt personalisiert, was gerade für dich ansteht.</li><li><b>Liste</b>: alle Termine chronologisch mit Status; vergangene sind eingeklappt.</li></ul><h4>Status der Termine</h4><ul><li><b>Sammelphase</b>: Pool kann sich melden (bis ca. 3 Wochen vor dem Termin).</li><li><b>Zusagephase</b>: ab ca. 3 Wochen vorher — jetzt verbindlich zusagbar.</li><li><b>zugesagt</b>: eine Vertretung steht fest.</li><li><b>kritisch</b>: letzte Woche, noch keine Vertretung.</li><li><b>durchgerutscht</b>: vorbei, ohne Vertretung.</li></ul><h4>Fristen (weiche Hinweise)</h4><p>Ablauf je Dienst: Nach dem Eintragen läuft die <b>Sammelphase</b>, in der sich der Pool meldet. Etwa 3 Wochen vor dem Termin beginnt die <b>Zusagephase</b> — erst dann ist eine verbindliche Zusage möglich (vorher zeigt die App „Zusage ab …"). Wird ein Dienst eingetragen, der bereits innerhalb der nächsten 3 Wochen liegt, entfällt die Sammelphase und er kann sofort zugesagt werden.</p><h4>Löschen</h4><p>Falsch eingetragene Dienste lassen sich löschen, solange sie nicht verbindlich zugesagt sind. Zugesagte Dienste sind final und können nicht mehr gelöscht werden (zuerst „freigeben").</p><h4>Jahresübersicht &amp; Export</h4><p>Im Bereich „Jahresübersicht &amp; Export" wählst du ein Jahr und siehst alle Dienste mit Status kompakt in einer Tabelle. „CSV herunterladen" speichert die Übersicht als Datei (öffnet sich in Excel). Am Ende steht eine kleine Statistik: Gesamtzahl, Aufschlüsselung je Status und ein Ranking der Personen nach zugesagten Diensten.</p><h4>Benachrichtigungen</h4><ul><li>Wer einen Dienst eingetragen hat, wird benachrichtigt, sobald jemand zusagt.</li><li>Die zugesagte Vertretung wird einige Tage vor dem Termin erinnert.</li><li>Offene Termine lassen sich per „Pool erinnern" in Erinnerung rufen.</li></ul></details></div>
  <div class="wp-foot" id="wp-foot"></div>`;function injectStyle(){var s=document.createElement("style");s.textContent=__CSS;document.head.appendChild(s);}function buildShell(){var r=document.getElementById("wp-root");if(!r){r=document.createElement("div");r.id="wp-root";document.body.appendChild(r);}r.innerHTML=__SHELL;}function getPageId(){if(window.AJS){if(AJS.Meta){var v=AJS.Meta.get("page-id");if(v)return v;}if(AJS.params&&AJS.params.pageId)return AJS.params.pageId;}var m=document.querySelector('meta[name="ajs-page-id"]');return m?m.getAttribute("content"):"";}function getCtx(){return (window.AJS&&AJS.contextPath)?AJS.contextPath():"";}var PID=getPageId(),CTX=getCtx(),IS_CONF=!!PID,__members=null,curName=null;function showError(e){var msg=(e&&e.message)?e.message:String(e);if(window.console)console.error("[WP]",e);var host=document.getElementById("wp-root")||document.body;var b=document.getElementById("wp-err");if(!b){b=document.createElement("div");b.id="wp-err";b.style.cssText="background:#ffeceb;color:#ae2a19;border:1px solid #ae2a19;border-radius:6px;padding:10px 12px;margin:10px 0;font:13px sans-serif";host.insertBefore(b,host.firstChild);}b.textContent="Fehler: "+msg+" (403=Rechte,404=Pfad,409=Version,413=zu groß)";}function showInfo(d){var host=document.getElementById("wp-root")||document.body;var b=document.createElement("div");b.style.cssText="background:rgb(243,249,244);border:1px solid rgb(145,200,156);border-radius:6px;padding:10px 12px;margin:10px 0;font:13px sans-serif;color:#1f5132";var msg="Erst-Import aus seed.json: "+d.members+" Mitglieder aus Gruppe \""+GROUP+"\", "+d.bestMapped+"/"+d.bestSeed+" Zusagen uebernommen, "+d.kannMapped+"/"+d.kannSeed+" kann uebernommen.";if(d.bestSeed===0){msg+=" ACHTUNG: seed.json enthaelt keine Zusagen - vermutlich veralteter Anhang.";}else if(d.bestMapped===0){msg+=" ACHTUNG: keine Zusage zugeordnet - Namen passen nicht zur Gruppe.";}if(d.unmapped&&d.unmapped.length){msg+=" Nicht zugeordnet: "+d.unmapped.join(", ")+".";}b.textContent=msg;host.insertBefore(b,host.firstChild);}function jget(p){return fetch(CTX+p,{credentials:"same-origin"}).then(function(r){if(!r.ok)throw new Error("GET "+p+" -> "+r.status);return r.json();});}function share(p){return fetch(CTX+"/rest/share-page/latest/share",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json","X-Atlassian-Token":"no-check"},body:JSON.stringify(p)}).then(function(r){if(!r.ok)throw new Error("share-page -> "+r.status);return true;});}function shareUsers(u,note){return share({users:u,emails:[],groups:[],note:note,entityId:PID,entityType:"page",contextualPageId:PID});}function shareGroup(g,note){return share({users:[],emails:[],groups:[g],note:note,entityId:PID,entityType:"page",contextualPageId:PID});}function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
/* ============================================================
   Sprint 2b — Activity-Stream-Sichtbarkeit ueber unsichtbaren
   Seiten-Marker (Anchor-Makro mit hochzaehlender Nummer).
   Eine echte Seitenversion erzeugt nativ den "Seite geaendert"-
   Eintrag (echter User + Avatar, kein Thirdparty-Endpoint).
   Throttle + Coalesce + Close-Flush + 409-Retry, fire-and-forget.
   Der Thirdparty-Endpoint /rest/activities/1.0/ wurde verworfen:
   er validiert die serverseitig aufgeloeste (relative) Avatar-URL
   ("image.url must be an absolute URI"), nicht im Payload loesbar.
   ============================================================ */
var BUMP_MIN_MS=300000;     // hoechstens ~1 Bump je 5 min (Drosselung)
var BUMP_COALESCE_MS=4000;  // Sammelfenster: Edit-Schwung -> 1 Bump
var BUMP_MAX_FAILS=5;       // danach still aufgeben (fire-and-forget)
var _bump={pending:false,lastAt:0,timer:null,inflight:false,fails:0,comment:"Vertretungspool aktualisiert"};
// Tolerant gegen Confluence-Normalisierung (Attribut-Reihenfolge, ergaenzte ac:macro-id/schema-version).
var MARKER_RE=/(<ac:structured-macro\b[^>]*\bac:name="anchor"[^>]*>[\s\S]*?wp-feed-)(\d+)([\s\S]*?<\/ac:structured-macro>)/;
function markerMacro(n){return '<ac:structured-macro ac:name="anchor"><ac:parameter ac:name="">wp-feed-'+n+'</ac:parameter></ac:structured-macro>';}
// Reines Delta: vorhandenen Marker hochzaehlen (per Regex ERSETZEN), sonst anhaengen. Bleibt round-trip-stabil bei genau 1 Marker.
function nextBody(body){body=body||"";var m=body.match(MARKER_RE);if(m)return body.replace(MARKER_RE,m[1]+(parseInt(m[2],10)+1)+m[3]);return body+markerMacro(1);}
function bumpPut(pg){return {id:PID,type:"page",title:pg.title,space:{key:(pg.space&&pg.space.key)},version:{number:pg.version.number+1,minorEdit:false,message:_bump.comment},body:{storage:{value:nextBody(pg.body&&pg.body.storage&&pg.body.storage.value),representation:"storage"}}};}
function bumpOnce(){return jget("/rest/api/content/"+PID+"?expand=body.storage,version,space").then(function(pg){return fetch(CTX+"/rest/api/content/"+PID,{method:"PUT",credentials:"same-origin",headers:{"Content-Type":"application/json","X-Atlassian-Token":"no-check"},body:JSON.stringify(bumpPut(pg))}).then(function(r){if(r.ok)return true;var e=new Error("bump PUT -> "+r.status);e.status=r.status;throw e;});});}
function bumpRetry(tries){return bumpOnce().catch(function(e){if(e&&e.status===409&&tries<2)return bumpRetry(tries+1);throw e;});}
function scheduleBump(){if(_bump.timer||_bump.inflight)return;var since=Date.now()-_bump.lastAt;var wait=(since>=BUMP_MIN_MS)?BUMP_COALESCE_MS:Math.max(BUMP_COALESCE_MS,BUMP_MIN_MS-since);_bump.timer=setTimeout(function(){_bump.timer=null;runBump();},wait);}
function runBump(){if(_bump.inflight||!_bump.pending)return;_bump.pending=false;_bump.inflight=true;bumpRetry(0).then(function(){_bump.lastAt=Date.now();_bump.fails=0;},function(e){_bump.fails++;if(window.console)console.warn("[WP] Activity-Bump:",e);if(_bump.fails<BUMP_MAX_FAILS)_bump.pending=true;}).then(function(){_bump.inflight=false;if(_bump.pending)scheduleBump();});}
function requestActivityPing(comment){if(!IS_CONF||!PID)return;if(comment)_bump.comment=comment;_bump.pending=true;scheduleBump();}
function sxJson(method,path,body){var x=new XMLHttpRequest();x.open(method,CTX+path,false);x.setRequestHeader("X-Atlassian-Token","no-check");x.setRequestHeader("Accept","application/json");if(body!=null)x.setRequestHeader("Content-Type","application/json");try{x.send(body!=null?JSON.stringify(body):null);}catch(e){return {status:0,text:""};}return {status:x.status,text:x.responseText};}
// Close-Flush: ausstehenden Bump bei beforeunload/hidden sofort, synchron, Best-Effort (umgeht die Drosselung).
function flushActivityNow(){if(!IS_CONF||!PID||!_bump.pending||_bump.inflight)return;if(_bump.timer){clearTimeout(_bump.timer);_bump.timer=null;}_bump.pending=false;try{var g=sxJson("GET","/rest/api/content/"+PID+"?expand=body.storage,version,space",null);if(!g||g.status<200||g.status>=300)return;var pg=JSON.parse(g.text);sxJson("PUT","/rest/api/content/"+PID,bumpPut(pg));}catch(e){}}
function RestStore(){var fn="wpdata.json";function meta(){return jget("/rest/api/content/"+PID+"/child/attachment?filename="+fn+"&expand=version").then(function(d){return (d.results&&d.results[0])||null;});}return {name:"rest",load:function(){return meta().then(function(a){if(!a)return null;return fetch(CTX+"/download/attachments/"+PID+"/"+fn+"?cb="+Date.now(),{credentials:"same-origin"}).then(function(r){if(!r.ok)throw new Error("download "+fn+" -> "+r.status);return r.json();});});},save:function(model){var blob=new Blob([JSON.stringify(model)],{type:"application/json"});var fd=new FormData();fd.append("file",blob,fn);fd.append("minorEdit","true");fd.append("comment","auto-save");return meta().then(function(a){var url=a?("/rest/api/content/"+PID+"/child/attachment/"+a.id+"/data"):("/rest/api/content/"+PID+"/child/attachment");return fetch(CTX+url,{method:"POST",credentials:"same-origin",headers:{"X-Atlassian-Token":"no-check"},body:fd}).then(function(r){if(!r.ok)throw new Error("save "+fn+" -> "+r.status);return true;});});},reset:function(){return Promise.resolve();}};}
/* === Property-Store-Adapter — Persistenz liegt in persistence.js (VertretiosPersistence.Store).
   Port der gehaerteten urlaubios-Persistenz: Copy-on-Write mit Token, Manifest-CAS, Nachlesen bei
   5xx, Umzug bei Bereichswechsel, Historie (10 Generationen), Admin-Wiederherstellung, Platzhalter
   gegen alte App-Versionen. Es gibt KEINEN synchronen Speicherpfad mehr (frueher beforeunload). === */
var OLD_FILES=["wpdata.json","ap-data.json"]; // Alt-Anhaenge als Migrationsquelle (erste vorhandene gewinnt)
// Alt-Anhang lesen: nicht vorhanden -> null; jeder andere Fehler -> Exception (= Ladefehler, nie "leer").
function readAttachmentStrict(fn){
  return fetch(CTX+"/rest/api/content/"+PID+"/child/attachment?filename="+encodeURIComponent(fn)+"&expand=version",{credentials:"same-origin"}).then(function(r){
    if(r.status===404)return null;if(!r.ok)throw new Error("Anhang-Liste "+fn+" -> "+r.status);
    return r.json().then(function(d){var a=(d.results&&d.results[0])||null;if(!a)return null;
      return fetch(CTX+"/download/attachments/"+PID+"/"+encodeURIComponent(fn)+"?cb="+Date.now(),{credentials:"same-origin"}).then(function(r2){
        if(!r2.ok)throw new Error("Anhang "+fn+" -> "+r2.status);
        return r2.json().then(function(j){if(!j||typeof j!=="object")throw new Error("Anhang "+fn+" unlesbar");return j;},function(){throw new Error("Anhang "+fn+" ist kein gueltiges JSON");});
      });
    });
  });
}
function readOldAttachment(){return OLD_FILES.reduce(function(p,fn){return p.then(function(found){return found?found:readAttachmentStrict(fn);});},Promise.resolve(null));}
function PropertyStore(){
  var P=window.VertretiosPersistence;
  if(!P||!P.Store)throw new Error("persistence.js fehlt oder wurde nicht geladen (Anhang pruefen, Seite neu laden).");
  var st=new P.Store(new P.ConfluenceTransport(PID,CTX),{fallbackSource:readOldAttachment});
  function cp(m){return m==null?m:JSON.parse(JSON.stringify(m));}
  return {
    name:"property",store:st,
    // -> Modell | null (nur wenn wirklich keine Daten: kein Manifest und kein Alt-Anhang -> Erst-Import).
    // Ladefehler -> reject (nie leeres Modell als Ersatz).
    load:function(){return st.load().then(function(m){return st.source==="none"?null:cp(m);});},
    // Delta-Merge-Speichern: baseGen = Generation, auf der das lokale Modell beruht.
    saveMerge:function(m,replay,baseGen){return st.saveMerge(m,replay,baseGen);},
    // Erst-Import (Seed/Version-Stempel): ueberschreibt NIE vorhandene Daten anderer.
    save:function(m){return st.saveMerge(m,P.replayInitial(m),st.gen);},
    peekServerGen:function(){return st.peekGen().catch(function(){return st.gen;});},
    currentGen:function(){return st.gen;},
    isReadOnly:function(){return !!st.readOnly;},
    recovered:function(){return st.recovered;},
    info:function(){return {gen:st.gen,key:st.manifestKey,source:st.source};},
    describe:function(){return st.describeSets();},
    restore:function(row){return st.restoreFrom(row.layout,row.gen,row.token,row.count);},
    reset:function(){return Promise.resolve();}
  };
}
function loadConfluence(){return Promise.all([jget("/rest/api/user/current"),jget("/rest/api/group/"+encodeURIComponent(GROUP)+"/member?limit=200")]).then(function(res){var u=res[0];var arr=(res[1].results||res[1]||[]);var ms=arr.map(function(m,i){return {id:(m.userKey||m.username||m.name),name:(m.displayName||m.fullName||m.username||m.name),order:i,username:(m.username||m.name)};});if(!ms.length)throw new Error("Gruppe '"+GROUP+"' leer oder nicht lesbar");return {cur:(u.userKey||u.username||u.name),curName:(u.displayName||u.fullName||u.username),members:ms};});}function remapSeed(seed,live){function norm(s){return String(s||"").toLowerCase().replace(/\s+/g," ").replace(/^ | $/g,"");}function tok(s){return norm(s).split(" ").filter(function(x){return x;});}var liveList=live.map(function(m){return {id:m.id,toks:tok(m.name),full:norm(m.name)};});var fullMap={};liveList.forEach(function(l){fullMap[l.full]=l.id;});function hasInit(l,init,notFirst){for(var i=0;i<l.toks.length;i++){if(l.toks[i].charAt(0)===init&&(!notFirst||l.toks[i].indexOf(notFirst)!==0))return true;}return false;}function matchName(name){var nn=norm(name);if(fullMap[nn])return fullMap[nn];var st=tok(name);if(!st.length)return null;var first=st[0];var initial=null,last=st[st.length-1];if(st.length>1&&/^[a-zäöüß]\.?$/.test(last))initial=last.charAt(0);var cands=liveList.filter(function(l){return l.toks.indexOf(first)>=0;});if(cands.length===1)return cands[0].id;if(cands.length>1&&initial){var f=cands.filter(function(l){return hasInit(l,initial,first);});if(f.length===1)return f[0].id;}if(first.length>=3){var pc=liveList.filter(function(l){for(var i=0;i<l.toks.length;i++){if(l.toks[i].indexOf(first)===0)return true;}return false;});if(pc.length===1)return pc[0].id;if(pc.length>1&&initial){var pf=pc.filter(function(l){return hasInit(l,initial,first);});if(pf.length===1)return pf[0].id;}}return null;}var sById={};(seed.members||[]).forEach(function(m){sById[m.id]=m;});function mp(sid){var sm=sById[sid];if(!sm)return null;return matchName(sm.name)||null;}var unset={},bestSeed=0,bestMapped=0,kannSeed=0,kannMapped=0;var reqs=(seed.requests||[]).map(function(r){var kann=[];(r.kann||[]).forEach(function(sid){kannSeed++;var l=mp(sid);if(l){kann.push(l);kannMapped++;}else{var s=sById[sid];unset[(s&&s.name)||sid]=1;}});var best=null;if(r.best){bestSeed++;var lb=mp(r.best);if(lb){best=lb;bestMapped++;}else{var sb=sById[r.best];unset[(sb&&sb.name)||r.best]=1;}}var dvu=r.dienstVonUser?(mp(r.dienstVonUser)||r.dienstVonUser):null;return {id:r.id,date:r.date,dienstVon:r.dienstVon,dienstVonUser:dvu,eintragVom:r.eintragVom,kann:kann,best:best,passed:[],remindedAt:r.remindedAt||null,confirmNotifiedAt:r.confirmNotifiedAt||null,bestAt:r.bestAt||null};});__importDiag={members:live.length,bestSeed:bestSeed,bestMapped:bestMapped,kannSeed:kannSeed,kannMapped:kannMapped,unmapped:Object.keys(unset)};if(__importDiag.unmapped.length&&window.console)console.warn("[WP] Erst-Import nicht zugeordnet:",__importDiag.unmapped);return {version:seed.version||3,config:seed.config||{reminderLeadDays:3},members:live,requests:reqs};}function getSeed(){var el=document.getElementById("wp-seed");if(el){try{return Promise.resolve(readSeed());}catch(e){return Promise.reject(e);}}return fetch(CTX+"/download/attachments/"+PID+"/seed.json?cb="+Date.now(),{credentials:"same-origin"}).then(function(r){if(!r.ok)throw new Error("seed.json -> "+r.status);return r.json();});}function wireUserSearch(){var inp=document.getElementById("g-name"),dl=document.getElementById("names"),t=null;if(!inp)return;inp.addEventListener("input",function(){var q=inp.value.trim();if(t)clearTimeout(t);if(q.length<2)return;t=setTimeout(function(){jget("/rest/api/search/user?cql="+encodeURIComponent('user.fullname~"'+q+'*"')+"&limit=8").then(function(d){var res=(d.results||[]).map(function(x){return x.user||x;});dl.innerHTML=res.map(function(u){var nm=u.displayName||u.username;userCache[nm.toLowerCase()]=(u.username||u.userKey);return '<option value="'+nm+'">';}).join("");}).catch(function(){});},250);});}
  var SKEY="wp-data-s3",UKEY="wp-user-s3",VKEY="wp-view-s3";
  function readSeed(){var raw=document.getElementById("wp-seed").textContent;return JSON.parse(raw.slice(raw.indexOf("{"),raw.lastIndexOf("}")+1));}
  var WD=["So","Mo","Di","Mi","Do","Fr","Sa"];
  var MON=["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
  function d(iso){var p=iso.split("-");return new Date(p[0],p[1]-1,p[2]);}
  function fmt(iso){var x=d(iso);return ("0"+x.getDate()).slice(-2)+"."+("0"+(x.getMonth()+1)).slice(-2)+"."+x.getFullYear();}
  function weekday(iso){return WD[d(iso).getDay()];}
  function days(a,b){return Math.round((d(b)-d(a))/86400000);}
  function isoWeek(iso){var t=d(iso),dn=(t.getDay()+6)%7;t.setDate(t.getDate()-dn+3);var f=new Date(t.getFullYear(),0,4),dn2=(f.getDay()+6)%7;f.setDate(f.getDate()-dn2+3);return 1+Math.round((t-f)/604800000);}
  function easter(y){var a=y%19,b=Math.floor(y/100),c=y%100,dd=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-dd-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),mo=Math.floor((h+l-7*m+114)/31),da=((h+l-7*m+114)%31)+1;return new Date(y,mo-1,da);}
  function ad(dt,n){var x=new Date(dt);x.setDate(x.getDate()+n);return x;}
  function key(dt){return dt.getFullYear()+"-"+("0"+(dt.getMonth()+1)).slice(-2)+"-"+("0"+dt.getDate()).slice(-2);}
  function bwHol(y){var e=easter(y),h={};h[y+"-01-01"]="Neujahr";h[y+"-01-06"]="Hl. Drei Könige";h[key(ad(e,-2))]="Karfreitag";h[key(ad(e,1))]="Ostermontag";h[y+"-05-01"]="Tag der Arbeit";h[key(ad(e,39))]="Christi Himmelfahrt";h[key(ad(e,50))]="Pfingstmontag";h[key(ad(e,60))]="Fronleichnam";h[y+"-10-03"]="Tag d. Dt. Einheit";h[y+"-11-01"]="Allerheiligen";h[y+"-12-25"]="1. Weihnachtstag";h[y+"-12-26"]="2. Weihnachtstag";return h;}
  var _hc={};function holiday(iso){var y=+iso.slice(0,4);if(!_hc[y])_hc[y]=bwHol(y);return _hc[y][iso]||null;}
  function isWeekendOrHoliday(iso){var w=d(iso).getDay();return w===0||w===6||!!holiday(iso);}
  function statusOf(req,t){if(req.date<t)return req.best?"erledigt":"durchgerutscht";if(req.best)return "vergeben";var toD=days(t,req.date);if(toD<=Math.min(7,cwin()))return "kritisch";if(toD<=cwin())return "vergabe-offen";return "sammeln";}
  function yearCounts(model,year){var c={};model.members.forEach(function(m){c[m.id]=0;});model.requests.forEach(function(r){if(r.best&&+r.date.slice(0,4)===year)c[r.best]++;});return c;}
  function hashStr(s){var h=2166136261;for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}function suggestFor(req,byId,counts){if(req.best||!req.kann.length)return null;var pss=req.passed||[];var elig=req.kann.filter(function(id){return byId[id]&&pss.indexOf(id)<0;});if(!elig.length)return null;var mn=Math.min.apply(null,elig.map(function(id){return counts[id]||0;}));var tied=elig.filter(function(id){return (counts[id]||0)===mn;}).sort();var pick=tied[hashStr((req.id||req.date)+":"+tied.join(","))%tied.length];return {pick:pick,tied:tied,min:mn};}function sugText(s){var o=s.tied.filter(function(id){return id!==s.pick;}).map(function(id){return byId[id].name;});return byId[s.pick].name+(o.length?" (gleichauf: "+o.join(", ")+")":"");}
  function upgradeData(d){if(d&&(!d.version||d.version<2)){d.version=2;return true;}return false;}
  function makeStorage(seed){try{var t="__wp_probe__";window.localStorage.setItem(t,"1");window.localStorage.removeItem(t);return {name:"local",load:function(){var raw=window.localStorage.getItem(SKEY);if(raw){try{var m=JSON.parse(raw);if(m&&m.version===seed.version)return m;}catch(e){}}var fresh=JSON.parse(JSON.stringify(seed));try{window.localStorage.setItem(SKEY,JSON.stringify(fresh));}catch(e2){}return fresh;},save:function(n){window.localStorage.setItem(SKEY,JSON.stringify(n));return true;},reset:function(){window.localStorage.removeItem(SKEY);}};}catch(e){var data=JSON.parse(JSON.stringify(seed));return {name:"memory",load:function(){return JSON.parse(JSON.stringify(data));},save:function(n){data=JSON.parse(JSON.stringify(n));return true;},reset:function(){data=JSON.parse(JSON.stringify(seed));}};}}
  function getLS(k,dflt){try{var v=window.localStorage.getItem(k);return v===null?dflt:v;}catch(e){return dflt;}}
  function setLS(k,v){try{window.localStorage.setItem(k,v);}catch(e){}}

  var SEED=null,storage=null,model=null,byId={},cur=null;
  var view=getLS(VKEY,"a");
  var today=new Date(),todayIso=key(today),curYear=today.getFullYear();
  function cwin(){return (model.config&&model.config.confirmWindowDays)||21;}function confirmAllowed(r){return days(todayIso,r.date)<=cwin();}function lead(){return (model.config&&model.config.reminderLeadDays)||3;}
  var act=[];
  function log(msg,over){act.unshift({t:new Date().toLocaleTimeString(),m:msg,o:!!over});if(act.length>50)act.pop();}
  var _saveTimer=null,_dirty=false,_lastSaved=null,_saving=false,_pendingSave=false,_polling=false,_pollTimer=null;
  var _baseGen=0;        // Server-Generation, auf der _lastSaved beruht (Basis fuer Delta-Merge)
  var _saveError=null;   // letzter Speicherfehler -> rotes Banner mit "Erneut versuchen"
  var _loadError=null;   // Ladefehler -> rotes Banner, App schreibgeschuetzt
  function onSaveErr(e){_saveError=e||new Error("Speichern fehlgeschlagen");if(window.console)console.error("[WP] Speichern:",e);renderStatus();}
  function isReadOnly(){return !!_loadError||!!(storage&&storage.isReadOnly&&storage.isReadOnly());}
  function syncBaseGen(){if(storage&&storage.currentGen)_baseGen=storage.currentGen();}
  /* --- Status-Banner (Lade-/Speicherfehler, Rueckfall-Stand) + Fuss mit Build-Version --- */
  function renderStatus(){
    var host=document.getElementById("wp-root")||document.body;
    var el=document.getElementById("wp-status");
    if(!el){el=document.createElement("div");el.id="wp-status";host.insertBefore(el,host.firstChild);}
    var html="",rec=storage&&storage.recovered&&storage.recovered();
    if(_loadError){
      html+='<div class="wp-errbar" id="wp-loaderr"><span class="txt"><b>Daten konnten nicht geladen werden.</b> '+esc(_loadError.message||String(_loadError))+'<br>Die App ist schreibgesch\u00fctzt \u2013 es wird nichts gespeichert. Bitte Seite neu laden; bleibt der Fehler, Administrator:in informieren.</span><button type="button" class="btn sm" data-status-act="reload">Seite neu laden</button></div>';
    }else if(rec){
      html+='<div class="wp-warnbar" id="wp-recbar"><span class="txt"><b>\u00c4lterer Datenstand angezeigt (schreibgesch\u00fctzt).</b> Der zuletzt gespeicherte Stand (Generation '+esc(rec.manifestGen)+') ist nicht lesbar: '+esc(rec.cause)+' Angezeigt wird Generation '+esc(rec.fromGen)+'. Speichern ist gesperrt, bis eine Administrator:in unter \u201eDatenst\u00e4nde (Admin)\u201c bewusst wiederherstellt.</span></div>';
    }
    if(!_loadError&&_saveError){
      html+='<div class="wp-errbar" id="wp-saveerr"><span class="txt"><b>Nicht gespeichert.</b> '+esc(_saveError.message||String(_saveError))+(_dirty?' \u00b7 Deine \u00c4nderungen sind noch offen.':'')+'</span><button type="button" class="btn sm" data-status-act="retry">Erneut versuchen</button></div>';
    }
    el.innerHTML=html;
    var b=el.querySelectorAll("[data-status-act]");
    for(var i=0;i<b.length;i++){b[i].onclick=function(){var a=this.getAttribute("data-status-act");if(a==="reload"){location.reload();return;}this.disabled=true;_dirty=true;doSaveCore();};}
    host.classList.toggle("wp-ro",isReadOnly());
    var f=document.getElementById("wp-foot");
    if(f){var inf=(storage&&storage.info)?storage.info():null;f.textContent="Build "+BUILD_VERSION+(inf&&inf.gen?" \u00b7 Datenstand Generation "+inf.gen+(inf.key?" ("+inf.key+")":""):"")+(isReadOnly()?" \u00b7 schreibgesch\u00fctzt":"");}
  }
  function setStatus(msg,isErr){if(isErr){showError(new Error(msg));}else{log(msg);}}

  /* --- Baustein 2: base->local Delta als Replay-Funktion ------------------
     Bewahrt fremde Aenderungen an ANDEREN Datensaetzen und an anderen FELDERN
     desselben Datensatzes. Einzige verbleibende last-write-wins-Stelle: zwei
     Personen aendern dasselbe Feld desselben Datensatzes. Idempotent: setzt
     konkrete Zielwerte / identifiziert Datensaetze ueber stabile r.id. */
  function buildReplay(base,local){
    base=base||{};local=local||{};
    var bReq={};(base.requests||[]).forEach(function(r){bReq[r.id]=r;});
    var lReq={};(local.requests||[]).forEach(function(r){lReq[r.id]=r;});
    var adds=[];(local.requests||[]).forEach(function(r){if(!bReq[r.id])adds.push(JSON.parse(JSON.stringify(r)));});
    var removes=[];(base.requests||[]).forEach(function(r){if(!lReq[r.id])removes.push(r.id);});
    var changes={};Object.keys(lReq).forEach(function(id){if(!bReq[id])return;var b=bReq[id],l=lReq[id],f={},any=false;Object.keys(l).forEach(function(k){if(JSON.stringify(l[k])!==JSON.stringify(b[k])){f[k]=l[k];any=true;}});if(any)changes[id]=JSON.parse(JSON.stringify(f));});
    var cfg=((JSON.stringify(local.config)!==JSON.stringify(base.config))&&local.config!=null)?JSON.parse(JSON.stringify(local.config)):null;
    var lv=local.version||0;
    return function(fresh){
      fresh=fresh||{};fresh.requests=fresh.requests||[];
      if(removes.length)fresh.requests=fresh.requests.filter(function(r){return removes.indexOf(r.id)<0;});
      var fById={};fresh.requests.forEach(function(r){fById[r.id]=r;});
      Object.keys(changes).forEach(function(id){var r=fById[id];if(r){var f=changes[id];Object.keys(f).forEach(function(k){r[k]=JSON.parse(JSON.stringify(f[k]));});}});
      adds.forEach(function(it){if(!fById[it.id])fresh.requests.push(JSON.parse(JSON.stringify(it)));});
      if(cfg){fresh.config=fresh.config||{};var k;for(k in cfg){if(cfg.hasOwnProperty(k))fresh.config[k]=cfg[k];}}
      fresh.version=Math.max(lv,fresh.version||0)||lv||2;
      return fresh;
    };
  }

  // Uebernimmt den tatsaechlich persistierten Stand. Hat der Nutzer WAEHREND des
  // Saves weiter editiert (model != gesendeter Stand), wird dessen Delta erneut
  // auf den (ggf. gemergten) Serverstand angewandt, statt es zu verlieren.
  function adoptMerged(merged,sentStr){
    if(!merged){_lastSaved=JSON.stringify(model);return;}
    if(IS_CONF&&__members)merged.members=__members;
    var curStr=JSON.stringify(model);
    if(curStr===sentStr){
      if(JSON.stringify(merged)!==curStr){model=merged;byId={};(model.members||[]).forEach(function(m){byId[m.id]=m;});render();}
      _lastSaved=JSON.stringify(model);syncBaseGen();
    }else{
      var fin=buildReplay(JSON.parse(sentStr),JSON.parse(curStr))(merged);
      if(IS_CONF&&__members)fin.members=__members;
      model=fin;byId={};(model.members||[]).forEach(function(m){byId[m.id]=m;});render();
      _lastSaved=JSON.stringify(merged);syncBaseGen();_dirty=true; // Folge-Save bringt die Zwischen-Edits raus
    }
    hideUpdateBanner();
  }

  function doSaveCore(){
    if(_saving){_pendingSave=true;return Promise.resolve();}
    if(_saveTimer){clearTimeout(_saveTimer);_saveTimer=null;}
    if(!_dirty)return Promise.resolve();
    if(isReadOnly()){
      // Schreibgeschuetzt (Ladefehler/Rueckfall): lokale Aenderung verwerfen, nie speichern.
      _dirty=false;if(_lastSaved){try{model=JSON.parse(_lastSaved);byId={};(model.members||[]).forEach(function(m){byId[m.id]=m;});}catch(e){}}
      _saveError=new Error("Schreibgesch\u00fctzt \u2013 die Daten konnten nicht vollst\u00e4ndig geladen werden. \u00c4nderung wurde nicht gespeichert.");
      render();return Promise.resolve();
    }
    var js=JSON.stringify(model);
    if(js===_lastSaved){_dirty=false;return Promise.resolve();}
    _dirty=false;
    if(storage&&storage.saveMerge){
      _saving=true;
      var base=null;if(_lastSaved){try{base=JSON.parse(_lastSaved);}catch(e){base=null;}}
      var local=JSON.parse(js),sentStr=js,replay=buildReplay(base,local);
      // Basis-Generation mitgeben: nach Fehlern/Konflikten wird das Delta auf den FRISCHEN Stand gelegt.
      // _lastSaved bleibt bei Fehlern die Basis -> "Erneut versuchen" wiederholt genau dieses Delta.
      return storage.saveMerge(local,replay,_baseGen).then(function(m){_saveError=null;adoptMerged(m,sentStr);renderStatus();},function(e){_dirty=true;onSaveErr(e);}).then(function(){_saving=false;if(_pendingSave||(_dirty&&!_saveError)){_pendingSave=false;persist();}});
    }
    _lastSaved=js;var r=storage.save(model);
    return (r&&r.then)?r.catch(function(e){_lastSaved=null;onSaveErr(e);}):Promise.resolve();
  }
  function doSave(){doSaveCore();}
  // Kein synchroner Speicherpfad beim Schliessen (frueher: blinder Manifest-PUT + Loeschen -> Totalverlust).
  // Beim Verlassen/Verstecken nur den normalen async Copy-on-Write-Save anstossen; wird er vom Browser
  // abgebrochen, bleibt der alte Stand gueltig (es wird beim Entladen nie etwas geloescht).
  function flushPendingAsync(){if(_dirty&&!isReadOnly())doSaveCore();}
  function hasUnsaved(){return !isReadOnly()&&(_dirty||_saving||!!_saveTimer);}
  function persist(){_dirty=true;if(_saveTimer)clearTimeout(_saveTimer);_saveTimer=setTimeout(doSave,1500);}

  /* --- Baustein 1: Update-Hinweis per Generations-Polling -----------------
     Timer prueft alle 60s die Manifest-Generation; sofort bei Tab-Fokus;
     im Hintergrund pausiert. Hoehere Serverversion -> dezentes Banner.
     NICHTS wird automatisch neu gerendert; erst der Klick laedt frisch. */
  function bannerHost(){return document.getElementById("wp-root")||document.body;}
  function showUpdateBanner(){var el=document.getElementById("wp-update");if(!el){el=document.createElement("div");el.id="wp-update";el.className="wp-update-banner";var h=bannerHost();h.insertBefore(el,h.firstChild);el.innerHTML='<span class="txt">Es gibt neue \u00c4nderungen von anderen.</span><button type="button" data-action="apply-update">Jetzt aktualisieren</button>';var btn=el.querySelector("button");if(btn)btn.addEventListener("click",applyPendingUpdate);}el.style.display="flex";}
  function hideUpdateBanner(){var el=document.getElementById("wp-update");if(el)el.style.display="none";}
  // Klick l-> frisch laden = korrekter Stand + Version. Offene eigene Edits werden
  // zuvor gemergt gespeichert, statt verworfen zu werden.
  function reloadModel(){if(!(IS_CONF&&storage&&storage.load))return Promise.resolve();return storage.load().then(function(data){if(!data)return;upgradeData(data);if(!data.members||!data.members.length)data.members=__members;if(IS_CONF&&__members)data.members=__members;model=data;byId={};(model.members||[]).forEach(function(m){byId[m.id]=m;});_lastSaved=JSON.stringify(model);_dirty=false;_saveError=null;_loadError=null;syncBaseGen();},function(e){_loadError=e;renderStatus();throw e;});}
  function applyPendingUpdate(){
    function refresh(){return reloadModel().then(function(){hideUpdateBanner();render();setStatus("Aktualisiert.");});}
    if(_dirty){doSaveCore().then(function(){if(_dirty){setStatus("Speichern fehlgeschlagen \u2014 Aktualisierung abgebrochen.",true);}else{refresh().catch(onSaveErr);}});}
    else{refresh().catch(onSaveErr);}
  }
  function pollVersion(){if(_polling||!IS_CONF||document.hidden)return;if(!storage||!storage.peekServerGen||!storage.currentGen)return;_polling=true;storage.peekServerGen().then(function(g){_polling=false;if(g>_baseGen)showUpdateBanner();}).catch(function(){_polling=false;});}
  function startPolling(){if(_pollTimer||!IS_CONF)return;_pollTimer=setInterval(pollVersion,60000);document.addEventListener("visibilitychange",function(){if(!document.hidden)pollVersion();});}
  function find(id){for(var i=0;i<model.requests.length;i++)if(model.requests[i].id===id)return model.requests[i];return null;}
  function initials(name){var p=name.trim().split(/\s+/);return (p.length>1?(p[0][0]+p[1][0]):name.slice(0,2)).toUpperCase();}
  // Beworbene aufsteigend nach bisher uebernommenen Diensten (Tiebreak: Name) -> wer am wenigsten hatte, steht vorn.
  function sortByLoad(ids,counts,pick){counts=counts||{};return (ids||[]).slice().sort(function(a,b){var ca=counts[a]||0,cb=counts[b]||0;if(ca!==cb)return ca-cb;if(pick){if(a===pick)return -1;if(b===pick)return 1;}var na=(byId[a]&&byId[a].name)||String(a),nb=(byId[b]&&byId[b].name)||String(b);return na<nb?-1:(na>nb?1:0);});}

  // ---- Benachrichtigungen (Stubs) ----
  function notifyConfirm(r){if(r.confirmNotifiedAt)return;var note='Dein Dienst am '+weekday(r.date)+' '+fmt(r.date)+' wird von '+byId[r.best].name+' uebernommen.';if(r.dienstVonUser){var __t=(byId[r.dienstVonUser]&&(byId[r.dienstVonUser].username||byId[r.dienstVonUser].id))||r.dienstVonUser;log('[Teilen -> User '+__t+'] '+note);r.confirmNotifiedAt=todayIso;if(IS_CONF)shareUsers([__t],note).catch(showError);}else{log('[Hinweis] Bestaetigung nicht verschickt: Dienst von ('+r.dienstVon+') ist kein Confluence-User');}}
  function notifyDuty(r,manual){if(!r.best)return;var m=byId[r.best],target=m.username||m.id;var note='Erinnerung: '+weekday(r.date)+' '+fmt(r.date)+' uebernimmst du den Wochenenddienst'+(r.dienstVon?' (Dienst von '+r.dienstVon+')':'')+'.';log('[Teilen -> User '+target+'] '+note+(manual?' [manuell]':' [faellig]'));r.remindedAt=todayIso;if(IS_CONF)shareUsers([target],note).catch(showError);}
  function poolRemind(r){var sg=suggestFor(r,byId,yearCounts(model,curYear));var who=sg?(" Vorschlag: "+sugText(sg)+"."):"";var note='Bitte um Vertretung: '+weekday(r.date)+' '+fmt(r.date)+(r.dienstVon?' (Dienst von '+r.dienstVon+')':'')+' ist noch offen.'+who;log('[Teilen -> Gruppe '+GROUP+'] '+note);if(IS_CONF)shareGroup(GROUP,note).catch(showError);}
  function runDueReminders(){var L=lead(),changed=false;model.requests.forEach(function(r){if(r.best&&r.date>=todayIso&&!r.remindedAt&&days(todayIso,r.date)<=L){notifyDuty(r,false);changed=true;}});if(changed)persist();}

  // ---- Aktionen ----
  function toggleKann(id){var r=find(id);if(!r)return;if(r.passed){var pp=r.passed.indexOf(cur);if(pp>=0)r.passed.splice(pp,1);}var i=r.kann.indexOf(cur);if(i>=0){r.kann.splice(i,1);log(byId[cur].name+' entfernt kann bei '+fmt(r.date));}else{r.kann.push(cur);log(byId[cur].name+' markiert kann bei '+fmt(r.date));feedEvent("eintragen",r);}persist();render();}function pass(id){var r=find(id);if(!r||r.best)return;if(!r.passed)r.passed=[];if(r.passed.indexOf(cur)<0){r.passed.push(cur);log(byId[cur].name+' gibt '+fmt(r.date)+' an die/den Naechste(n) weiter');}persist();render();}
  function freigeben(id){var r=find(id);if(!r||!r.best)return;var mine=r.best===cur;if(!mine&&!isAdmin())return;var prev=byId[r.best]?byId[r.best].name:r.best;r.best=null;r.confirmNotifiedAt=null;r.remindedAt=null;r.bestAt=null;log(byId[cur].name+(mine?"":" (Admin)")+' gibt '+fmt(r.date)+' wieder frei'+(mine?"":' (war: '+prev+')'));persist();render();}
  function uebernehmen(id){var r=find(id);if(!r)return;if(r.best&&r.best!==cur){if(!confirm(byId[r.best].name+' hat bereits bestaetigt. Vertretung ersetzen?'))return;log('ersetzt Vertretung '+byId[r.best].name+' -> '+byId[cur].name+' ('+fmt(r.date)+')',true);}var toD=days(todayIso,r.date);if(toD>cwin()){alert('Verbindliche Zusage ist erst ab '+fmt(key(ad(d(r.date),-cwin())))+' moeglich (Frist: '+cwin()+' Tage vor dem Termin). Noch '+toD+' Tage bis zum Termin.');return;}var changed=r.best!==cur;r.best=cur;if(!r.kann)r.kann=[];if(r.kann.indexOf(cur)<0)r.kann.push(cur);if(r.passed){var __pp=r.passed.indexOf(cur);if(__pp>=0)r.passed.splice(__pp,1);}if(changed){r.confirmNotifiedAt=null;r.remindedAt=null;r.bestAt=todayIso;}log(byId[cur].name+' uebernimmt '+fmt(r.date));notifyConfirm(r);persist();render();}
  function remind(id){var r=find(id);if(!r||!r.best)return;notifyDuty(r,true);persist();render();}
  function pool(id){var r=find(id);if(!r)return;poolRemind(r);render();}
  function anlegen(){var dt=document.getElementById("g-date").value,nm=document.getElementById("g-name").value.trim(),h=document.getElementById("g-hint");if(!dt){h.innerHTML='<span style="color:var(--danger)">Bitte ein Datum waehlen.</span>';return;}if(!nm){h.innerHTML='<span style="color:var(--danger)">Bitte Dienst von angeben.</span>';return;}var adm=isAdmin(),einEl=document.getElementById("g-ein"),bestEl=document.getElementById("g-best");var ein=(adm&&einEl&&einEl.value)?einEl.value:todayIso;var bst=(adm&&bestEl&&bestEl.value&&byId[bestEl.value])?bestEl.value:null;var m=model.members.filter(function(x){return x.name.toLowerCase()===nm.toLowerCase();})[0];var nr={id:"n"+Date.now(),date:dt,dienstVon:nm,dienstVonUser:(m?m.id:(userCache[nm.toLowerCase()]||null)),eintragVom:ein,kann:(bst?[bst]:[]),best:bst,passed:[],remindedAt:null,confirmNotifiedAt:null,bestAt:(bst?ein:null)};model.requests.push(nr);log(byId[cur].name+' legt Gesuch an: '+fmt(dt)+' (Dienst von '+nm+')'+(m?'':' [Freitext]')+(bst?' — uebernommen von '+byId[bst].name:'')+(dt<todayIso?' [rueckwirkend]':''));feedEvent("bereitstellen",nr);persist();document.getElementById("g-name").value="";document.getElementById("g-date").value="";if(einEl)einEl.value="";if(bestEl)bestEl.value="";document.getElementById("g-hint").textContent="";document.getElementById("gcard").style.display="none";render();}
  function aufraeumen(){var cut=key(ad(today,-365));var old=model.requests.filter(function(r){return r.date<cut;});if(!old.length){alert("Keine Termine aelter als 12 Monate.");return;}if(!confirm(old.length+" Termine aelter als 12 Monate (vor "+cut+") endgueltig loeschen?"))return;model.requests=model.requests.filter(function(r){return r.date>=cut;});log(old.length+" alte Termine aufgeraeumt (vor "+cut+")");persist();render();}
  function resetAll(){if(IS_CONF){onSaveErr(new Error("Zur\u00fccksetzen ist in Confluence deaktiviert \u2013 \u00e4ltere St\u00e4nde bitte \u00fcber \u201eDatenst\u00e4nde (Admin)\u201c wiederherstellen."));return;}if(!confirm("Auf den migrierten Excel-Stand zuruecksetzen? Lokale Aenderungen gehen verloren."))return;storage.reset();model=storage.load();byId={};model.members.forEach(function(m){byId[m.id]=m;});act=[];runDueReminders();log("Daten auf Seed zurueckgesetzt");render();}

  // ---- Render: Ansicht A (Inbox) ----
  function inboxCard(r,mode,counts){
    var n=days(todayIso,r.date),cd=n===0?"heute":(n===1?"morgen":"in "+n+" Tagen"),hn=holiday(r.date);
    var cls="icard"+(mode==="vorschlag"?" rec":"")+(mode==="kritisch"?" crit":"")+(mode==="mit"?" mit":"");
    var pill="";
    if(mode==="vorschlag")pill='<span class="pill rec">Vorschlag für dich</span> ';
    else if(mode==="kritisch")pill='<span class="pill crit">kritisch</span> ';
    else if(mode==="mit")pill='<span class="pill mit">gleichauf</span> ';else if(mode==="meine"&&!r.remindedAt&&n<=lead())pill='<span class="pill due">Erinnerung fällig</span> ';else if(mode==="beob"&&(r.passed||[]).indexOf(cur)>=0)pill='<span class="pill mit">weitergegeben</span> ';
    var sg=suggestFor(r,byId,counts);var sl=(sg&&(mode==="vorschlag"||mode==="mit"||mode==="kritisch"))?(" · Vorschlag: "+sugText(sg)):"";var meta="Dienst von "+(r.dienstVon||"—")+" · "+cd+(hn?" · "+hn:"")+" · "+r.kann.length+" Interessent(en)"+sl;
    var a="";
    var ca=confirmAllowed(r),ab=fmt(key(ad(d(r.date),-cwin())));if(mode==="vorschlag")a=(ca?'<button class="btn prim sm" data-act="ueb" data-id="'+r.id+'">Jetzt definitiv zusagen, du wärst dran</button>':'<span class="muted">Zusage ab '+ab+' möglich</span> ')+'<button class="btn sm" data-act="pass" data-id="'+r.id+'">Nicht ich – weitergeben</button>';
    else if(mode==="kann"){var has=r.kann.indexOf(cur)>=0;a='<button class="btn sm'+(has?" on":"")+'" data-act="kann" data-id="'+r.id+'">'+(has?"✓ kann":"+ kann")+'</button>';}
    else if(mode==="kritisch")a='<button class="btn prim sm" data-act="ueb" data-id="'+r.id+'">zusagen</button><button class="btn sm" data-act="pool" data-id="'+r.id+'">Pool erinnern</button>';else if(mode==="mit")a=(ca?'<button class="btn prim sm" data-act="ueb" data-id="'+r.id+'">Definitiv zusagen nach Abstimmung</button>':'<span class="muted">Zusage ab '+ab+' möglich</span>');
    else if(mode==="meine")a='<button class="btn sm" data-act="remind" data-id="'+r.id+'">'+(r.remindedAt?"erneut erinnern":"jetzt erinnern")+'</button><button class="btn warn sm" data-act="frei" data-id="'+r.id+'">freigeben</button>';
    else if(mode==="beob"){var pz=(r.passed||[]).indexOf(cur)>=0;var has2=r.kann.indexOf(cur)>=0;a=(pz?'<button class="btn prim sm" data-act="ueb" data-id="'+r.id+'">doch zusagen</button>':"")+'<button class="btn sm'+(has2?" on":"")+'" data-act="kann" data-id="'+r.id+'">'+(has2?"✓ kann":"+ kann")+'</button>';}
    return '<div class="'+cls+' clk" data-detail="'+r.id+'"><div><div class="t">'+pill+weekday(r.date)+" "+fmt(r.date)+'</div><div class="m">'+meta+'</div></div><div class="iacts">'+a+'</div></div>';
  }
  function section(title,arr,mode,counts,emptyTxt){
    var body=arr.length?arr.map(function(r){return inboxCard(r,mode,counts);}).join(""):'<div class="empty">'+emptyTxt+'</div>';
    return '<div class="sec"><h3>'+title+' <span class="cnt">'+arr.length+'</span></h3>'+body+'</div>';
  }
  // ---- Detail-Modal (fuer Inbox & Liste) ----
  var detailId=null;
  function detailHost(){return document.getElementById("wp-root")||document.body;}
  function openDetail(id){if(!find(id))return;detailId=id;renderDetail();}
  function closeDetail(){detailId=null;var el=document.getElementById("wp-detail");if(el&&el.parentNode)el.parentNode.removeChild(el);}
  function renderDetail(){if(detailId==null)return;var r=find(detailId);if(!r){closeDetail();return;}var el=document.getElementById("wp-detail");if(!el){el=document.createElement("div");el.id="wp-detail";detailHost().appendChild(el);}el.innerHTML=detailHtml(r);}
  function dBtn(act,id,cls,label){return '<button type="button" class="btn '+cls+'" data-act="'+act+'" data-id="'+id+'">'+label+'</button>';}
  function detailActions(r){
    var ca=confirmAllowed(r),ab=fmt(key(ad(d(r.date),-cwin()))),out=[],del=canDelete(r);
    if(r.date<todayIso){
      if(r.best&&r.best===cur)out.push(dBtn("frei",r.id,"warn sm","freigeben"));
      if(del)out.push(dBtn("del",r.id,"warn sm",isOwner(r)?"zurückziehen":"Dienst löschen"));
      return out.join(" ");
    }
    if(r.best){
      if(r.best===cur){out.push(dBtn("frei",r.id,"warn sm","freigeben"));out.push(dBtn("remind",r.id,"sm",(r.remindedAt?"erneut erinnern":"erinnern")));}
      else{out.push(ca?dBtn("ueb",r.id,"sm","zusagen (ersetzen)"):'<span class="muted">Zusage ab '+ab+' möglich</span>');}
      if(del)out.push(dBtn("del",r.id,"warn sm","Dienst löschen"));
    }else{
      var has=r.kann.indexOf(cur)>=0;
      out.push(dBtn("kann",r.id,"sm"+(has?" on":""),(has?"✓ kann":"+ kann")));
      out.push(ca?dBtn("ueb",r.id,"prim sm","zusagen"):'<span class="muted">Zusage ab '+ab+' möglich</span>');
      if(has&&(r.passed||[]).indexOf(cur)<0)out.push(dBtn("pass",r.id,"sm","Nicht ich – weitergeben"));
      out.push(dBtn("pool",r.id,"sm","Pool erinnern"));
      if(del)out.push(dBtn("del",r.id,"warn sm",isOwner(r)?"zurückziehen":"Dienst löschen"));
    }
    return out.filter(Boolean).join(" ");
  }
  function admSyncHead(r){
    var de=document.getElementById("wp-adm-date"),dv=document.getElementById("wp-adm-dv"),ei=document.getElementById("wp-adm-ein");
    if(!de||!dv)return false;var chg=false,parts=[];
    if(ei&&ei.value&&ei.value!==(r.eintragVom||"")){parts.push("Eintrag "+(r.eintragVom?fmt(r.eintragVom):"—")+" -> "+fmt(ei.value));r.eintragVom=ei.value;chg=true;}
    if(de.value&&de.value!==r.date){parts.push("Datum "+fmt(r.date)+" -> "+fmt(de.value));r.date=de.value;chg=true;}
    var nn=dv.value.trim();
    if(nn!==(r.dienstVon||"")){var m=model.members.filter(function(x){return x.name.toLowerCase()===nn.toLowerCase();})[0];r.dienstVon=nn;r.dienstVonUser=m?m.id:(userCache[nn.toLowerCase()]||null);parts.push("Dienst von -> "+(nn||"—"));chg=true;}
    if(chg)log(byId[cur].name+" (Admin) aendert "+parts.join(", ")+" ("+fmt(r.date)+")");
    return chg;
  }
  function admHead(id){if(!isAdmin())return;var r=find(id);if(!r)return;if(admSyncHead(r))persist();render();}
  function admKann(id,uid){if(!isAdmin())return;var r=find(id);if(!r||!uid||!byId[uid])return;admSyncHead(r);var i=r.kann.indexOf(uid);if(i>=0){r.kann.splice(i,1);if(r.passed){var pp=r.passed.indexOf(uid);if(pp>=0)r.passed.splice(pp,1);}log(byId[cur].name+" (Admin) entfernt "+byId[uid].name+" aus Beworbenen ("+fmt(r.date)+")");}else{r.kann.push(uid);if(r.passed){var pp2=r.passed.indexOf(uid);if(pp2>=0)r.passed.splice(pp2,1);}log(byId[cur].name+" (Admin) fuegt "+byId[uid].name+" zu Beworbenen hinzu ("+fmt(r.date)+")");}persist();render();}
  function admBest(id){if(!isAdmin())return;var r=find(id);if(!r)return;admSyncHead(r);var sel=document.getElementById("wp-adm-best");if(!sel)return;var v=sel.value||null;if(v&&!byId[v])return;if(v===(r.best||null)){render();return;}var prev=r.best?((byId[r.best]&&byId[r.best].name)||r.best):null;r.best=v;r.confirmNotifiedAt=null;r.remindedAt=null;if(v){r.bestAt=todayIso;if(r.kann.indexOf(v)<0)r.kann.push(v);log(byId[cur].name+" (Admin) setzt Vertretung "+byId[v].name+(prev?(" (war: "+prev+")"):"")+" ("+fmt(r.date)+")");}else{r.bestAt=null;log(byId[cur].name+" (Admin) entfernt Vertretung"+(prev?(" (war: "+prev+")"):"")+" ("+fmt(r.date)+")");}persist();render();}
  function adminPanel(r){
    var opts=model.members.slice().sort(function(a,b){return a.order-b.order;});
    var dvv=esc(r.dienstVon||"").replace(/"/g,"&quot;");
    var head='<h4>Admin \u00b7 Kopfdaten</h4><div class="admgrid"><label class="admf">Datum<input type="date" id="wp-adm-date" value="'+r.date+'"></label><label class="admf">Dienst von<input type="text" id="wp-adm-dv" list="names" value="'+dvv+'"></label><label class="admf">Eingetragen am<input type="date" id="wp-adm-ein" value="'+(r.eintragVom||"")+'"></label><button type="button" class="btn sm" data-act="adm-head" data-id="'+r.id+'">\u00dcbernehmen</button></div>';
    var kset={};(r.kann||[]).forEach(function(id){kset[id]=1;});
    var chips=opts.map(function(m){var on=!!kset[m.id];return '<button type="button" class="admchip'+(on?" on":"")+'" data-act="adm-kann" data-id="'+r.id+'" data-uid="'+m.id+'">'+(on?"\u2713 ":"")+esc(m.name)+'</button>';}).join("");
    var kannBlock='<h4>Admin \u00b7 Beworbene verwalten ('+(r.kann||[]).length+')</h4><div class="admchips">'+chips+'</div>';
    var best=r.best||"";
    var sel='<select id="wp-adm-best"><option value="">\u2014 keine Vertretung \u2014</option>'+opts.map(function(m){return '<option value="'+m.id+'"'+(m.id===best?" selected":"")+'>'+esc(m.name)+'</option>';}).join("")+'</select>';
    var bestBlock='<h4>Admin \u00b7 Vertretung</h4><div class="admgrid">'+sel+'<button type="button" class="btn sm" data-act="adm-best" data-id="'+r.id+'">Setzen</button></div>';
    return '<div class="admbox">'+head+kannBlock+bestBlock+'</div>';
  }
  function detailHtml(r){
    var counts=yearCounts(model,curYear),st=statusOf(r,todayIso),meta=statusMeta(st),hn=holiday(r.date);
    var phase=r.best?(st==="erledigt"?"erledigt":"zugesagt"):(r.date<todayIso?"durchgerutscht":(days(todayIso,r.date)<=cwin()?"Zusagephase":"Sammelphase"));
    var head='<div class="wp-modal-h"><span class="badge '+meta[1]+'">'+esc(phase)+'</span><h3>'+weekday(r.date)+" "+fmt(r.date)+'<span class="kw">KW'+isoWeek(r.date)+'</span>'+(hn?'<span class="feier">'+esc(hn)+'</span>':"")+'</h3></div>';
    var earliest=null;{var ev=r.eintragVom||todayIso,dz=key(ad(d(r.date),-cwin()));earliest=(ev>dz?ev:dz);}
    var metaLine='Dienst von <b>'+esc(r.dienstVon||"—")+'</b>'+(r.eintragVom?" · eingetragen am "+fmt(r.eintragVom):"")+(!r.best&&r.date>=todayIso?(" · Zusage "+(earliest&&earliest>todayIso?("ab "+fmt(earliest)):"jetzt möglich")):"");
    var sg=suggestFor(r,byId,counts),pss=r.passed||[];
    var apps=sortByLoad(r.kann,counts,sg&&sg.pick).map(function(id){
      var m=byId[id],nm=m?m.name:id,c=counts[id]||0,tags="";
      if(sg&&sg.pick===id)tags+='<span class="dtag pick">Vorschlag</span>';else if(sg&&sg.tied.indexOf(id)>=0)tags+='<span class="dtag tie">gleichauf</span>';
      if(pss.indexOf(id)>=0)tags+='<span class="dtag pass">weitergegeben</span>';
      if(id===cur)tags+='<span class="dtag me">du</span>';
      return '<li><span class="dav'+(sg&&sg.pick===id?" sug":"")+'">'+initials(nm)+'</span><span class="dnm">'+esc(nm)+'</span><span class="dcnt">'+c+' Dienste '+curYear+'</span>'+tags+'</li>';
    }).join("");
    var appsBlock='<h4>Beworben ('+r.kann.length+')</h4>'+(r.kann.length?'<ul class="dapp">'+apps+'</ul>':'<div class="dempty">Noch niemand hat „kann“ markiert.</div>');
    var subBlock="";if(r.best){var bm=byId[r.best];subBlock='<h4>Vertretung</h4><div class="dsub"><span class="dav ok">'+initials(bm?bm.name:r.best)+'</span><span class="dnm">'+esc(bm?bm.name:r.best)+'</span>'+(r.bestAt?'<span class="dcnt">zugesagt am '+fmt(r.bestAt)+'</span>':"")+'</div>';}
    var tl=[];if(r.eintragVom)tl.push([r.eintragVom,"Eingetragen"]);if(r.bestAt&&r.best)tl.push([r.bestAt,"Zusage durch "+((byId[r.best]&&byId[r.best].name)||r.best)]);if(r.confirmNotifiedAt)tl.push([r.confirmNotifiedAt,"Ersteller benachrichtigt"]);if(r.remindedAt)tl.push([r.remindedAt,"Erinnerung verschickt"]);
    tl.sort(function(a,b){return a[0]<b[0]?-1:(a[0]>b[0]?1:0);});
    var tlBlock=tl.length?('<h4>Verlauf</h4><ul class="dtl">'+tl.map(function(x){return '<li><span class="dtd">'+fmt(x[0])+'</span>'+esc(x[1])+'</li>';}).join("")+'</ul>'):"";
    var body='<div class="wp-modal-b"><div class="dmeta">'+metaLine+'</div>'+appsBlock+subBlock+tlBlock+(isAdmin()?adminPanel(r):"")+'</div>';
    return '<div class="wp-modal-ov" data-modal-close="1"></div><div class="wp-modal" role="dialog" aria-modal="true"><button type="button" class="wp-modal-x" data-modal-close="1" aria-label="Schließen">×</button>'+head+body+'<div class="wp-modal-f">'+detailActions(r)+'</div></div>';
  }
  function myRequests(){return model.requests.filter(function(r){return isOwner(r);}).sort(function(a,b){return a.date<b.date?-1:1;});}function loeschen(id){var r=find(id);if(!r)return;var bnm=(r.best&&byId[r.best])?byId[r.best].name:r.best;if(!canDelete(r)){if(r.best){alert("Dieser Dienst ist definitiv zugesagt (Vertretung "+bnm+") und kann nicht geloescht werden. Zuerst freigeben.");}else{alert("Nur der Ersteller oder ein Admin kann dieses Gesuch loeschen.");}return;}var viaAdmin=isAdmin()&&(r.best||!isOwner(r));var q=r.best?("ACHTUNG: Dienst am "+fmt(r.date)+" ist zugesagt (Vertretung "+bnm+"). Als Admin wirklich loeschen?"):("Dienst am "+fmt(r.date)+(r.dienstVon?" (Dienst von "+r.dienstVon+")":"")+" wirklich loeschen?");if(!confirm(q))return;model.requests=model.requests.filter(function(x){return x.id!==id;});log(byId[cur].name+(viaAdmin?" (Admin)":"")+" loescht Dienst "+fmt(r.date)+(r.best?" [war zugesagt: "+bnm+"]":""));closeDetail();persist();render();}function myReqCard(r,counts){counts=counts||yearCounts(model,curYear);var st=statusOf(r,todayIso),hn=holiday(r.date),n=days(todayIso,r.date);var when=weekday(r.date)+" "+fmt(r.date);var off=r.kann.length;var __sg=suggestFor(r,byId,counts);var names=sortByLoad(r.kann,counts,__sg&&__sg.pick).map(function(id){return byId[id]?byId[id].name:id;});var earliest=null;{var ev=r.eintragVom||todayIso,dz=key(ad(d(r.date),-cwin()));earliest=(ev>dz?ev:dz);}var pill,info,cls;if(r.best){cls=" rec";pill='<span class="pill rec">zugesagt</span>';info="Vertretung: <b>"+(byId[r.best]?byId[r.best].name:r.best)+"</b>"+(r.bestAt?" (am "+fmt(r.bestAt)+")":"");}else if(r.date<todayIso){cls=" crit";pill='<span class="pill crit">ohne Vertretung</span>';info="Termin vorbei, keine Vertretung gefunden.";}else if(st==="kritisch"){cls=" crit";pill='<span class="pill crit">kritisch</span>';info="Noch keine Zusage, Termin in "+n+" Tagen.";}else{cls="";var ph=(days(todayIso,r.date)<=cwin())?"Zusagephase":"Sammelphase";pill='<span class="pill due">'+ph+'</span>';info="Noch keine Zusage, Pool kann sich melden.";}var tl=["Eintrag "+(r.eintragVom?fmt(r.eintragVom):"-")];if(!r.best&&r.date>=todayIso)tl.push("Zusage "+(earliest&&earliest>todayIso?("ab "+fmt(earliest)):"jetzt moeglich"));tl.push("Dienst "+fmt(r.date)+(r.date>=todayIso?(" (in "+n+" Tagen)"):""));var offline=("<b>"+off+"</b> Angebot"+(off===1?"":"e")+(off?": "+names.join(", "):""));var acts="";if(!r.best&&r.date>=todayIso)acts+='<button class="btn sm" data-act="pool" data-id="'+r.id+'">Pool erinnern</button>';if(!r.best)acts+='<button class="btn warn sm" data-act="del" data-id="'+r.id+'">zurückziehen</button>';return '<div class="icard'+cls+' clk" data-detail="'+r.id+'"><div><div class="t">'+pill+' '+when+(hn?" · "+hn:"")+'</div><div class="m">'+info+" · "+offline+'</div><div class="m">'+tl.join(" · ")+'</div></div><div class="iacts">'+acts+'</div></div>';}function renderMyReq(){var el=document.getElementById("myreq");if(!el)return;var mine=myRequests();var __mc=yearCounts(model,curYear);var body=mine.length?mine.map(function(r){return myReqCard(r,__mc);}).join(""):'<div class="empty">Du suchst aktuell keine Vertretung.</div>';el.innerHTML='<div class="card"><h2>Meine Vertretungsgesuche'+(mine.length?" ("+mine.length+")":"")+'</h2>'+body+'</div>';}var expYear=null;function expYears(){var ys={};model.requests.forEach(function(r){if(r.date)ys[r.date.slice(0,4)]=1;});var arr=Object.keys(ys).map(Number).sort(function(a,b){return b-a;});if(arr.indexOf(curYear)<0)arr.unshift(curYear);return arr;}function expData(year){return model.requests.filter(function(r){return r.date&&+r.date.slice(0,4)===year;}).sort(function(a,b){return a.date<b.date?-1:1;});}function expLabel(r){var st=statusOf(r,todayIso);var l=statusMeta(st)[2];if(st==="vergeben")l="zugesagt";return l;}function expStats(year){var data=expData(year);var bsm={};data.forEach(function(r){var l=expLabel(r);bsm[l]=(bsm[l]||0)+1;});var order=["zugesagt","Sammelphase","Zusagephase","kritisch","durchgerutscht","erledigt"];var byStatus=[];order.forEach(function(l){if(bsm[l])byStatus.push([l,bsm[l]]);});Object.keys(bsm).forEach(function(l){if(order.indexOf(l)<0)byStatus.push([l,bsm[l]]);});var uc={};data.forEach(function(r){if(r.best)uc[r.best]=(uc[r.best]||0)+1;});var byUser=model.members.map(function(m){return [m.name,uc[m.id]||0];}).sort(function(a,b){return b[1]-a[1]||a[0].localeCompare(b[0]);});return {total:data.length,byStatus:byStatus,byUser:byUser};}function statHtml(year){var s=expStats(year);var st=s.byStatus.map(function(x){return x[0]+": <b>"+x[1]+"</b>";}).join(" · ");var us=s.byUser.map(function(x){return "<li>"+x[0]+" — <b>"+x[1]+"</b></li>";}).join("");return '<div class="statbox"><h3>Statistik '+year+'</h3><div class="m">Gesamt: <b>'+s.total+'</b> Dienste</div><div class="m">'+st+'</div><div class="m" style="margin-top:6px">Ranking (zugesagte Dienste):</div><ol class="rank">'+us+'</ol></div>';}function exportRows(year){var rows=[["Jahr","Datum","Wochentag","KW","Feiertag","Dienst von","Status","Vertretung","Angebote","Interessenten"]];expData(year).forEach(function(r){var b=r.best?(byId[r.best]?byId[r.best].name:r.best):"";var names=sortByLoad(r.kann,yearCounts(model,year)).map(function(id){return byId[id]?byId[id].name:id;}).join(", ");rows.push([year,fmt(r.date),weekday(r.date),isoWeek(r.date),holiday(r.date)||"",r.dienstVon||"",expLabel(r),b,r.kann.length,names]);});var __s=expStats(year);rows.push([]);rows.push(["Statistik "+year]);rows.push(["Gesamt",__s.total]);__s.byStatus.forEach(function(x){rows.push(["Status: "+x[0],x[1]]);});rows.push([]);rows.push(["Ranking (zugesagte Dienste)"]);__s.byUser.forEach(function(x){rows.push([x[0],x[1]]);});return rows;}function csvCell(v){v=(v==null?"":String(v));return /[";\n\r]/.test(v)?('"'+v.replace(/"/g,'""')+'"'):v;}function downloadCsv(year){var rows=exportRows(year);var csv=rows.map(function(r){return r.map(csvCell).join(";");}).join("\r\n");var blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"});var url=URL.createObjectURL(blob);var a=document.createElement("a");a.href=url;a.download="vertretungspool_"+year+".csv";document.body.appendChild(a);a.click();document.body.removeChild(a);setTimeout(function(){URL.revokeObjectURL(url);},1500);}function renderExport(){var sel=document.getElementById("exp-year"),tb=document.getElementById("exp-table");if(!sel||!tb)return;var years=expYears();if(expYear==null||years.indexOf(expYear)<0)expYear=(years.indexOf(curYear)>=0?curYear:years[0]);sel.innerHTML=years.map(function(y){return '<option value="'+y+'"'+(y===expYear?" selected":"")+">"+y+"</option>";}).join("");var data=expData(expYear);if(!data.length){tb.innerHTML='<div class="empty">Keine Dienste im Jahr '+expYear+'.</div>';return;}var zug=data.filter(function(r){return r.best;}).length,offen=data.filter(function(r){return !r.best&&r.date>=todayIso;}).length,durch=data.filter(function(r){return !r.best&&r.date<todayIso;}).length;var kn=data.reduce(function(a,r){return a+((r.kann||[]).length);},0),kd=data.filter(function(r){return (r.kann||[]).length;}).length;var head='<tr><th>Datum</th><th>KW</th><th>Dienst von</th><th>Status</th><th>Vertretung</th><th>Angebote</th></tr>';var body=data.map(function(r){var st=statusOf(r,todayIso);var hn=holiday(r.date);var cls=(st==="durchgerutscht"||st==="kritisch")?"x-crit":(r.best?"x-ok":"");return '<tr class="'+cls+'"><td>'+weekday(r.date)+" "+fmt(r.date)+(hn?" · "+hn:"")+'</td><td>'+isoWeek(r.date)+'</td><td>'+(r.dienstVon||"—")+'</td><td>'+expLabel(r)+'</td><td>'+(r.best?(byId[r.best]?byId[r.best].name:r.best):"—")+'</td><td>'+r.kann.length+'</td></tr>';}).join("");tb.innerHTML='<div class="m" style="margin:4px 0 8px">'+data.length+" Dienste · "+zug+" zugesagt · "+offen+" offen · "+durch+" durchgerutscht · "+kn+" kann gesamt ("+kd+" Dienste mit Interesse)"+'</div><table class="exptbl">'+head+body+"</table>"+statHtml(expYear);}function feedEvent(type,r){var who=byId[cur]?byId[cur].name:cur;var dd=fmt(r.date);var txt=(type==="eintragen")?(who+" kann am "+dd+" vertreten."):(who+" sucht Vertretung am "+dd+".");log("[Feed] "+txt);try{requestActivityPing("Vertretungspool aktualisiert");}catch(e){log("Feed-Fehler: "+e);}}function renderA(counts){
    var fut=model.requests.filter(function(r){return r.date>=todayIso;}).sort(function(a,b){return a.date<b.date?-1:1;});
    var meine=[],vors=[],krit=[],mit=[],kann=[],beob=[];
    fut.forEach(function(r){
      if(r.best===cur){meine.push(r);return;}
      if(r.best)return;
      var s=suggestFor(r,byId,counts),st=statusOf(r,todayIso);
      if(st==="kritisch"){krit.push(r);return;}
      if(s&&s.pick===cur){vors.push(r);return;}
      if(s&&s.tied.indexOf(cur)>=0){mit.push(r);return;}
      if(r.kann.indexOf(cur)<0){kann.push(r);return;}
      beob.push(r);
    });
    var nothing=!meine.length&&!vors.length&&!krit.length&&!mit.length&&!kann.length;
    var html="";
    html+=section("Vorschlag für dich",vors,"vorschlag",counts,"Aktuell kein Vorschlag für dich.");
    html+=section("Kritisch — bald ohne Vertretung",krit,"kritisch",counts,"Nichts Kritisches.");if(mit.length)html+=section("Gleichauf — bitte abstimmen oder zusagen",mit,"mit",counts,"");
    html+=section("Bitte um dein „kann“",kann,"kann",counts,"Du hast alle offenen Gesuche gesehen.");
    html+=section("Deine bestätigten Dienste",meine,"meine",counts,"Du hast aktuell keine Dienste übernommen.");
    if(beob.length)html+=section("Du hast Interesse bekundet (wartet)",beob,"beob",counts,"");
    if(nothing)html='<div class="card"><div class="empty">Für '+byId[cur].name+' ist aktuell nichts zu tun. ✔</div></div>'+html;
    document.getElementById("view-a").innerHTML=html;
  }

  // ---- Render: Ansicht C (Liste) ----
  function statusMeta(st){return {sammeln:["--c-sammeln","b-sammeln","Sammelphase"],"vergabe-offen":["--c-vergabe","b-vergabe","Zusagephase"],kritisch:["--c-kritisch","b-kritisch","kritisch"],vergeben:["--c-vergeben","b-vergeben","vergeben"],erledigt:["--c-erledigt","b-erledigt","erledigt"],durchgerutscht:["--c-durch","b-kritisch","durchgerutscht - nicht vergeben"]}[st];}
  function actionsHtml(r,st){if(r.date<todayIso)return "";if(st==="vergeben"){return '<div class="acts">'+(r.best===cur?'<button class="btn warn sm" data-act="frei" data-id="'+r.id+'">freigeben</button><button class="btn sm" data-act="remind" data-id="'+r.id+'">'+(r.remindedAt?"erneut erinnern":"erinnern")+'</button>':'<button class="btn sm" data-act="ueb" data-id="'+r.id+'">zusagen (ersetzen)</button>')+'</div>';}var has=r.kann.indexOf(cur)>=0;return '<div class="acts"><button class="btn sm'+(has?" on":"")+'" data-act="kann" data-id="'+r.id+'">'+(has?"✓ kann":"+ kann")+'</button>'+(days(todayIso,r.date)<=cwin()?'<button class="btn prim sm" data-act="ueb" data-id="'+r.id+'">zusagen</button>':'<span class="muted">Zusage ab '+fmt(key(ad(d(r.date),-cwin())))+'</span>')+'</div>';}
  function rowHtml(r,counts){var st=statusOf(r,todayIso),meta=statusMeta(st),hn=holiday(r.date),sug=suggestFor(r,byId,counts);var badge=meta[2];if(st==="vergeben"&&r.best)badge="Vertretung: "+(byId[r.best]?byId[r.best].name:r.best);else if(sug&&(st==="vergabe-offen"||st==="kritisch"||st==="sammeln"))badge=meta[2]+" · Vorschlag: "+sugText(sug);var cd="";if(r.date>=todayIso){var n=days(todayIso,r.date);cd=n===0?"heute":(n===1?"morgen":"in "+n+" Tagen");}var ml="Dienst von "+(r.dienstVon||"—")+(r.eintragVom?" · Eintrag "+fmt(r.eintragVom):"")+(cd?" · "+cd:"");if(sug&&st!=="vergeben"){if(sug.pick===cur)ml+=' · <span class="dran">du bist vorgeschlagen</span>';else if(sug.tied.indexOf(cur)>=0)ml+=' · <span class="dran">du bist gleichauf</span>';}var __ks=sortByLoad(r.kann,counts,sug&&sug.pick);var chips=__ks.map(function(id,i){var m=byId[id];return '<span class="av'+(sug&&id===sug.pick?" sug":"")+'" style="z-index:'+(__ks.length-i)+'" title="'+(m?m.name:id)+'">'+initials(m?m.name:id)+'</span>';}).join("");if(!r.kann.length)chips='<span class="em">niemand</span>';return '<div class="row clk" data-detail="'+r.id+'"><div class="rail" style="background:var('+meta[0]+')"></div><div class="rbody"><div class="rleft"><div class="dline">'+weekday(r.date)+" "+fmt(r.date)+'<span class="kw">KW'+isoWeek(r.date)+'</span>'+(hn?'<span class="feier">'+hn+'</span>':'')+'</div><div><span class="badge '+meta[1]+'">'+badge+'</span></div><div class="meta">'+ml+'</div></div><div class="rright"><div class="avs">'+chips+'</div>'+actionsHtml(r,st)+'</div></div></div>';}
  function grouped(list,counts){var out="",c=null;list.forEach(function(r){var ml=MON[+r.date.slice(5,7)-1]+" "+r.date.slice(0,4);if(ml!==c){c=ml;out+='<div class="month">'+ml+'</div>';}out+=rowHtml(r,counts);});return out||'<div class="em">keine Termine</div>';}
  function renderC(counts){var fut=model.requests.filter(function(r){return r.date>=todayIso;}).sort(function(a,b){return a.date<b.date?-1:1;});var past=model.requests.filter(function(r){return r.date<todayIso;}).sort(function(a,b){return a.date<b.date?1:-1;});document.getElementById("future").innerHTML=grouped(fut,counts);document.getElementById("past").innerHTML=grouped(past,counts);var durch=past.filter(function(r){return !r.best;}).length;document.querySelector("#pastwrap summary").innerHTML="Vergangene Termine anzeigen ("+past.length+")"+(durch?' — <span style="color:var(--danger)">'+durch+' durchgerutscht</span>':"");}

  function render(){
    var counts=yearCounts(model,curYear);
    var __w=document.getElementById("who");if(IS_CONF){__w.innerHTML="<option>"+(curName||cur)+"</option>";__w.disabled=true;}else{__w.innerHTML=model.members.slice().sort(function(a,b){return a.order-b.order;}).map(function(m){return '<option value="'+m.id+'"'+(m.id===cur?' selected':'')+'>'+m.name+'</option>';}).join("");}
    var __ga=isAdmin();var __rb=document.getElementById("resetbtn");if(__rb)__rb.style.display=__ga?"":"none";var __sb=document.getElementById("selftestbtn");if(__sb)__sb.style.display=__ga?"":"none";var __sc=document.getElementById("selftest2card");if(__sc)__sc.style.display=__ga?"":"none";var __cb=document.getElementById("cleanbtn");if(__cb)__cb.style.display=__ga?"":"none";var __dc=document.getElementById("dscard");if(__dc)__dc.style.display=(__ga&&IS_CONF)?"":"none";var __g1=document.getElementById("g-adm-ein");if(__g1)__g1.style.display=__ga?"":"none";var __g2=document.getElementById("g-adm-best");if(__g2)__g2.style.display=__ga?"":"none";
    var minc=Math.min.apply(null,model.members.map(function(m){return counts[m.id]||0;}));
    document.getElementById("counts").innerHTML=model.members.slice().sort(function(a,b){return a.order-b.order;}).map(function(m){var c=counts[m.id]||0;return '<span class="chip'+(c===minc?" lo":"")+(m.id===cur?" me":"")+'"><b>'+m.name+'</b><span class="n">'+c+'</span></span>';}).join("");
    renderMyReq();renderExport();renderA(counts);renderC(counts);
    document.getElementById("view-a").style.display=view==="a"?"block":"none";
    document.getElementById("view-c").style.display=view==="c"?"block":"none";
    document.getElementById("tab-a").classList.toggle("act",view==="a");
    document.getElementById("tab-c").classList.toggle("act",view==="c");
    document.getElementById("log").innerHTML=act.length?act.map(function(a){return '<div'+(a.o?' class="ov"':'')+'><span class="t">'+a.t+'</span>  '+a.m+'</div>';}).join(""):'<span class="em">noch keine Aktivität</span>';
    if(detailId!=null)renderDetail();
    renderStatus();
    selftest();
  }
  function selftest(){if(!SEED||IS_CONF){var dg=document.getElementById("diag");if(dg)dg.innerHTML='<span class="em">Selbsttest nur im lokalen Modus.</span>';return;}var lines=[];function chk(l,c){lines.push('<div class="'+(c?'pass':'fail')+'">'+(c?'✓':'✗')+' '+l+'</div>');}var s0=SEED;var exp={anika:1,brigitte:2,christiane:1,christine:1,christoph:1,daniel:3,fabienne:2,ines:2,johanna:3,konstantin:2,leo:2};var c26=yearCounts(s0,2026),cOk=Object.keys(exp).every(function(k){return c26[k]===exp[k];});Object.keys(c26).forEach(function(k){if(!(k in exp)&&c26[k]!==0)cOk=false;});chk("Engine: Jahres-Zähler 2026 == Excel (Seed)",cOk);var fx={a:{id:"a",order:0,name:"A"},b:{id:"b",order:1,name:"B"}};var bI=byId;byId=fx;var s1=suggestFor({id:"x1",best:null,kann:["a","b"]},fx,{a:2,b:0});var s2=suggestFor({id:"x2",best:null,kann:["a","b"]},fx,{a:1,b:1});var s2b=suggestFor({id:"x2",best:null,kann:["a","b"]},fx,{a:1,b:1});var dist={a:0,b:0};for(var ii=0;ii<200;ii++){dist[suggestFor({id:"q"+ii,best:null,kann:["a","b"]},fx,{a:1,b:1}).pick]++;}byId=bI;chk("Vorschlag: nur Gleichauf-Minimum",s1.tied.length===1&&s1.pick==="b"&&s2.tied.length===2);chk("Vorschlag stabil je Termin",s2.pick===s2b.pick);chk("Vorschlag fair verteilt (a:"+dist.a+" b:"+dist.b+")",dist.a>40&&dist.b>40);chk("Live: höchstens eine gültige Vertretung",model.requests.every(function(r){return r.best===null||!!byId[r.best];}));var dueLeft=model.requests.filter(function(r){return r.best&&r.date>=todayIso&&!r.remindedAt&&days(todayIso,r.date)<=lead();}).length;chk("Erinnerung: keine fälligen offen (opportunistisch verschickt)",dueLeft===0);var b=JSON.stringify(model);storage.save(model);chk("Live: save()/load()-Roundtrip verlustfrei",b===JSON.stringify(storage.load()));document.getElementById("diag").innerHTML=lines.join("");}

  /* ---- Admin: Datenstaende anzeigen + aelteren Stand als NEUE Generation wiederherstellen ---- */
  function showDataStatesCard(){var c=document.getElementById("dscard");if(!c||!IS_CONF||!isAdmin())return;c.style.display="";var b=document.getElementById("dsload");if(b&&!b.__wired){b.__wired=true;b.addEventListener("click",renderDataStates);}}
  function renderDataStates(){
    var host=document.getElementById("dslist");if(!host||!storage||!storage.describe)return;
    if(!isAdmin()){host.textContent="Nur f\u00fcr Administrator:innen.";return;}
    host.textContent="Lese Datenst\u00e4nde \u2026";
    storage.describe().then(function(d){
      var rows=d.rows||[];
      if(!rows.length){host.innerHTML='<div class="em">Keine Datenst\u00e4nde gefunden.</div>';return;}
      var h='<div class="muted">Manifest: '+esc(d.manifest.key)+' \u00b7 Generation '+esc(d.manifest.gen)+'</div><table class="dstbl"><tr><th>Generation</th><th>Format</th><th>Eintr\u00e4ge</th><th>Lesbar</th><th></th></tr>';
      rows.forEach(function(r,i){
        h+='<tr class="'+(r.current?"cur":"")+(r.ok?"":" bad")+'"><td>'+r.gen+(r.current?" (aktuell)":"")+'</td><td>'+(r.layout==="legacy"?"alt (v2)":"neu")+'</td><td>'+(r.ok?r.entries:"\u2013")+'</td><td>'+(r.ok?"ja":"nein"+(r.error?": "+esc(r.error):""))+'</td><td>'+((r.ok&&!r.current)?'<button type="button" class="btn sm" data-ds="'+i+'">Wiederherstellen</button>':"")+'</td></tr>';
      });
      host.innerHTML=h+'</table>';
      var bs=host.querySelectorAll("button[data-ds]");
      for(var j=0;j<bs.length;j++){bs[j].onclick=function(){restoreDataState(rows[+this.getAttribute("data-ds")]);};}
    }).catch(function(e){host.innerHTML='<div class="fail">Datenst\u00e4nde nicht lesbar: '+esc(e.message||String(e))+'</div>';});
  }
  function restoreDataState(row){
    if(!row||!isAdmin())return;
    if(!confirm("Datenstand Generation "+row.gen+" ("+row.entries+" Eintr\u00e4ge) als neuen aktuellen Stand \u00fcbernehmen?\nSp\u00e4tere \u00c4nderungen sind danach nicht mehr aktuell (bleiben aber als Historie erhalten)."+(_dirty?"\nAchtung: deine noch nicht gespeicherten \u00c4nderungen werden verworfen.":"")))return;
    if(_saveTimer){clearTimeout(_saveTimer);_saveTimer=null;}_dirty=false;
    storage.restore(row).then(function(r){
      if(!r||!r.ok)throw new Error((r&&r.error)||"Wiederherstellung fehlgeschlagen");
      _loadError=null;_saveError=null;
      return reloadModel().then(function(){
        if(!model)return;log(byId[cur].name+" (Admin) stellt Datenstand Generation "+row.gen+" wieder her (neu: "+r.gen+")");
        if(typeof start==="function"&&!_started){start();}else{render();}
        renderDataStates();
      });
    }).catch(function(e){onSaveErr(e);});
  }

  // ---- Events ----
  function selftest2(){
  var out=document.getElementById("selftest2"); if(!out){return;}
  function E(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
  var R=[]; function A(g,n,c){R.push({g:g,n:n,ok:!!c});}
  var _model=model,_cur=cur,_byId=byId,_today=todayIso,_storage=storage,_persist=persist;
  var _confirm=window.confirm,_alert=window.alert; var _ls=null;try{_ls=window.localStorage?window.localStorage.getItem(SKEY):null;}catch(e0){}
  var _su=(typeof shareUsers!=="undefined")?shareUsers:null,_sg=(typeof shareGroup!=="undefined")?shareGroup:null,_pf=(typeof requestActivityPing!=="undefined")?requestActivityPing:null,_sh=(typeof share!=="undefined")?share:null;
  var _isAdmin=isAdmin;
  var realBefore=JSON.stringify(_model); var saves=0,sends=0;
  try{
    persist=function(){saves++;};
    storage={name:"test",load:function(){return model;},save:function(){saves++;return Promise.resolve();},reset:function(){return Promise.resolve();}};
    window.confirm=function(){return true;}; window.alert=function(){};
    if(_su){shareUsers=function(){sends++;return Promise.resolve();};}
    if(_sg){shareGroup=function(){sends++;return Promise.resolve();};}
    if(_pf){requestActivityPing=function(){sends++;};}
    if(_sh){share=function(){sends++;return Promise.resolve();};}
    var FT="2026-06-15"; function dd(n){return key(ad(d(FT),n));}
    function mk(id,date,o){o=o||{};return {id:id,date:date,dienstVon:o.dv||"",dienstVonUser:o.dvu||null,eintragVom:o.ein||FT,kann:o.kann||[],best:o.best||null,passed:o.passed||[],remindedAt:null,confirmNotifiedAt:null,bestAt:o.bestAt||null};}
    var members=[{id:"t1",name:"Carsten Test",order:0,username:"u_t1"},{id:"t2",name:"Test B",order:1,username:"u_t2"},{id:"t3",name:"Test C",order:2,username:"u_t3"},{id:"t4",name:"Test D",order:3,username:"u_t4"},{id:"t5",name:"Test E",order:4,username:"u_t5"}];
    var reqs=[
      mk("r_samm",dd(40),{dvu:"t1",dv:"Carsten Test",kann:["t3"]}),
      mk("r_zus",dd(14),{kann:["t3","t2"]}),
      mk("r_krit",dd(5),{kann:["t3"]}),
      mk("r_durch",dd(-30),{dvu:"t1",dv:"Carsten Test",kann:["t2"]}),
      mk("r_erl",dd(-60),{kann:["t2"],best:"t2",bestAt:dd(-65)}),
      mk("r_verg",dd(10),{kann:["t2"],best:"t2",bestAt:FT}),
      mk("r_gl",dd(18),{kann:["t3","t4"]}),
      mk("r_pass",dd(12),{kann:["t3","t4"],passed:["t3"]}),
      mk("r_c2a",dd(-90),{best:"t2",bestAt:dd(-95)}),
      mk("r_c5",dd(-100),{best:"t5",bestAt:dd(-105)}),
      mk("r_own2",dd(25),{dvu:"u_t1",dv:"Carsten Test"}),
      mk("r_own3",dd(26),{dv:"Carsten Test"})
    ];
    model={version:2,config:{reminderLeadDays:3},members:members,requests:reqs};
    byId={}; members.forEach(function(m){byId[m.id]=m;}); cur="t1"; todayIso=FT; isAdmin=function(){return false;};
    var yr=+FT.slice(0,4); var counts=yearCounts(model,yr);
    A("Unit","cwin Standard 21",cwin()===21);
    A("Unit","confirmAllowed 22 Tage gesperrt",confirmAllowed({date:dd(22)})===false);
    A("Unit","confirmAllowed 21 Tage erlaubt",confirmAllowed({date:dd(21)})===true);
    A("Unit","confirmAllowed 7 Tage erlaubt",confirmAllowed({date:dd(7)})===true);
    A("Unit","statusOf Sammelphase",statusOf(find("r_samm"),FT)==="sammeln");
    A("Unit","statusOf Zusagephase",statusOf(find("r_zus"),FT)==="vergabe-offen");
    A("Unit","statusOf kritisch",statusOf(find("r_krit"),FT)==="kritisch");
    A("Unit","statusOf durchgerutscht",statusOf(find("r_durch"),FT)==="durchgerutscht");
    A("Unit","statusOf erledigt",statusOf(find("r_erl"),FT)==="erledigt");
    A("Unit","statusOf vergeben",statusOf(find("r_verg"),FT)==="vergeben");
    A("Unit","statusOf ignoriert Eintragsdatum (alt+fern=Sammelphase)",statusOf({date:dd(40),eintragVom:dd(-200),best:null},FT)==="sammeln");
    A("Unit","statusOf ignoriert Eintragsdatum (alt+nah=Zusagephase)",statusOf({date:dd(14),eintragVom:dd(-200),best:null},FT)==="vergabe-offen");
    A("Unit","yearCounts t2=3",counts.t2===3);
    A("Unit","yearCounts t3=0",(counts.t3||0)===0);
    A("Unit","suggestFor wenigste -> t3",(suggestFor(find("r_zus"),byId,counts)||{}).pick==="t3");
    A("Unit","suggestFor passed ausgeschlossen -> t4",(suggestFor(find("r_pass"),byId,counts)||{}).pick==="t4");
    var sa=suggestFor(find("r_gl"),byId,counts),sb=suggestFor(find("r_gl"),byId,counts);
    A("Unit","suggestFor stabil bei Gleichstand",!!sa&&!!sb&&sa.pick===sb.pick&&sa.tied.length===2);
    A("Unit","Export zaehlt zugesagt",expData(yr).filter(function(r){return r.best;}).length>=2);
    A("Unit","sortByLoad aufsteigend nach Diensten",(function(){var x=sortByLoad(["t2","t3"],{t2:5,t3:1});return x[0]==="t3"&&x[1]==="t2";})());
    A("Unit","sortByLoad Tiebreak nach Name",(function(){var x=sortByLoad(["t4","t3"],{t3:2,t4:2});return x[0]==="t3"&&x[1]==="t4";})());
    A("Unit","sortByLoad Vorschlag vor Name (gleiche Last)",(function(){var x=sortByLoad(["t3","t4"],{t3:2,t4:2},"t4");return x[0]==="t4"&&x[1]==="t3";})());
    A("Unit","sortByLoad Last schlaegt Vorschlag",(function(){var x=sortByLoad(["t3","t4"],{t3:0,t4:5},"t4");return x[0]==="t3";})());
    A("Unit","sortByLoad ohne pick unveraendert",(function(){var x=sortByLoad(["t4","t3"],{t3:2,t4:2},null);return x[0]==="t3";})());
    A("Unit","sortByLoad mutiert Original nicht",(function(){var o=["t2","t3"];sortByLoad(o,{t2:9,t3:0});return o[0]==="t2";})());
    A("Unit","isOwner via Member-ID",isOwner(find("r_samm"))===true);
    A("Unit","isOwner via Username (Altdaten)",isOwner(find("r_own2"))===true);
    A("Unit","isOwner via Namensfallback",isOwner(find("r_own3"))===true);
    A("Unit","isOwner false bei fremdem Gesuch",isOwner(find("r_zus"))===false);
    A("Unit","myRequests findet alle eigenen Gesuche",myRequests().length===4);
    toggleKann("r_krit"); A("Integration","toggleKann setzt kann",find("r_krit").kann.indexOf("t1")>=0);
    toggleKann("r_krit"); A("Integration","toggleKann entfernt kann",find("r_krit").kann.indexOf("t1")<0);
    pass("r_gl"); A("Integration","pass markiert",(find("r_gl").passed||[]).indexOf("t1")>=0);
    toggleKann("r_gl"); A("Integration","kann setzen loescht eigenen pass",(find("r_gl").passed||[]).indexOf("t1")<0);
    uebernehmen("r_zus"); A("Integration","zusagen setzt best",find("r_zus").best==="t1"); A("Integration","zusagen setzt bestAt",!!find("r_zus").bestAt);
    A("Integration","zusagen traegt automatisch kann ein",find("r_zus").kann.indexOf("t1")>=0);
    A("Integration","zusagen erzeugt kein Duplikat in kann",(function(){var k=find("r_zus").kann,n=0,i;for(i=0;i<k.length;i++){if(k[i]==="t1")n++;}return n===1;})());
    (function(){var r=find("r_pass");r.passed=["t1"];r.kann=["t3","t4"];uebernehmen("r_pass");A("Integration","zusagen hebt eigenes weitergegeben auf",(r.passed||[]).indexOf("t1")<0&&r.kann.indexOf("t1")>=0);r.best=null;r.bestAt=null;r.kann=["t3","t4"];r.passed=["t3"];})();
    freigeben("r_zus"); A("Integration","freigeben entfernt best",!find("r_zus").best);
    var bb=find("r_samm").best; uebernehmen("r_samm"); A("Integration","Frist-Sperre ausserhalb 3 Wochen",find("r_samm").best===bb);
    var n0=model.requests.length; loeschen("r_verg"); A("Integration","loeschen-Guard zugesagt bleibt (Nicht-Admin)",model.requests.length===n0&&!!find("r_verg"));
    loeschen("r_krit"); A("Integration","Nicht-Ersteller kann fremden offenen Dienst nicht loeschen",!!find("r_krit"));
    loeschen("r_durch"); A("Integration","Ersteller loescht eigenen offenen Dienst",!find("r_durch"));
    var had=find("r_krit").kann.indexOf("t1")>=0;
    var btn=document.createElement("button"); btn.setAttribute("data-act","kann"); btn.setAttribute("data-id","r_krit"); btn.style.display="none"; document.body.appendChild(btn);
    var ev2; try{ev2=new MouseEvent("click",{bubbles:true});}catch(_e){ev2=document.createEvent("Event");ev2.initEvent("click",true,true);}
    btn.dispatchEvent(ev2);
    A("Integration","echter Klick (Delegation) wirkt",(find("r_krit").kann.indexOf("t1")>=0)!==had);
    document.body.removeChild(btn);
    // ---- Admin-Rechte ----
    isAdmin=function(){return true;};
    freigeben("r_verg"); A("Integration","Admin gibt fremde Zusage frei",!find("r_verg").best);
    admKann("r_verg","t3"); A("Integration","Admin fuegt Bewerber hinzu",find("r_verg").kann.indexOf("t3")>=0);
    admKann("r_verg","t3"); A("Integration","Admin entfernt Bewerber",find("r_verg").kann.indexOf("t3")<0);
    var _sel=document.createElement("select"); _sel.id="wp-adm-best"; ["","t2","t3"].forEach(function(v){var o=document.createElement("option");o.value=v;_sel.appendChild(o);}); _sel.value="t3"; document.body.appendChild(_sel);
    admBest("r_verg"); A("Integration","Admin setzt Vertretung (Select)",find("r_verg").best==="t3"&&find("r_verg").kann.indexOf("t3")>=0);
    _sel.value=""; admBest("r_verg"); A("Integration","Admin entfernt Vertretung (Select)",!find("r_verg").best);
    if(_sel.parentNode)_sel.parentNode.removeChild(_sel);
    loeschen("r_krit"); A("Integration","Admin loescht fremden offenen Dienst",!find("r_krit"));
    find("r_verg").best="t2"; find("r_verg").bestAt=FT; var _nA=model.requests.length; loeschen("r_verg"); A("Integration","Admin loescht zugesagten Dienst",model.requests.length===_nA-1&&!find("r_verg"));
    // ---- Rueckwirkender Eintrag (Admin) ----
    var gd=document.getElementById("g-date"),gn=document.getElementById("g-name"),ge=document.getElementById("g-ein"),gb=document.getElementById("g-best"),gh=document.getElementById("g-hint");
    if(gd&&gn&&ge&&gb&&gh){
      var _gbHtml=gb.innerHTML;
      gb.innerHTML='<option value=""></option><option value="t2">B</option>';
      gd.value=dd(-45); gn.value="Extern X"; ge.value=dd(-50); gb.value="t2";
      var _cB=yearCounts(model,yr).t2||0;
      anlegen();
      var nrq=model.requests.filter(function(x){return x.date===dd(-45)&&x.dienstVon==="Extern X";})[0];
      A("Integration","Admin legt rueckwirkenden Dienst an",!!nrq);
      A("Integration","rueckwirkend: Vertretung + kann gesetzt",!!nrq&&nrq.best==="t2"&&nrq.kann.indexOf("t2")>=0);
      A("Integration","rueckwirkend: Eintragsdatum uebernommen",!!nrq&&nrq.eintragVom===dd(-50));
      A("Integration","rueckwirkend: bestAt = Eintragsdatum",!!nrq&&nrq.bestAt===dd(-50));
      A("Integration","rueckwirkend: Jahres-Zaehler +1",(yearCounts(model,yr).t2||0)===_cB+1);
      A("Integration","rueckwirkend: Status erledigt",!!nrq&&statusOf(nrq,FT)==="erledigt");
      gb.innerHTML=_gbHtml; gd.value=""; gn.value=""; ge.value=""; gh.textContent="";
    }
    // ---- Eintragsdatum im Admin-Dialog ----
    var _hd=document.createElement("div");
    _hd.innerHTML='<input type="date" id="wp-adm-date" value="'+find("r_samm").date+'"><input type="text" id="wp-adm-dv" value="'+(find("r_samm").dienstVon||"")+'"><input type="date" id="wp-adm-ein" value="'+dd(-7)+'">';
    document.body.appendChild(_hd);
    admHead("r_samm");
    A("Integration","Admin aendert Eintragsdatum im Dialog",find("r_samm").eintragVom===dd(-7));
    document.body.removeChild(_hd);
    isAdmin=function(){return false;};
    // ---- Sortierung im Markup (wenigste Dienste zuerst) ----
    var _sr={id:"zz",date:dd(30),dienstVon:"X",eintragVom:FT,kann:["t2","t3"],best:null,passed:[]};
    var _rh=rowHtml(_sr,{t2:9,t3:0});
    A("Integration","Liste: kann-Kuerzel nach Last sortiert",_rh.indexOf('title="Test C"')>=0&&_rh.indexOf('title="Test C"')<_rh.indexOf('title="Test B"'));
    A("Integration","Liste: linker Chip liegt oben (z-index absteigend)",(function(){var z=(_rh.match(/z-index:(\d+)/g)||[]).map(function(x){return parseInt(x.split(":")[1],10);});if(z.length<2)return false;for(var i=1;i<z.length;i++){if(z[i]>=z[i-1])return false;}return true;})());
    var _dh=detailHtml(_sr);
    A("Integration","Dialog: Beworbene nach Last sortiert",_dh.indexOf("Test C")>=0&&_dh.indexOf("Test C")<_dh.indexOf("Test B"));
    var _tie={id:"zt",date:dd(30),dienstVon:"X",eintragVom:FT,kann:["t2","t3","t4"],best:null,passed:[]};
    var _tc={t2:0,t3:0,t4:0};var _tsg=suggestFor(_tie,byId,_tc);
    A("Integration","Gleichstand: Vorschlag steht vorn",!!_tsg&&sortByLoad(_tie.kann,_tc,_tsg.pick)[0]===_tsg.pick);
    var _trh=rowHtml(_tie,_tc);
    A("Integration","Liste: Vorschlag-Chip ist der linke (hoechster z-index)",(function(){var m=_trh.match(/<span class="av[^"]*"[^>]*title="([^"]*)"/);var nm=(byId[_tsg.pick]||{}).name;return !!m&&m[1]===nm&&_trh.indexOf("sug")>=0;})());
    var _tdh=detailHtml(_tie);
    A("Integration","Dialog: Vorschlag steht oben in der Liste",(function(){var dc=yearCounts(model,curYear),dsg=suggestFor(_tie,byId,dc);if(!dsg)return false;var nm=byId[dsg.pick].name,p=_tdh.indexOf(nm);if(p<0)return false;return _tie.kann.filter(function(x){return x!==dsg.pick;}).every(function(x){return _tdh.indexOf(byId[x].name)>p;});})());
    var _mh=myReqCard(_sr,{t2:9,t3:0});
    A("Integration","Meine Gesuche: Angebote nach Last sortiert",_mh.indexOf("Test C")>=0&&_mh.indexOf("Test C")<_mh.indexOf("Test B"));
    var ch1=upgradeData({requests:[1,2]});
    var dmig={version:1,foo:7,requests:[9]}; var ch2=upgradeData(dmig);
    var dkeep={version:2}; var ch3=upgradeData(dkeep);
    A("Persistenz","upgradeData stempelt fehlende Version",ch1===true);
    A("Persistenz","upgradeData migriert v1->2 ohne Datenverlust",ch2===true&&dmig.version===2&&dmig.foo===7&&dmig.requests.length===1);
    A("Persistenz","upgradeData laesst v2 unveraendert",ch3===false&&dkeep.version===2);
    try{ if(window.localStorage){ var stx=makeStorage({version:2,config:{},members:[],requests:[]});
      window.localStorage.setItem(SKEY,JSON.stringify({version:1,marker:"alt",members:[],requests:[]})); var g1=stx.load();
      A("Persistenz","load verwirft veraltete Version (reseed v2)",!!g1&&g1.version===2&&g1.marker!=="alt");
      window.localStorage.setItem(SKEY,JSON.stringify({version:2,marker:"neu",members:[],requests:[]})); var g2=stx.load();
      A("Persistenz","load behaelt aktuelle Version",!!g2&&g2.marker==="neu");
      var sB={version:999,config:{},members:[{id:"x",name:"X",order:0,username:"x"}],requests:[{id:"q",date:"2026-01-01",best:"x",kann:["x"],passed:[]}]};
      var stb=makeStorage(sB); window.localStorage.setItem(SKEY,JSON.stringify({version:1,requests:[{id:"q",date:"2026-01-01",best:null,kann:[]}]})); var gB=stb.load();
      A("Persistenz","reseed stellt best wieder her",!!gB&&gB.requests&&gB.requests[0]&&gB.requests[0].best==="x");
      var wrote=null;try{wrote=JSON.parse(window.localStorage.getItem(SKEY));}catch(ew){}
      A("Persistenz","reseed schreibt frischen Stand zurueck",!!wrote&&wrote.version===999&&wrote.requests[0].best==="x");
    } else { A("Persistenz","localStorage nicht verfuegbar (uebersprungen)",true); } }catch(ep){ A("Persistenz","Persistenz-Test ohne Ausnahme",false); }
    // ---- Konflikt-Replay (Baustein 2) ----
    var rBase={version:2,config:{x:1},requests:[{id:"a",kann:["u1"],best:null},{id:"b",kann:[],best:null}]};
    var rLocal=JSON.parse(JSON.stringify(rBase));rLocal.requests[0].kann=["u1","me"];rLocal.requests.push({id:"c",kann:["me"],best:null});rLocal.requests=rLocal.requests.filter(function(x){return x.id!=="b";});
    var rFreshJson=JSON.stringify((function(){var f=JSON.parse(JSON.stringify(rBase));f.requests[0].best="other";f.requests.push({id:"d",kann:["x"],best:null});return f;})());
    var rM1=buildReplay(rBase,rLocal)(JSON.parse(rFreshJson));
    var rM2=buildReplay(rBase,rLocal)(JSON.parse(rFreshJson));
    var gA=rM1.requests.filter(function(x){return x.id==="a";})[0];
    A("Integration","Replay setzt eigenes Feld (kann)",!!gA&&gA.kann.length===2&&gA.kann.indexOf("me")>=0);
    A("Integration","Replay bewahrt fremdes Feld (best)",!!gA&&gA.best==="other");
    A("Integration","Replay uebernimmt eigenen Add (c)",rM1.requests.some(function(x){return x.id==="c";}));
    A("Integration","Replay bewahrt fremden Add (d)",rM1.requests.some(function(x){return x.id==="d";}));
    A("Integration","Replay wendet eigenen Remove an (b weg)",!rM1.requests.some(function(x){return x.id==="b";}));
    A("Integration","Replay idempotent (2x identisch)",JSON.stringify(rM1)===JSON.stringify(rM2));
    // ---- Activity-Marker (Sprint 2b, reine Funktion nextBody) ----
    var mb0="<p>Plan</p>";
    var mb1=nextBody(mb0);
    A("Integration","Marker wird beim ersten Bump angehaengt",mb1.indexOf("<p>Plan</p>")===0&&/wp-feed-1<\/ac:parameter>/.test(mb1));
    var mb2=nextBody(mb1);
    A("Integration","Marker zaehlt hoch auf 2",/wp-feed-2<\/ac:parameter>/.test(mb2)&&!/wp-feed-1\b/.test(mb2));
    A("Integration","Genau 1 Marker nach zweitem Bump",(mb2.match(/wp-feed-\d+/g)||[]).length===1);
    var mbN=mb1.replace('<ac:structured-macro ac:name="anchor">','<ac:structured-macro ac:macro-id="abc-123" ac:name="anchor" ac:schema-version="1">');
    var mb3=nextBody(mbN);
    A("Integration","Marker auch nach Body-Normalisierung ersetzt",(mb3.match(/wp-feed-\d+/g)||[]).length===1&&/wp-feed-2<\/ac:parameter>/.test(mb3));
  }catch(e){ R.push({g:"Sicherheit",n:"Testlauf-Ausnahme: "+(e&&e.message?e.message:e),ok:false}); }
  finally{
    persist=_persist; storage=_storage; model=_model; cur=_cur; byId=_byId; todayIso=_today; isAdmin=_isAdmin;
    window.confirm=_confirm; window.alert=_alert;
    if(_su){shareUsers=_su;} if(_sg){shareGroup=_sg;} if(_pf){requestActivityPing=_pf;} if(_sh){share=_sh;} try{if(window.localStorage){if(_ls===null){window.localStorage.removeItem(SKEY);}else{window.localStorage.setItem(SKEY,_ls);}}}catch(e4){}
  }
  A("Sicherheit","echtes Modell unveraendert",JSON.stringify(model)===realBefore);
  A("Sicherheit","Stubs aktiv (abgefangen: "+saves+"x Speichern, "+sends+"x Senden)",true);
  try{render();}catch(e3){}
  var groups=["Unit","Integration","Persistenz","Sicherheit"]; var html=""; var allok=true;
  for(var gi=0;gi<groups.length;gi++){var g=groups[gi];var it=R.filter(function(x){return x.g===g;});if(!it.length){continue;}var p=it.filter(function(x){return x.ok;}).length;if(p<it.length){allok=false;}html+='<div style="margin-top:8px;font-weight:700">'+g+' ('+p+'/'+it.length+')</div>';for(var j=0;j<it.length;j++){html+='<div style="color:'+(it[j].ok?"#216e4e":"#ae2a19")+'">'+(it[j].ok?"\u2713":"\u2717")+' '+E(it[j].n)+'</div>';}}
  html='<div style="font-weight:700;color:'+(allok?"#216e4e":"#ae2a19")+'">'+(allok?"Alle Tests gruen":"Rote Tests vorhanden")+'</div>'+html;
  out.innerHTML=html;
}
  function boot(){try{injectStyle();buildShell();}catch(e){showError(e);return;}if(IS_CONF){loadConfluence().then(function(idr){__members=idr.members;cur=idr.cur;curName=idr.curName;byId={};__members.forEach(function(m){byId[m.id]=m;});storage=PropertyStore();return storage.load().then(null,function(e){_loadError=e;throw e;});}).then(function(data){
      // Daten vorhanden (neues Format, Altformat wpstore v2 oder Alt-Anhang): NICHT beim Laden speichern;
      // Migration ins neue Format passiert beim ersten echten Speichern (Versionsstempel inklusive).
      if(data){if(!data.members||!data.members.length)data.members=__members;upgradeData(data);return data;}
      // Nur wenn sicher KEINE Daten existieren (kein Manifest, kein Alt-Anhang): Erst-Import aus seed.json.
      // save() ueberschreibt dabei nie Daten, die ein anderer Tab inzwischen angelegt hat.
      return getSeed().then(function(sd){SEED=sd;var m=remapSeed(sd,__members);if(__importDiag){showInfo(__importDiag);}return storage.save(m);});
    }).then(function(data){model=data;model.members=__members;byId={};__members.forEach(function(m){byId[m.id]=m;});start();}).catch(function(e){
      if(window.console)console.error("[WP] Ladefehler",e);
      if(storage&&byId[cur]){_loadError=_loadError||e;renderStatus();showDataStatesCard();}else{showError(e);}
    });}else{getSeed().then(function(sd){SEED=sd;storage=makeStorage(sd);var data=storage.load();model=data;byId={};model.members.forEach(function(m){byId[m.id]=m;});cur=getLS(UKEY,null);if(!cur||!byId[cur])cur=model.members.slice().sort(function(a,b){return a.order-b.order;})[0].id;start();}).catch(showError);}}var _started=false;function start(){_started=true;document.body.addEventListener("click",function(ev){var cl=ev.target.closest("[data-modal-close]");if(cl){closeDetail();return;}var b=ev.target.closest("button[data-act]");if(b&&isReadOnly()){onSaveErr(new Error("Schreibgesch\u00fctzt \u2013 \u00c4nderungen sind gerade nicht m\u00f6glich."));return;}if(b){var id=b.getAttribute("data-id"),a=b.getAttribute("data-act");if(a==="adm-head"){admHead(id);return;}if(a==="adm-kann"){admKann(id,b.getAttribute("data-uid"));return;}if(a==="adm-best"){admBest(id);return;}var fn=({kann:toggleKann,ueb:uebernehmen,frei:freigeben,remind:remind,pool:pool,del:loeschen,pass:pass})[a];if(fn)fn(id);return;}var dc=ev.target.closest("[data-detail]");if(dc){openDetail(dc.getAttribute("data-detail"));return;}});document.addEventListener("keydown",function(ev){if((ev.key==="Escape"||ev.keyCode===27)&&detailId!=null)closeDetail();});
  document.getElementById("who").addEventListener("change",function(e){cur=e.target.value;setLS(UKEY,cur);render();});
  document.getElementById("tab-a").addEventListener("click",function(){view="a";setLS(VKEY,view);render();});
  document.getElementById("tab-c").addEventListener("click",function(){view="c";setLS(VKEY,view);render();});
  document.getElementById("addbtn").addEventListener("click",function(){var gc=document.getElementById("gcard");gc.style.display=(!gc.style.display||gc.style.display==="none")?"block":"none";});_lastSaved=JSON.stringify(model);syncBaseGen();
  // Schliessen/Verstecken: nur async Copy-on-Write-Save anstossen (nie synchron, nie loeschen) und bei
  // offenen Aenderungen den Browser-Hinweis "Seite verlassen?" ausloesen.
  window.addEventListener("beforeunload",function(ev){flushActivityNow();if(hasUnsaved()){flushPendingAsync();ev.preventDefault();ev.returnValue="";return "";}});
  document.addEventListener("visibilitychange",function(){if(document.visibilityState==="hidden"){flushPendingAsync();flushActivityNow();}});
  var __dsl=document.getElementById("dsload");if(__dsl&&!__dsl.__wired){__dsl.__wired=true;__dsl.addEventListener("click",renderDataStates);}var __ey=document.getElementById("exp-year");if(__ey)__ey.addEventListener("change",function(){expYear=parseInt(this.value,10);renderExport();});var __ec=document.getElementById("exp-csv");if(__ec)__ec.addEventListener("click",function(){downloadCsv(expYear);});
  document.getElementById("savebtn").addEventListener("click",anlegen);
  document.getElementById("resetbtn").addEventListener("click",resetAll);
  
  document.getElementById("cleanbtn").addEventListener("click",aufraeumen);
  var __stb=document.getElementById("selftestbtn");if(__stb)__stb.addEventListener("click",selftest2);
  document.getElementById("g-date").addEventListener("change",function(e){var v=e.target.value,h=document.getElementById("g-hint");if(!v){h.textContent="";return;}var hn=holiday(v);h.innerHTML=weekday(v)+", "+fmt(v)+(hn?" · "+hn:"")+(isWeekendOrHoliday(v)?"":' · <span style="color:var(--amber)">Hinweis: kein Sa/So/Feiertag</span>')+((v<todayIso)?' · <span style="color:var(--info)">rückwirkender Eintrag</span>':"");});
  var names={};model.members.forEach(function(m){names[m.name]=1;});model.requests.forEach(function(r){if(r.dienstVon)names[r.dienstVon]=1;});
  document.getElementById("names").innerHTML=Object.keys(names).sort().map(function(n){return '<option value="'+n+'">';}).join("");
  var __gb=document.getElementById("g-best");if(__gb)__gb.innerHTML='<option value="">— niemand (offen) —</option>'+model.members.slice().sort(function(a,b){return a.order-b.order;}).map(function(m){return '<option value="'+m.id+'">'+esc(m.name)+'</option>';}).join("");
  
  
  document.getElementById("cy").textContent=curYear;
  document.getElementById("tline").textContent="↑ ab heute   ·   darunter vergangene Termine";
  if(!isReadOnly())runDueReminders();
  render();
  if(IS_CONF){wireUserSearch();startPolling();}
}
boot();
}());
