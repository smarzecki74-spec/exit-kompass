# EXIT-KOMPASS.de – Landingpage

Statische Lead-Landingpage: Besucher tragen Vorname und Mobilnummer ein, der Lead landet im Google Sheet, danach öffnet sich WhatsApp mit einer vorbereiteten Nachricht an Collin.

Hosting: **Cloudflare Pages** (Auto-Deploy aus GitHub).

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
apps-script/Code.gs     Google-Apps-Script für die Lead-Speicherung
.node-version           Node-Version für den Cloudflare-Build
```

## Texte ändern

Nur `public/content.json` bearbeiten → committen → pushen. Cloudflare deployt automatisch.

- `settings.whatsappNumber` – Nummer ohne `+`, z. B. `4917661726407`
- `settings.whatsappMessage` – `{name}` wird durch den Vornamen ersetzt
- `settings.leadEndpoint` – URL der Apps-Script-Web-App (siehe unten)
- `mentor.photo` – z. B. `/assets/img/collin.jpg` (Datei in `public/assets/img/` legen). Leer = Initialen.
- `testimonials.items` – leeres Array blendet die Sektion aus
- Icons: Namen wie in `scripts/build-icons.mjs` (MAP). Neue Icons dort ergänzen und `npm run icons` ausführen.

## Lead-Speicherung einrichten (einmalig)

1. [script.google.com](https://script.google.com) → Neues Projekt → Inhalt von `apps-script/Code.gs` einfügen
2. **Bereitstellen → Neue Bereitstellung → Web-App**, „Ausführen als: Ich“, „Zugriff: Jeder“
3. Web-App-URL (`…/exec`) in `content.json` → `settings.leadEndpoint` eintragen und pushen
4. Test: Formular absenden → neue Zeile im Tab „Leads“

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

## Lokal

```bash
npm install
npm run build      # CSS bauen
npm run serve      # http://localhost:3000
npm run dev        # CSS-Watch beim Arbeiten
```

## Vor Go-live

- [ ] Impressum: Anschrift + E-Mail ergänzen (rot markierte Platzhalter in `impressum.html`)
- [ ] Datenschutz: Anschrift + E-Mail ergänzen (`datenschutz.html`)
- [ ] Apps Script deployen und `leadEndpoint` eintragen
- [ ] Foto von Collin in `public/assets/img/` + `mentor.photo` setzen
- [ ] Testlead absenden und im Sheet prüfen
