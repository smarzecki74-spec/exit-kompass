# EXIT-KOMPASS.de – Landingpage

Statische Lead-Landingpage: Besucher tragen Vorname und Mobilnummer ein, der Lead landet in der Supabase-Datenbank, danach öffnet sich WhatsApp mit einer vorbereiteten Nachricht an Collin.

Hosting: **Cloudflare Worker mit Static Assets** (Auto-Deploy aus GitHub, Konfiguration in `wrangler.jsonc`).
Die API-Handler in `functions/api` sind im Pages-Functions-Format – das Projekt läuft also auch als Pages-Projekt.
Datenbank: **Supabase** (Projekt `exit-kompass`, Region Frankfurt, Free-Plan) – **nur für Leads/CRM**. Die Website-Inhalte bleiben in `content.json`.

## Struktur

```
public/                 ← wird von Cloudflare Pages ausgeliefert (Build-Output)
  index.html            Seitengerüst
  content.json          ALLE Texte + Einstellungen (WhatsApp, Lead-Endpoint)
  impressum.html        /impressum   (Clean URLs macht Pages automatisch)
  datenschutz.html      /datenschutz
  _headers              Security- und Cache-Header
  assets/app.js         Rendert die Seite aus content.json, Formular-Logik
  assets/icons.js       Icons (generiert, lokal)
  assets/styles.css     Tailwind-Build (wird beim Deploy neu gebaut)
  assets/fonts/         Lokal gehostete Schriften (DSGVO)
src/input.css           Tailwind-Quelle + eigene Styles
lib/db.js               Supabase-Anbindung (REST, ohne SDK)
functions/api/lead.js   POST /api/lead – Formular → Tabelle leads
supabase/migrations/    Datenbankschema inkl. Zugriffsregeln (RLS)
.github/workflows/      supabase-keep-alive.yml – pingt die DB alle 3 Tage
apps-script/Code.gs     (alt) Google-Apps-Script, nur noch optional über settings.leadEndpoint
.node-version           Node-Version für den Cloudflare-Build
```

## Texte ändern

**Am einfachsten über das CMS:** `https://exit-kompass.de/admin` → anmelden → bearbeiten → **Veröffentlichen**.
Alternativ `public/content.json` direkt bearbeiten → committen → pushen. Cloudflare deployt automatisch.

- `contact.*` – Name, Anschrift, E-Mail, Telefon, WhatsApp. Erscheinen automatisch in Impressum + Datenschutz
  (der Worker setzt sie beim Ausliefern ein). `contact.whatsapp` ist auch das Ziel des E-Book-Formulars.
- `settings.whatsappMessage` – `{name}` wird durch den Vornamen ersetzt
- `settings.leadEndpoint` – optional: zusätzliches Ziel für Leads (z. B. Apps-Script-Web-App). Leer lassen = nur Supabase
- `mentor.photo` – z. B. `/assets/img/collin.jpg` (Datei in `public/assets/img/` legen). Leer = Initialen.
- `testimonials.items` – leeres Array blendet die Sektion aus
- Icons: Namen wie in `scripts/build-icons.mjs` (MAP). Neue Icons dort ergänzen und `npm run icons` ausführen.

## Datenbank (Supabase)

Projekt `exit-kompass` (Ref `zgxejffscdpksaoedtkg`, Region eu-central-1 / Frankfurt, Free-Plan).

| Tabelle | Inhalt | Zugriff mit öffentlichem Key |
|---|---|---|
| `leads` | Vorname, Mobilnummer, Formular, Seite, Einwilligung + Einwilligungstext, Status, Notiz | nur **anlegen** (kein Lesen/Ändern) |
| `site_content`, `content_revisions` | **nicht in Benutzung** (Überbleibsel eines Tests am 22.10.2026, die Website liest sie nicht) | – |
| `heartbeat` | letzter Keep-Alive-Ping | gesperrt (nur über `keep_alive()`) |

- Leads ansehen/bearbeiten: Supabase-Dashboard → Table Editor → `leads` (Spalte `status`: neu, kontaktiert, e-book gesendet, kunde, kein interesse).
- Schema ändern: neue Datei in `supabase/migrations/` anlegen und anwenden (Dashboard → SQL Editor oder `supabase db push`).

### Variablen im Cloudflare Worker

| Name | Wo | Wofür |
|---|---|---|
| `SUPABASE_URL` | `wrangler.jsonc` (vars) | öffentlich |
| `SUPABASE_PUBLISHABLE_KEY` | `wrangler.jsonc` (vars) | öffentlich, durch RLS abgesichert – nur Lead-Formular |

Die Website braucht keinen Supabase-Secret-Key. (Falls `SUPABASE_SECRET_KEY` im Worker gesetzt ist: wird nicht verwendet, kann gelöscht werden.)

### Keep-Alive

Supabase pausiert Free-Projekte nach 7 Tagen ohne Aktivität. `.github/workflows/supabase-keep-alive.yml` ruft alle 3 Tage
`keep_alive()` auf (sichtbar in Tabelle `heartbeat`). Manuell starten: GitHub → Actions → *Supabase Keep-Alive* → *Run workflow*.
Schlägt der Job fehl, ist das Projekt evtl. schon pausiert → im Supabase-Dashboard wiederherstellen.

## Deployment (GitHub → Cloudflare Pages)

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Erstellen** → Reiter **Pages** → **Mit Git verbinden**
2. GitHub verbinden, Repo `exit-kompass` auswählen
3. Build-Einstellungen:
   - Framework-Voreinstellung: **Keine**
   - Build-Befehl: `npm run build`
   - Build-Ausgabeverzeichnis: `public`
