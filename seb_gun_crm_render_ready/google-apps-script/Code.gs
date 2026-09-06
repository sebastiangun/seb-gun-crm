// seb_gun CRM v28.27 — Google Sheets Web App storage
// 1) Replace API_SECRET below with the same long secret you add to Render.
// 2) Deploy -> Manage deployments -> Edit -> New version -> Web app.
// 3) Execute as Me -> Who has access: Anyone.
// 4) Keep the /exec URL in GOOGLE_SHEETS_WEBAPP_URL in Render.
// 5) v28.27: the spreadsheet ID comes from Render on every request, so next month
//    you only change GOOGLE_SPREADSHEET_ID in Render; Apps Script does NOT need redeploying.

const DEFAULT_SPREADSHEET_ID = ''; // optional fallback; normally leave blank
const API_SECRET = 'CHANGE_THIS_TO_THE_SAME_LONG_SECRET_AS_RENDER';
let ACTIVE_SPREADSHEET_ID = DEFAULT_SPREADSHEET_ID;

// These columns must stay strings. Google Sheets otherwise converts 10:00/22:00
// to fractional day numbers, which breaks SLA calculations when values are read back.
const TEXT_COLUMNS = {
  Leads: ['lead_id','work_start','work_end','timezone'],
  LeadEvents: ['event_id','lead_id','dedupe_key'],
  Notifications: ['notification_id'],
  Outbox: ['request_id'],
  SLASettings: ['setting_id','work_start','work_end','timezone'],
  NotificationRules: ['rule_id','work_start','work_end','timezone'],
  Managers: ['manager_id','login'],
  Statuses: ['status_id'],
  Users: ['login'],
  Bootstrap: ['key'],
  Runtime: ['key'],
  QuickPhrases: ['phrase_id','group_id','group_name','name','hotkey'],
  ClientsCache: ['client_key','account_login','client_id','vk_id','phone','next_contact_date']
};

function response(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function parseBody(e) {
  try { return JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { throw new Error('Invalid JSON body'); }
}

function authorize(body) {
  if (!API_SECRET || API_SECRET.startsWith('CHANGE_THIS_')) throw new Error('Apps Script API_SECRET is not configured');
  if (!body || String(body.secret || '') !== API_SECRET) throw new Error('Unauthorized');
  const requested = String(body.spreadsheetId || DEFAULT_SPREADSHEET_ID || '').trim();
  if (!requested) throw new Error('spreadsheetId is required');
  ACTIVE_SPREADSHEET_ID = requested;
}

function book() { return SpreadsheetApp.openById(ACTIVE_SPREADSHEET_ID); }

function textColumnIndexes(name, headers) {
  const wanted = new Set(TEXT_COLUMNS[name] || []);
  const out = [];
  headers.forEach((h, i) => { if (wanted.has(String(h))) out.push(i); });
  return out;
}

function migrateTextColumns(sh, name, headers) {
  const indexes = textColumnIndexes(name, headers);
  if (!indexes.length || sh.getMaxRows() < 2) return;
  indexes.forEach(idx => {
    const maxRows = Math.max(1, sh.getMaxRows() - 1);
    const colRange = sh.getRange(2, idx + 1, maxRows, 1);
    if (sh.getLastRow() >= 2) {
      const used = sh.getRange(2, idx + 1, sh.getLastRow() - 1, 1);
      const display = used.getDisplayValues();
      colRange.setNumberFormat('@');
      used.setValues(display);
    } else {
      colRange.setNumberFormat('@');
    }
  });
}

function ensureSheet(name, headers, migrate) {
  const ss = book();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  const wanted = Array.isArray(headers) ? headers.map(String) : [];
  if (wanted.length) {
    const current = sh.getLastColumn() > 0 ? sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), wanted.length)).getValues()[0] : [];
    const mismatch = wanted.some((h, i) => String(current[i] || '') !== h);
    if (mismatch) sh.getRange(1, 1, 1, wanted.length).setValues([wanted]);
    sh.setFrozenRows(1);
    if (migrate) migrateTextColumns(sh, name, wanted);
  }
  return sh;
}

function readObjects(name) {
  const sh = book().getSheetByName(name);
  if (!sh || sh.getLastRow() < 1 || sh.getLastColumn() < 1) return [];
  const range = sh.getDataRange();
  const values = range.getValues();
  const display = range.getDisplayValues();
  if (!values.length) return [];
  const headers = values[0].map(String);
  const textIndexes = new Set(textColumnIndexes(name, headers));
  return values.slice(1).filter(row => row.some(v => v !== '' && v !== null)).map((row, rowIndex) => {
    const out = {};
    headers.forEach((h, i) => {
      if (!h) return;
      // For text/SLA clock columns always return the visible string (for example 10:00),
      // never the internal 0.416666... value or an 1899 Date object.
      out[h] = textIndexes.has(i) ? String(display[rowIndex + 1][i] || '') : (row[i] === undefined ? '' : row[i]);
    });
    return out;
  });
}

