// seb_gun CRM v28.25 — Google Sheets Web App storage
// 1) Replace API_SECRET below with the same long secret you add to Render.
// 2) Deploy -> New deployment -> Web app -> Execute as Me -> Who has access: Anyone.
// 3) Copy the /exec URL into GOOGLE_SHEETS_WEBAPP_URL in Render.

const SPREADSHEET_ID = '1lm0ajA6nFpQ5jXybxm3MY5pVp0gTjqP_oC_0rira7oI';
const API_SECRET = 'CHANGE_THIS_TO_THE_SAME_LONG_SECRET_AS_RENDER';

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
  if (body.spreadsheetId && String(body.spreadsheetId) !== SPREADSHEET_ID) throw new Error('Spreadsheet ID mismatch');
}

function book() { return SpreadsheetApp.openById(SPREADSHEET_ID); }

function ensureSheet(name, headers) {
  const ss = book();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  const wanted = Array.isArray(headers) ? headers.map(String) : [];
  if (wanted.length) {
    const current = sh.getLastColumn() > 0 ? sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), wanted.length)).getValues()[0] : [];
    const mismatch = wanted.some((h, i) => String(current[i] || '') !== h);
    if (mismatch) sh.getRange(1, 1, 1, wanted.length).setValues([wanted]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function readObjects(name) {
  const sh = book().getSheetByName(name);
  if (!sh || sh.getLastRow() < 1 || sh.getLastColumn() < 1) return [];
  const values = sh.getDataRange().getValues();
  if (!values.length) return [];
  const headers = values[0].map(String);
  return values.slice(1).filter(row => row.some(v => v !== '' && v !== null)).map(row => {
    const out = {};
    headers.forEach((h, i) => { if (h) out[h] = row[i] === undefined ? '' : row[i]; });
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
  const sh = ensureSheet(String(body.sheet || ''), body.headers || []);
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
  const sh = ensureSheet(String(body.sheet || ''), body.headers || []);
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
  Object.keys(schema).forEach(name => ensureSheet(name, schema[name]));
  return { ok: true, sheets: Object.keys(schema) };
}

function doGet() {
  return response({ ok: false, error: 'Use POST' });
}

function doPost(e) {
  try {
    const body = parseBody(e);
    authorize(body);
    const action = String(body.action || '');
    if (action === 'health') return response({ ok: true, storage: 'google-apps-script', spreadsheetId: SPREADSHEET_ID, at: Date.now() });
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
