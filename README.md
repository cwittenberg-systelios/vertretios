# vertretios
Vertretungspool planer (Wochenendpräsenz) – Confluence-HTML/JS-App (Server 7.4).

## Dateien

| Datei | Zweck |
|---|---|
| `htmlMacro.html` | Inhalt des HTML-Makros. Lädt `persistence.js` und dann `app.js` als Seiten-Anhänge, jeweils mit Cache-Bust `?v=Date.now()`. Enthält `WP_ADMINS`. |
| `persistence.js` | Persistenz-Schicht (Port von `urlaubios/persistence.js` 1.1.3): Store-Klasse und Confluence-Transport. |
| `app.js` | App (UI, Logik). Nutzt `window.VertretiosPersistence`. |
| `build.sh` | Führt die Tests aus, setzt die Build-Version (`git describe`) in `app.js` ein und legt die Deploy-Dateien in `dist/deploy/` ab. |
| `test/` | Node-Tests mit Mock-Transport und Fake-Confluence. `test/fixtures/legacy-propertystore-v2.js` ist der unveränderte Persistenzcode der Vorversion (Stand `main`) und dient als „alter Browser-Tab“. |

## Tests

```sh
npm test            # = node test/run.js (nur Node-Bordmittel, keine Abhängigkeiten)
sh build.sh         # Tests + dist/deploy mit Build-Version
# optional, braucht Playwright + Chromium:
NODE_PATH=/opt/npm-tools/node_modules node test/e2e.browser.js
```

## Speicherformat (Content Properties der Seite)

| Schlüssel | Inhalt |
|---|---|
| `vertretios.manifest`, `.2`, `.3` … | Manifest `{fmt:3, gen, chunks, token, …}`. Maßgeblich ist das Manifest mit der höchsten Generation. Wenn Confluence das Update ablehnt (Seite in einen anderen Bereich verschoben, HTTP 500 „another space“), wird der nächste Schlüssel neu angelegt. |
| `vertretios.store-<gen>-<token>-<i>` | Daten-Chunks `{d:"…"}`. Bei jedem Schreibversuch kommen neue Schlüssel hinzu, bestehende werden nie überschrieben. |
| `wpstore` | Altes Manifest (Rang 0). Wird gelesen und beim ersten Speichern migriert. Danach ist es ein **Platzhalter** `{v:2, n:1, sfx:"guard"}`, der alte App-Versionen auf `wpstore-<gen>-guard-0` lenkt. |
| `wpstore-<gen>-guard-0` | Absichtlich unlesbarer Chunk. Eine alte App-Version scheitert daran mit Parse-Fehler, statt leer zu speichern. |
| `wpstore-<gen>-[<sfx>-]<i>` | Alte Chunks. Sie bleiben als Historie erhalten und lassen sich unter „Datenstände“ wiederherstellen. |
| Anhang `wpdata.json` / `ap-data.json` | Ältere Migrationsquelle. Wird nur gelesen, wenn kein Manifest existiert. |

Das Verhalten im Einzelnen:

- **Laden:** Fehlt ein Chunk, wird das Manifest bis zu dreimal neu gelesen. Danach fällt die App auf den neuesten lesbaren älteren Stand zurück; dieser ist nur sichtbar und schreibgeschützt. Kaputtes JSON und Lesefehler sind Ladefehler: Es erscheint ein rotes Banner und die App ist schreibgeschützt. „Keine Daten“ gilt nur, wenn kein Manifest existiert oder `count = 0` gemeldet wird.
- **Speichern:** Copy-on-Write mit Manifest-CAS. Bei 409 werden die Daten gemergt (id-basiertes Delta) und das Speichern höchstens zweimal wiederholt. Bei 5xx oder Netzfehler liest die App das Manifest nach und löscht eigene Chunks nur, wenn sicher ist, dass das Manifest nicht auf sie zeigt. Speicherfehler erscheinen als rotes Banner mit „Erneut versuchen“.
- **Schließen/Verstecken des Tabs:** Es gibt keinen synchronen Speicherpfad mehr. Die App stößt nur den normalen asynchronen Speichervorgang an und fragt bei offenen Änderungen „Seite verlassen?“. Beim Entladen wird nie etwas gelöscht.
- **Historie:** Die letzten 10 Generationen bleiben erhalten. Aufgeräumt wird nur beim Laden, und nur Generationen ≤ aktuell − 10.
- **Admin „Datenstände“:** Karte unten auf der Seite, sichtbar für `WP_ADMINS`. Sie listet alle Generationen (Format, Einträge, lesbar ja/nein) und stellt einen älteren Stand als **neue** Generation wieder her.
- **Build-Version:** steht im Seitenfuß (`Build … · Datenstand Generation …`) und in der Konsole (`[WP] Vertretungspool Build …`).

## Deploy-Reihenfolge (wichtig, Live-Daten!)

1. `sh build.sh` ausführen. Alle Tests müssen grün sein.
2. **Zuerst** `dist/deploy/persistence.js` als neuen Anhang an die App-Seite hängen. Er schadet nicht, solange das Makro ihn noch nicht lädt.
3. Dann den Inhalt des HTML-Makros durch `dist/deploy/htmlMacro.html` ersetzen (`WP_ADMINS` übernehmen!) und die Seite veröffentlichen. Die alte `app.js` läuft damit unverändert weiter, weil sie `persistence.js` ignoriert.
4. **Direkt danach** `dist/deploy/app.js` als neue Version des Anhangs `app.js` hochladen. Ab jetzt läuft die neue Version: Dank Cache-Bust laden alle Nutzer:innen beim nächsten Seitenaufruf die neue Datei.
5. Seite selbst neu laden. Im Fuß muss die neue Build-Version stehen. Das Laden allein schreibt nichts.
6. **Alle Nutzer:innen bitten, die Seite neu zu laden** (offene Tabs schließen). Erst mit dem ersten Speichern einer neuen Version wird das neue Format „scharf“: `wpstore` wird dann zum Platzhalter. Ab diesem Moment scheitern alte, noch offene Tabs beim Laden und Speichern, statt Daten zu überschreiben.
7. Nachkontrolle: als Admin „Datenstände anzeigen“ öffnen. Die aktuelle Generation (neu) muss lesbar sein, und der alte Stand (`alt (v2)`) muss als Historie gelistet sein.

Rückweg: Den Anhang `app.js` und das Makro auf die Vorversion zurückzusetzen ist **nach** der ersten Migration nicht mehr sinnvoll, weil die alte Version am Platzhalter scheitert (gewollt). Im Notfall den gewünschten Stand über „Datenstände“ wiederherstellen.

## Admins

`window.WP_ADMINS` im HTML-Makro: Confluence-Benutzernamen oder userKeys.
