/* Projekt-Konfiguration für das Mini-CMS – nur diese Datei ist projektspezifisch.
 *
 * Pfad-Muster: Punkte trennen Ebenen, "*" steht für einen Listeneintrag.
 *   "problem.points.*.icon"  → Feld "icon" in jedem Eintrag von problem.points
 * Feldtypen: text (Standard), textarea, html, icon, image, url, tel
 */
window.CMS_CONFIG = {
  title: 'Exit Kompass',
  siteUrl: '/',
  previewUrl: '/?cms-preview=1',
  iconsScript: '/assets/icons.js',

  // Reihenfolge und Namen der Bereiche in der Seitenleiste
  sections: [
    { key: 'hero', label: 'Hero', hint: 'Der erste Bildschirm mit Überschrift und Formular.' },
    { key: 'problem', label: 'Problem' },
    { key: 'pillars', label: '3 Säulen' },
    { key: 'mentor', label: 'Mentor' },
    { key: 'modules', label: 'E-Book-Module' },
    { key: 'testimonials', label: 'Stimmen', hint: 'Keine Einträge = Bereich wird auf der Seite ausgeblendet.' },
    { key: 'faq', label: 'FAQ' },
    { key: 'finalCta', label: 'Abschluss' },
    { key: 'contact', label: 'Kontakt & Impressum', hint: 'Diese Daten erscheinen automatisch im Impressum und in der Datenschutzerklärung. Die WhatsApp-Nummer ist die, an die das Formular weiterleitet.' },
    { key: 'header', label: 'Kopfzeile' },
    { key: 'footer', label: 'Fußzeile' },
    { key: 'settings', label: 'Einstellungen', hint: 'Technische Werte – nur ändern, wenn du weißt, was sie tun.' },
  ],

  // Standard-Beschriftungen nach Feldname (gelten überall)
  labels: {
    badge: 'Kleine Überschrift',
    title: 'Überschrift',
    subtitle: 'Unterzeile',
    intro: 'Einleitung',
    text: 'Text',
    desc: 'Beschreibung',
    ctaText: 'Button-Text',
    items: 'Einträge',
    points: 'Punkte',
    icon: 'Icon',
    name: 'Name',
    role: 'Rolle',
    bio: 'Über mich',
    photo: 'Foto',
    stats: 'Kennzahlen',
    value: 'Wert',
    label: 'Bezeichnung',
    quote: 'Zitat',
    author: 'Name',
    question: 'Frage',
    answer: 'Antwort',
    highlights: 'Häkchen-Punkte',
  },

  // Feldspezifische Einstellungen (überschreiben die Standards)
  fields: {
    'settings.whatsappMessage': { label: 'WhatsApp-Nachricht (Vorlage)', type: 'textarea', hint: '{name} wird automatisch durch den Vornamen ersetzt.' },
    'settings.leadEndpoint': { label: 'Lead-Endpoint (Apps Script)', type: 'url', hint: 'URL der Apps-Script-Web-App, endet auf /exec. Leer = Leads werden nicht gespeichert.', pattern: '^(https://.+)?$' },

    'contact.name': { label: 'Name (Betreiber)', hint: 'Pflichtangabe fürs Impressum.' },
    'contact.company': { label: 'Firma / Projektname', hint: 'Optional. Leer = Zeile wird im Impressum ausgeblendet.' },
    'contact.street': { label: 'Straße und Hausnummer', hint: 'Pflichtangabe fürs Impressum (ladungsfähige Anschrift, kein Postfach).' },
    'contact.zipCity': { label: 'PLZ und Ort', hint: 'z. B. 73033 Göppingen' },
    'contact.country': { label: 'Land', hint: 'Optional.' },
    'contact.email': { label: 'E-Mail', type: 'email', hint: 'Pflichtangabe fürs Impressum.', pattern: '^([^\\s@]+@[^\\s@]+\\.[^\\s@]+)?$' },
    'contact.phone': { label: 'Telefon', type: 'tel', hint: 'Mit Ländervorwahl, z. B. +49 176 61726407. Leer = wird im Impressum ausgeblendet.', pattern: '^(\\+?[\\d\\s/()-]{8,24})?$' },
    'contact.whatsapp': { label: 'WhatsApp-Nummer', type: 'tel', hint: 'Hierhin leitet das E-Book-Formular weiter. Mit Ländervorwahl, z. B. +49 176 61726407.', pattern: '^\\+?[\\d\\s/()-]{8,24}$' },

    'header.brandName': { label: 'Markenname', type: 'html' },
    'header.brandTagline': { label: 'Slogan' },

    'hero.badge': { label: 'Badge über der Überschrift' },
    'hero.title': { type: 'html' },
    'hero.subtitle': { type: 'textarea' },
    'hero.ctaText': { label: 'Button-Text im Formular' },
    'hero.formBadge': { label: 'Formular – Badge' },
    'hero.formHeadline': { label: 'Formular – Überschrift' },
    'hero.formText': { label: 'Formular – Text', type: 'textarea' },
    'hero.guarantee': { label: 'Hinweis unter dem Formular' },

    'problem.title': { type: 'html' },
    'pillars.title': { type: 'html' },
    'mentor.title': { type: 'html' },
    'mentor.photo': { type: 'image', hint: 'Quadratisches Foto, wird rund dargestellt. Leer = Initialen.' },
    'mentor.bio': { type: 'textarea' },
    'modules.title': { type: 'html' },
    'testimonials.title': { type: 'html' },
    'faq.title': { type: 'html' },
    'finalCta.title': { type: 'html' },
    'finalCta.text': { type: 'textarea' },

    'footer.copyright': { label: 'Copyright' },
    'footer.disclaimer': { label: 'Haftungshinweis', type: 'textarea' },
    'footer.impressum': { label: 'Link-Text Impressum' },
    'footer.datenschutz': { label: 'Link-Text Datenschutz' },
  },

  // Titel eines Listeneintrags in der eingeklappten Ansicht
  itemTitleKeys: ['title', 'question', 'author', 'value', 'name', 'label'],

  // Vorlage für neue Einträge, falls eine Liste leer ist
  templates: {
    'problem.points': { icon: 'account_balance', title: '', desc: '' },
    'pillars.items': { icon: 'shield', title: '', desc: '' },
    'mentor.stats': { value: '', label: '' },
    'modules.items': { title: '', desc: '' },
    'testimonials.items': { quote: '', author: '', role: '' },
    'faq.items': { question: '', answer: '' },
    'hero.highlights': '',
  },

  // Icons, die zur Auswahl stehen (Namen aus assets/icons.js)
  icons: {
    account_balance: 'Bank / Abgaben',
    gavel: 'Hammer / Recht',
    flight_takeoff: 'Flugzeug',
    shield: 'Schild',
    trending_up: 'Trend nach oben',
    palms: 'Palme',
    explore: 'Kompass',
    check_circle: 'Häkchen',
    person: 'Person',
    chat: 'Chat',
    lock: 'Schloss',
    star: 'Stern',
    public: 'Globus',
    balance: 'Waage',
  },

  // Texte länger als diese Zeichenzahl bekommen automatisch ein mehrzeiliges Feld
  textareaFrom: 90,
};
