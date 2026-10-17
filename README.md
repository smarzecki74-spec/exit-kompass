# EXIT-KOMPASS.de – Landingpage

Statische Lead-Landingpage: Besucher tragen Vorname und Mobilnummer ein, der Lead landet im Google Sheet, danach öffnet sich WhatsApp mit einer vorbereiteten Nachricht an Collin.

## Struktur

```
public/                 ← wird von Vercel ausgeliefert
  index.html            Seitengerüst
  content.json          ALLE Texte + Einstellungen (WhatsApp, Lead-Endpoint)
  impressum.html        /impressum
  datenschutz.html      /datenschutz
  assets/app.js         Rendert die Seite aus content.json, Formular-Logik
  assets/icons.js       Icons (generiert, lokal)
  assets/styles.css     Tailwind-Build (wird beim Deploy neu gebaut)
  assets/fonts/         Lokal gehostete Schriften (DSGVO)
src/input.css           Tailwind-Quelle + eigene Styles
apps-script/Code.gs     Google-Apps-Script für die Lead-Speicherung
vercel.json             Build, Clean URLs, Security-Header
```

## Texte ändern

Nur `public/content.json` bearbeiten → committen → pushen. Vercel deployt automatisch.

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

## Deployment (GitHub → Vercel)

1. Repo bei [vercel.com/new](https://vercel.com/new) importieren – Framework Preset: **Other** (Rest kommt aus `vercel.json`)
2. Jeder Push auf `main` geht live, jeder andere Branch bekommt eine Preview-URL
3. Domain: Vercel → Project → Settings → Domains → `exit-kompass.de` + `www.exit-kompass.de` hinzufügen und DNS beim Domain-Anbieter wie angezeigt setzen

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