function keyColumn(sh, keyField) {
  if (!keyField) throw new Error('keyField is required');
  const lastCol = Math.max(1, sh.getLastColumn());
  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  const idx = headers.indexOf(String(keyField));
  if (idx < 0) throw new Error('Unknown key field ' + keyField + ' in ' + sh.getName());
  return { headers, idx };
}

function findRowByKey(sh, keyField, value) {
  const meta = keyColumn(sh, keyField);
  if (sh.getLastRow() < 2) return { row: 0, headers: meta.headers, idx: meta.idx };
  const range = sh.getRange(2, meta.idx + 1, sh.getLastRow() - 1, 1);
  const found = range.createTextFinder(String(value)).matchEntireCell(true).findNext();
  return { row: found ? found.getRow() : 0, headers: meta.headers, idx: meta.idx };
}

function normalizeRow(headers, row) {
  return headers.map(h => {
    const v = row && Object.prototype.hasOwnProperty.call(row, h) ? row[h] : '';
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return v;
  });
}

function upsertMany(body) {
  const sh = ensureSheet(String(body.sheet || ''), body.headers || [], false);
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length) return { ok: true, written: 0 };
  const meta = keyColumn(sh, String(body.keyField || ''));
  const lastRow = sh.getLastRow();
  const existing = new Map();
  if (lastRow >= 2) {
    const keys = sh.getRange(2, meta.idx + 1, lastRow - 1, 1).getDisplayValues();
    keys.forEach((r, i) => { const k = String(r[0] || ''); if (k && !existing.has(k)) existing.set(k, i + 2); });
  }
  const append = [];
  let written = 0;
  rows.forEach(row => {
    const key = String(row && row[body.keyField] !== undefined ? row[body.keyField] : '');
    if (!key) return;
    const values = normalizeRow(meta.headers, row);
    const rowNumber = existing.get(key);
    if (rowNumber) sh.getRange(rowNumber, 1, 1, meta.headers.length).setValues([values]);
    else { append.push(values); existing.set(key, lastRow + append.length); }
    written++;
  });
  if (append.length) sh.getRange(sh.getLastRow() + 1, 1, append.length, meta.headers.length).setValues(append);
  return { ok: true, written };
}

function deleteByKey(body) {
  const sh = book().getSheetByName(String(body.sheet || ''));
  if (!sh) return { ok: true, deleted: false };
  const found = findRowByKey(sh, String(body.keyField || ''), String(body.value || ''));
  if (!found.row) return { ok: true, deleted: false };
  sh.deleteRow(found.row);
  return { ok: true, deleted: true };
}

function appendRows(body) {
  const sh = ensureSheet(String(body.sheet || ''), body.headers || [], false);
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length) return { ok: true, appended: 0 };
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const values = rows.map(row => normalizeRow(headers, row));
  sh.getRange(sh.getLastRow() + 1, 1, values.length, headers.length).setValues(values);
  return { ok: true, appended: values.length };
}

function clearSheetRows(body) {
  const sh = book().getSheetByName(String(body.sheet || ''));
  if (!sh || sh.getLastRow() < 2) return { ok: true, cleared: 0 };
  const n = sh.getLastRow() - 1;
  sh.getRange(2, 1, n, sh.getLastColumn()).clearContent();
  return { ok: true, cleared: n };
}

function setup(body) {
  const schema = body.schema || {};
  Object.keys(schema).forEach(name => ensureSheet(name, schema[name], true));
  return { ok: true, sheets: Object.keys(schema), storageVersion: '28.27' };
}

function doGet() {
  return response({ ok: false, error: 'Use POST' });
}

function doPost(e) {
  try {
    const body = parseBody(e);
    authorize(body);
    const action = String(body.action || '');
    if (action === 'health') return response({ ok: true, storage: 'google-apps-script', storageVersion: '28.27', spreadsheetId: ACTIVE_SPREADSHEET_ID, spreadsheetName: book().getName(), at: Date.now() });
    if (action === 'setup') return response(setup(body));
    if (action === 'read') return response({ ok: true, rows: readObjects(String(body.sheet || '')) });
    if (action === 'readMany') {
      const out = {};
      (Array.isArray(body.sheets) ? body.sheets : []).forEach(name => { out[String(name)] = readObjects(String(name)); });
      return response({ ok: true, sheets: out });
    }
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(20000)) throw new Error('Storage is busy; retry');
    try {
      if (action === 'upsertMany') return response(upsertMany(body));
      if (action === 'appendMany') return response(appendRows(body));
      if (action === 'delete') return response(deleteByKey(body));
      if (action === 'clear') return response(clearSheetRows(body));
      throw new Error('Unknown action: ' + action);
    } finally { lock.releaseLock(); }
  } catch (err) {
    return response({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}
