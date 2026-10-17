/**
 * EXIT KOMPASS – Lead-Speicherung (Google Apps Script Web-App)
 *
 * Empfängt Leads von der Website (Cloudflare Pages) per POST und schreibt sie ins Google Sheet.
 *
 * Deployment:
 *  1. script.google.com → Neues Projekt → diesen Code einfügen → speichern
 *  2. Bereitstellen → Neue Bereitstellung → Typ „Web-App“
 *       Ausführen als:        Ich
 *       Zugriff:              Jeder
 *  3. Berechtigungen bestätigen, Web-App-URL (…/exec) kopieren
 *  4. URL in public/content.json bei settings.leadEndpoint eintragen, committen, pushen
 *
 * Nach Code-Änderungen: Bereitstellungen verwalten → Bearbeiten → Version „Neu“
 * (sonst bleibt die alte Version live und die URL ändert sich nicht).
 */

var SPREADSHEET_ID = '1WnIc-851rXnagN3GxWYNiwU5q5Kqyg48fW-sS4Vl3CQ';
var SHEET_NAME = 'Leads';
var HEADERS = ['Zeitstempel', 'Vorname', 'Mobilnummer', 'Formular', 'Seite', 'Einwilligung', 'Status'];

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    var raw = (e && e.postData && e.postData.contents) || '{}';
    var data = JSON.parse(raw);

    // Honeypot / Minimal-Validierung
    if (data.website) return json_({ status: 'ignored' });
    var name = clean_(data.name, 60);
    var phone = clean_(data.phone, 25);
    if (name.length < 2 || !/^\+\d{8,15}$/.test(phone)) {
      return json_({ status: 'error', message: 'invalid input' });
    }

    var sheet = getSheet_();
    sheet.appendRow([
      new Date(),
      name,
      phone,
      clean_(data.source, 20),
      clean_(data.page, 200),
      data.consent === true ? 'ja' : 'nein',
      'neu'
    ]);

    return json_({ status: 'success' });
  } catch (err) {
    console.error(err);
    return json_({ status: 'error', message: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

// Zum Testen im Browser: …/exec aufrufen → „Exit Kompass Lead-API läuft“
function doGet() {
  return ContentService.createTextOutput('Exit Kompass Lead-API läuft');
}

function getSheet_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.getRange('C:C').setNumberFormat('@'); // Telefonnummer als Text
  }
  return sheet;
}

// Kürzt Eingaben und verhindert Formel-Injection im Sheet (=, +, -, @ am Anfang)
function clean_(value, maxLen) {
  var s = String(value == null ? '' : value).trim().slice(0, maxLen);
  if (/^[=\-@]/.test(s)) s = "'" + s;
  return s;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Manueller Test im Editor: Funktion auswählen → Ausführen
function testDoPost() {
  var res = doPost({ postData: { contents: JSON.stringify({ name: 'Test', phone: '+491701234567', source: 'test', page: 'editor', consent: true }) } });
  Logger.log(res.getContent());
}