4. **Speichern und bereitstellen** → live unter `exit-kompass.pages.dev`
5. Jeder Push auf `main` geht live, jeder andere Branch bekommt eine Preview-URL
6. Domain: Projekt → **Benutzerdefinierte Domains** → `exit-kompass.de` und `www.exit-kompass.de` hinzufügen.
   Am einfachsten, wenn die Domain-DNS bei Cloudflare liegt (Nameserver umstellen) – dann richtet Cloudflare alles automatisch ein.

## CMS (`/admin`)

Schlankes CMS ohne Datenbank: Der Editor liest und schreibt `public/content.json` direkt im GitHub-Repo.
Jedes **Veröffentlichen** ist ein Commit auf `main` → Cloudflare baut automatisch neu (ca. 1–2 Min.).

- Login für mehrere Benutzer, Passwörter nur als Hash gespeichert (PBKDF2), Sitzung 8 h per signiertem Cookie
- Live-Vorschau des Entwurfs (Desktop/Mobil), Entwürfe bleiben im Browser erhalten
- Listen: Einträge hinzufügen, löschen (mit Rückgängig), sortieren
- Bild-Upload (wird vor dem Upload auf max. 1200 px verkleinert) nach `public/assets/img/`
- Konflikterkennung, wenn zwei Leute gleichzeitig veröffentlichen
- Commits zeigen, wer was geändert hat (`CMS: Inhalte aktualisiert von collin – Notiz`)

```
worker/index.js         Worker-Einstieg: /api/* → CMS-Handler, alles andere → public/
wrangler.jsonc          Worker-Konfiguration (Name, Assets, Kompatibilitätsdatum)
functions/api/          API-Handler (Login, Inhalte, Upload) im Pages-Functions-Format
lib/cms.js              Gemeinsame Logik (Auth, Sitzung, GitHub-API)
public/admin/           Editor-Oberfläche
  cms.config.js         ← einzige projektspezifische Datei (Bereiche, Beschriftungen, Feldtypen, Icons)
  cms.js                generischer Editor
scripts/cms-hash.mjs    Passwort-Hashes erzeugen
```

### Einrichtung (einmalig)

1. **GitHub-Token:** github.com → Settings → Developer settings → **Fine-grained tokens** → Generate
   - Repository access: *Only select repositories* → `exit-kompass`
   - Permissions → Repository → **Contents: Read and write**
   - Ablaufdatum notieren (danach neuen Token eintragen)
2. **Benutzer + Secret erzeugen:**
   ```bash
   npm run cms:hash -- sebastian collin --secret
   ```
   Gibt Zufallspasswörter, den Wert für `CMS_USERS` und einen `CMS_SECRET` aus.
   Eigenes Passwort: `npm run cms:hash -- 'collin=MeinLangesPasswort'`
3. **Cloudflare:** Workers & Pages → `exit-kompass` → **Settings → Variables and Secrets** → **Add**, Typ **Secret**:
   | Name | Wert |
   |---|---|
   | `CMS_USERS` | Ausgabe von Schritt 2 (`sebastian:pbkdf2…,collin:pbkdf2…`) |
   | `CMS_SECRET` | Ausgabe von Schritt 2 |
   | `GITHUB_TOKEN` | Token aus Schritt 1 |
4. Secrets greifen beim Worker sofort, kein Neu-Deploy nötig.
5. `https://exit-kompass.de/admin` öffnen und anmelden.

Optional: `GITHUB_REPO`, `GITHUB_BRANCH`, `CMS_CONTENT`, `CMS_UPLOADS` (siehe `lib/cms.js`).

**Benutzer ändern/hinzufügen/sperren:** `CMS_USERS` neu erzeugen bzw. Eintrag entfernen, in Cloudflare ersetzen, neu deployen.
Alle Sitzungen sofort beenden: `CMS_SECRET` austauschen.

**Brute-Force-Schutz (empfohlen):** Cloudflare → Domain → Sicherheit → WAF → *Rate limiting rules* →
Pfad gleich `/api/login`, z. B. 5 Anfragen pro 10 Sekunden → Blockieren.

### Für andere Projekte wiederverwenden

`functions/`, `lib/`, `public/admin/` und `scripts/cms-hash.mjs` kopieren, `cms.config.js` an die neue
`content.json` anpassen, Variablen setzen (inkl. `GITHUB_REPO`). Felder ohne Konfiguration funktionieren
trotzdem – Beschriftung und Feldtyp werden aus dem JSON abgeleitet. Für die Live-Vorschau muss die Seite
bei `?cms-preview=1` den Inhalt aus `localStorage['cms-preview']` lesen (siehe `loadContent()` in `assets/app.js`).

## Lokal

```bash
npm install
npm run build      # CSS bauen
npm run serve      # http://localhost:3000
npm run dev        # CSS-Watch beim Arbeiten
npm run cms:dev    # Seite + CMS lokal als Worker (http://localhost:8788/admin)
```

Für `cms:dev` eine Datei `.dev.vars` anlegen (wird nicht committet) mit `CMS_USERS`, `CMS_SECRET`, `GITHUB_TOKEN`.
Achtung: Lokal veröffentlichen schreibt echt ins Repo – dafür `GITHUB_BRANCH=cms-test` setzen.

## Vor Go-live

- [ ] CMS → **Kontakt & Impressum**: Anschrift + E-Mail ergänzen (fehlende Pflichtangaben stehen rot im Impressum)
- [ ] Apps Script deployen und `leadEndpoint` eintragen
- [ ] Foto von Collin in `public/assets/img/` + `mentor.photo` setzen
- [ ] Testlead absenden und im Sheet prüfen
- [ ] CMS-Variablen in Cloudflare setzen, `/admin` testen, WAF-Rate-Limit auf `/api/login`
