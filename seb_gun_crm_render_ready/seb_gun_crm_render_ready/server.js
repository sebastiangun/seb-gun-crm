'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const { URL } = require('url');
const BlueSalesWeb = require('./lib/bluesales-web');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const LEGACY_PUBLIC = path.join(ROOT, 'legacy-public');

// Local private configuration. This file stays on the server and is never sent to the browser.
function loadLocalEnv(file) {
  try {
    if (!fs.existsSync(file)) return;
    const text = fs.readFileSync(file, 'utf8');
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const idx = line.indexOf('=');
      if (idx <= 0) continue;
      const key = line.slice(0, idx).trim();
      let value = line.slice(idx + 1).trim();
      if ((value.startsWith('\"') && value.endsWith('\"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch (err) {
    console.error('[config] Could not read .env.local:', err.message);
  }
}
loadLocalEnv(path.join(ROOT, '.env.local'));

const PORT = Number(process.env.PORT || 9050);
const HOST = process.env.HOST || '0.0.0.0';
const BS_BASE = process.env.BLUESALES_API_URL || 'https://bluesales.ru/app/Customers/WebServer.aspx';
const BS_WEB_BASE = process.env.BLUESALES_WEB_BASE || 'https://bluesales.ru';
const BS_WEB_SYNC_ENABLED = String(process.env.BLUESALES_WEB_SYNC ?? '1') !== '0';
const ALLOW_LOCAL_PHRASE_FALLBACK = String(process.env.ALLOW_LOCAL_PHRASE_FALLBACK ?? '0') === '1';
const VK_API_BASE = process.env.VK_API_BASE || 'https://api.vk.com/method/';
const VK_API_VERSION = process.env.VK_API_VERSION || '5.199';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const API_TIMEOUT_MS = Number(process.env.API_TIMEOUT_MS || 18000);
const MAX_BUSY_RETRIES = Number(process.env.MAX_BUSY_RETRIES || 1);
const BS_ORG_BUSY_RETRIES = Number(process.env.BS_ORG_BUSY_RETRIES || 1);
const BS_QUEUE_GAP_MS = Number(process.env.BS_QUEUE_GAP_MS || 180);
const BS_QUEUE_MAX_WAIT_MS = Number(process.env.BS_QUEUE_MAX_WAIT_MS || 10000);
const SEARCH_SCAN_LIMIT = Number(process.env.SEARCH_SCAN_LIMIT || 50000);
const REMINDER_SCAN_LIMIT = Number(process.env.REMINDER_SCAN_LIMIT || 50000); // fallback only; normal reminders use date-filtered API paging
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 12000);
const BLUESALES_PAGE_SIZE = Math.min(Math.max(Number(process.env.BLUESALES_PAGE_SIZE || 500), 1), 500);
const COOKIE_NAME = 'bs_mobile_session';
const VERSION = '28.8';
const PRESET_VK_TOKEN = String(process.env.VK_TOKEN || '').trim();
const PRESET_VK_COMMUNITY = String(process.env.VK_COMMUNITY || process.env.VK_GROUP_ID || '').trim();
const PRESET_VK_COMMUNITY_URL = String(process.env.VK_COMMUNITY_URL || '').trim();
const PUBLIC_BASE_URL = String(process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
const VK_DIRECT_AUTHOR = String(process.env.VK_DIRECT_AUTHOR || 'Дарья А.').trim();

// v26.5 Telegram SLA notifications. Secrets live only in Render Environment.
const TELEGRAM_BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
const TELEGRAM_BOT_USERNAME = String(process.env.TELEGRAM_BOT_USERNAME || 'yozhiki_sebastian_bot').trim().replace(/^@/, '');
let activeTelegramBotUsername = TELEGRAM_BOT_USERNAME;
const TELEGRAM_WEBHOOK_SECRET = String(process.env.TELEGRAM_WEBHOOK_SECRET || (TELEGRAM_BOT_TOKEN ? crypto.createHash('sha256').update(TELEGRAM_BOT_TOKEN).digest('hex').slice(0,48) : '')).trim();
const NOTIFICATION_CHECK_SECRET = String(process.env.NOTIFICATION_CHECK_SECRET || '').trim();
const NOTIFICATION_BS_LOGIN = String(process.env.BLUESALES_NOTIFICATION_LOGIN || '').trim();
const NOTIFICATION_BS_PASSWORD = String(process.env.BLUESALES_NOTIFICATION_PASSWORD || '');
const NOTIFICATION_STORE = path.join(ROOT, 'data', 'notification-settings.json');
const NOTIFICATION_DEFAULT_TZ = String(process.env.NOTIFICATION_TIMEZONE || 'Europe/Moscow').trim();
const NOTIFICATION_DEFAULT_CHAT_ID = String(process.env.NOTIFICATION_DEFAULT_CHAT_ID || '').trim();
const NOTIFICATION_DEFAULT_MANAGER = String(process.env.NOTIFICATION_DEFAULT_MANAGER || '').trim();
const NOTIFICATION_DEFAULT_MANAGER_FILTERS = String(process.env.NOTIFICATION_DEFAULT_MANAGER_FILTERS || '').trim();
const NOTIFICATION_DEFAULT_STATUSES = String(process.env.NOTIFICATION_DEFAULT_STATUSES || '').trim();
const NOTIFICATION_DEFAULT_SLA = Math.min(Math.max(Number(process.env.NOTIFICATION_DEFAULT_SLA_MINUTES || 8),1),240);
const NOTIFICATION_DEFAULT_WORK_START = /^\d{2}:\d{2}$/.test(String(process.env.NOTIFICATION_DEFAULT_WORK_START || '')) ? String(process.env.NOTIFICATION_DEFAULT_WORK_START) : '10:00';
const NOTIFICATION_DEFAULT_WORK_END = /^\d{2}:\d{2}$/.test(String(process.env.NOTIFICATION_DEFAULT_WORK_END || '')) ? String(process.env.NOTIFICATION_DEFAULT_WORK_END) : '22:00';
const APP_TIMEZONE = String(process.env.APP_TIMEZONE || process.env.NOTIFICATION_TIMEZONE || 'Europe/Moscow').trim();

// v26.0: independent local speech-to-text. The source messenger only provides
// the audio file; recognition is performed by open-source Transformers.js Whisper
// in a dedicated worker. No VK transcript endpoint or external STT API key.
const STT_ENABLED = String(process.env.STT_ENABLED ?? '1') !== '0';
const STT_LANGUAGE = String(process.env.STT_LANGUAGE || 'russian').trim();
const STT_MODEL = String(process.env.STT_MODEL || 'onnx-community/whisper-tiny').trim();
const STT_DTYPE = String(process.env.STT_DTYPE || 'q8').trim();
const STT_TIMEOUT_MS = Math.min(Math.max(Number(process.env.STT_TIMEOUT_MS || 300000), 30000), 360000);
const STT_IDLE_RELEASE_MS = Math.min(Math.max(Number(process.env.STT_IDLE_RELEASE_MS || 300000), 60000), 3600000);
const STT_PROVIDER = String(process.env.STT_PROVIDER || 'google-legacy').trim().toLowerCase();
const STT_PROVIDER_TIMEOUT_MS = Math.min(Math.max(Number(process.env.STT_PROVIDER_TIMEOUT_MS || 45000), 5000), 120000);
const STT_LOCAL_FALLBACK = String(process.env.STT_LOCAL_FALLBACK || '0') === '1';
const STT_JOB_TTL_MS = Math.max(Number(process.env.STT_JOB_TTL_MS || 15*60*1000),60000);
const STT_MAX_BYTES = Math.min(Math.max(Number(process.env.STT_MAX_BYTES || 16 * 1024 * 1024), 1024 * 1024), 24 * 1024 * 1024);
const VOICE_TRANSCRIPT_STORE = path.join(ROOT, 'data', 'voice-transcripts.json');
const VOICE_TRANSCRIPT_TTL_MS = Math.max(Number(process.env.VOICE_TRANSCRIPT_TTL_MS || 90 * 24 * 60 * 60 * 1000), 24 * 60 * 60 * 1000);
let FFMPEG_BIN = String(process.env.FFMPEG_PATH || '').trim();
if (!FFMPEG_BIN) { try { FFMPEG_BIN = require('ffmpeg-static') || 'ffmpeg'; } catch { FFMPEG_BIN = 'ffmpeg'; } }
const VOICE_PLAYBACK_DIR = path.join(os.tmpdir(), 'seb-gun-voice-playback-v258');
const voicePlaybackInflight = new Map();

const BS_SCREENSHOT_STATUS_COLORS = {
  'Не учитывать в лидах':'#848B8C',
  'Вступил в группу':'#3B3B3B',
  'Запустил воронку':'#3B3B3B',
  'Заявка':'#0165B0',
  'Диагностика':'#FF99CC',
  'Отправлен урок':'#008000',
  'Рассказ про курс':'#FF9900',
  'Цена озвучена':'#FF9900',
  'Принимает решение':'#FF9900',
  'Оплатил':'#0165B0',
  'Допродажа':'#008000',
  'Отказ':'#FF003A',
  'Черный список':'#000000',
  'Работа с игнором':'#848B8C',
  'Отложил покупку':'#FF99CC'
};
const BS_SCREENSHOT_MANAGER_COLORS = {
  '0.0 Даша Алексеева':'#737373',
  'Даша Алексеева':'#737373',
  '0.1 Расиль М.':'#86BA67',
  'Расиль М.':'#86BA67',
  '0.1 Гульназ У':'#FF9BA9',
  'Гульназ У':'#FF9BA9',
  '0.2 Юлия':'#B80206',
  'Юлия':'#B80206',
  '0.1 Ильгиз Ш.':'#00FF00',
  'Ильгиз Ш.':'#00FF00'
};

const sessions = new Map();
const cache = new Map();
const inflight = new Map();
const voiceTranscriptCache = new Map();
const voiceTranscriptJobs = new Map();
const recentMessageSends = new Map();
let blueSalesQueueTail = Promise.resolve();
let blueSalesQueueDepth = 0;
let blueSalesLastFinishedAt = 0;

function now() { return Date.now(); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function randomToken(bytes = 24) { return crypto.randomBytes(bytes).toString('hex'); }
const SESSION_SEAL_KEY = crypto.createHash('sha256').update(String(process.env.SESSION_SECRET || PRESET_VK_TOKEN || 'seb-gun-crm-v27-session-fallback')).digest();
function sealSessionSnapshot(session={}) {
  try {
    const payload={v:1,login:String(session.login||''),passwordHash:String(session.passwordHash||''),currentUser:session.currentUser||null,vkGroupId:session.vkGroupId||null,vkGroupName:String(session.vkGroupName||''),vkGroupScreenName:String(session.vkGroupScreenName||''),vkGroupPhoto:String(session.vkGroupPhoto||''),csrf:String(session.csrf||''),createdAt:Number(session.createdAt||now()),expiresAt:Number(session.expiresAt||now()+SESSION_TTL_MS)};
    const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',SESSION_SEAL_KEY,iv),plain=Buffer.from(JSON.stringify(payload),'utf8'),enc=Buffer.concat([cipher.update(plain),cipher.final()]),tag=cipher.getAuthTag();
    return `v1.${Buffer.concat([iv,tag,enc]).toString('base64url')}`;
  } catch { return randomToken(); }
}
function unsealSessionSnapshot(token='') {
  try {
    const raw=String(token||'');if(!raw.startsWith('v1.'))return null;const buf=Buffer.from(raw.slice(3),'base64url');if(buf.length<29)return null;const iv=buf.subarray(0,12),tag=buf.subarray(12,28),enc=buf.subarray(28),dec=crypto.createDecipheriv('aes-256-gcm',SESSION_SEAL_KEY,iv);dec.setAuthTag(tag);const payload=JSON.parse(Buffer.concat([dec.update(enc),dec.final()]).toString('utf8'));if(!payload?.login||!payload?.passwordHash||Number(payload.expiresAt||0)<now())return null;return {login:String(payload.login),passwordHash:String(payload.passwordHash),webPassword:'',currentUser:decorateUserAccess(payload.currentUser||{login:payload.login}),uiProfile:null,uiSyncState:'restored',uiSyncMessage:'Сессия восстановлена после перезапуска сервера',vkToken:PRESET_VK_TOKEN,vkGroupId:payload.vkGroupId||PRESET_VK_COMMUNITY||null,vkGroupName:String(payload.vkGroupName||'VK Сообщество'),vkGroupScreenName:String(payload.vkGroupScreenName||''),vkGroupPhoto:String(payload.vkGroupPhoto||''),csrf:String(payload.csrf||randomToken(16)),expiresAt:Number(payload.expiresAt),createdAt:Number(payload.createdAt||now()),restoredFromCookie:true};
  } catch { return null; }
}
function md5Upper(value) { return crypto.createHash('md5').update(String(value), 'utf8').digest('hex').toUpperCase(); }
function safeJson(value) { try { return JSON.stringify(value); } catch { return '{}'; } }
function normalizeClientRequestId(value=''){return String(value||'').trim().replace(/[^a-zA-Z0-9._:-]/g,'').slice(0,120)}
function stableVkRandomId(requestId=''){const b=crypto.createHash('sha256').update(String(requestId)).digest();const n=b.readUInt32BE(0)&0x7fffffff;return n||1}
function messageSendFingerprint(peerId,b={}){return crypto.createHash('sha256').update(JSON.stringify({peerId:Number(peerId)||0,message:String(b.message||'').trim(),attachment:String(b.attachment||'').trim(),stickerId:Number(b.stickerId||0),replyTo:Number(b.replyTo||0),forwardMessageIds:Array.isArray(b.forwardMessageIds)?b.forwardMessageIds:String(b.forwardMessageIds||'')})).digest('hex')}
function pruneRecentMessageSends(){const t=Date.now();for(const[k,row]of recentMessageSends)if(Number(row?.expiresAt||0)<=t)recentMessageSends.delete(k)}

function isLoopbackHost(hostname='') {
  const h=String(hostname||'').replace(/^\[|\]$/g,'').toLowerCase();
  return h==='localhost'||h==='127.0.0.1'||h==='::1'||h==='0.0.0.0';
}
function preferredLanIpv4() {
  let nets={};try{nets=os.networkInterfaces()}catch{return ''}
  const candidates=[];
  for(const [name,entries] of Object.entries(nets)){
    for(const n of entries||[]){
      if(n.family!=='IPv4'||n.internal)continue;
      const a=String(n.address||'');
      const virtualBySubnet=/^192\.168\.56\./.test(a)||/^169\.254\./.test(a);
      const virtualByName=/virtual|vmware|vbox|host-only|hyper-v|wsl|vethernet|loopback|tailscale/i.test(name);
      if(virtualBySubnet||virtualByName)continue;
      const privateIp=/^10\./.test(a)||/^192\.168\./.test(a)||/^172\.(1[6-9]|2\d|3[01])\./.test(a);
      candidates.push({address:a,privateIp});
    }
  }
  return (candidates.find(x=>x.privateIp)||candidates[0]||{}).address||'';
}
function shareBaseUrl(req) {
  if(PUBLIC_BASE_URL){
    try{return new URL(PUBLIC_BASE_URL).toString().replace(/\/$/,'')}catch{}
  }
  const host=String(req?.headers?.host||`localhost:${PORT}`);
  let hostname=host;
  try{hostname=new URL(`http://${host}`).hostname}catch{}
  const protocol=req?.socket?.encrypted?'https':'http';
  if(!isLoopbackHost(hostname))return `${protocol}://${host}`;
  const lan=preferredLanIpv4();
  return lan?`http://${lan}:${PORT}`:`${protocol}://${host}`;
}
function safeUiDetails(value){
  if(value==null)return '';
  const raw=typeof value==='string'?value:safeJson(value);
  return raw.replace(/[\r\n\t]+/g,' ').slice(0,500);
}

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  const out = {};
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function getSession(req) {
  const sid = parseCookies(req)[COOKIE_NAME];
  if (!sid) return null;
  let s = sessions.get(sid);
  if (!s) {
    // v27: the cookie contains an encrypted API-session snapshot. Render Free may
    // restart the Node process and wipe the in-memory Map; we can restore the
    // BlueSales API password hash without storing the plaintext password.
    s = unsealSessionSnapshot(sid);
    if (s) sessions.set(sid,s);
  }
  if (!s) return null;
  if (s.expiresAt < now()) {
    sessions.delete(sid);
    return null;
  }
  // In-memory sessions remain sliding. A restored sealed cookie keeps its fixed
  // 12h lifetime; a new login creates a new sealed cookie.
  if (!s.restoredFromCookie) s.expiresAt = now() + SESSION_TTL_MS;
  return s;
}

function sessionCookie(sid, req, maxAgeSec = Math.floor(SESSION_TTL_MS / 1000)) {
  const forwarded = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  const secure = forwarded === 'https' || process.env.COOKIE_SECURE === '1';
  return `${COOKIE_NAME}=${encodeURIComponent(sid)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`;
}

function clearSessionCookie(req) {
  const forwarded = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  const secure = forwarded === 'https' || process.env.COOKIE_SECURE === '1';
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}

function sendJson(res, status, data, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders
  });
  res.end(JSON.stringify(data));
}

function sendText(res, status, text, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': contentType, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(text);
}

async function readBody(req, limit = 1024 * 1024) {
  return await new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      body += chunk;
      if (body.length > limit) reject(Object.assign(new Error('Слишком большой запрос'), { status: 413 }));
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function readJson(req, limit = 1024 * 1024) {
  const raw = await readBody(req, limit);
  if (!raw) return {};
  try { return JSON.parse(raw); }
  catch { throw Object.assign(new Error('Некорректный JSON'), { status: 400 }); }
}

async function readBuffer(req, limit = 32 * 1024 * 1024) {
  return await new Promise((resolve, reject) => {
    const chunks=[];let total=0,done=false;
    const fail=err=>{if(done)return;done=true;reject(err)};
    req.on('data', chunk => {
      if(done)return;const b=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);total+=b.length;
      if(total>limit){fail(Object.assign(new Error('Файл больше допустимого размера'),{status:413}));return}
      chunks.push(b);
    });
    req.on('end',()=>{if(done)return;done=true;resolve(Buffer.concat(chunks,total))});
    req.on('error',fail);
  });
}

function extractBusySeconds(errorText) {
  const text = String(errorText || '');
  if (!text.includes('Другой пользователь находится онлайн под логином')) return null;
  const htmlMatch = text.match(/countdown[^>]*>\s*(\d+)\s*</i);
  if (htmlMatch) return Number(htmlMatch[1]);
  const plainMatch = text.match(/через\s+(\d+)\s+сек/i);
  if (plainMatch) return Number(plainMatch[1]);
  return 15;
}

function isBlueSalesOrganizationBusy(errorText) {
  const text = String(errorText || '');
  return /уже выполняется одно или несколько других обращений к api/i.test(text) ||
    /дождитесь завершения существующих обращений к api/i.test(text) ||
    /another api request is already/i.test(text);
}

class BlueSalesError extends Error {
  constructor(message, code = 'BLUESALES_ERROR', details = null) {
    super(message);
    this.name = 'BlueSalesError';
    this.code = code;
    this.details = details;
  }
}

function blueSalesBodySnippet(text, max = 360) {
  const raw = String(text || '').replace(/\u0000/g, '').trim();
  if (!raw) return '';
  const plain = raw
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
  return (plain || raw).slice(0, max);
}

function blueSalesHttpPost(url, data) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const body = Buffer.from(JSON.stringify(data), 'utf8');
    const transport = target.protocol === 'https:' ? https : http;
    const req = transport.request(target, {
      method: 'POST',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'identity',
        'Content-Length': String(body.length),
        'Connection': 'close'
      }
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(Buffer.from(chunk)));
      response.on('end', () => {
        resolve({
          status: Number(response.statusCode || 0),
          headers: response.headers || {},
          text: Buffer.concat(chunks).toString('utf8')
        });
      });
    });
    req.setTimeout(API_TIMEOUT_MS, () => req.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })));
    req.on('error', reject);
    req.end(body);
  });
}

async function bsCallDirect(session, command, data = null, attempt = 0) {
  const url = new URL(BS_BASE);
  url.searchParams.set('login', session.login);
  url.searchParams.set('password', session.passwordHash);
  url.searchParams.set('command', command);

  let response;
  try {
    // BlueSales' public SDK sends raw JSON bytes and does NOT set Content-Type.
    // Using native http/https here avoids fetch automatically adding text/plain.
    response = await blueSalesHttpPost(url, data);
  } catch (err) {
    if (err && (err.code === 'ETIMEDOUT' || /timeout/i.test(err.message || ''))) {
      if (attempt < MAX_BUSY_RETRIES) {
        const waitMs = 1200 + attempt * 900;
        console.warn(`[BlueSales ${command}] timeout; повтор ${attempt + 1}/${MAX_BUSY_RETRIES} через ${waitMs} мс`);
        await sleep(waitMs);
        return bsCallDirect(session, command, data, attempt + 1);
      }
      throw new BlueSalesError('BlueSales не ответил вовремя после автоматических повторов', 'TIMEOUT');
    }
    throw new BlueSalesError(`Не удалось подключиться к BlueSales: ${err.message}`, 'NETWORK');
  }

  const text = String(response.text || '').replace(/^\uFEFF/, '').trim();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = undefined; }

  if (parsed && typeof parsed === 'object' && parsed.isValid === false) {
    const errText = parsed.error || 'BlueSales отклонил запрос';
    const busySeconds = extractBusySeconds(errText);
    if (busySeconds != null && attempt < MAX_BUSY_RETRIES) {
      await sleep((Math.min(Math.max(busySeconds, 1), 60) + 1) * 1000);
      return bsCallDirect(session, command, data, attempt + 1);
    }
    if (isBlueSalesOrganizationBusy(errText)) {
      if (attempt < BS_ORG_BUSY_RETRIES) {
        const waitMs = Math.min(900 + attempt * 650, 4200);
        console.warn(`[BlueSales ${command}] API занят другим обращением; повтор ${attempt + 1}/${BS_ORG_BUSY_RETRIES} через ${waitMs} мс`);
        await sleep(waitMs);
        return bsCallDirect(session, command, data, attempt + 1);
      }
      throw new BlueSalesError('BlueSales API организации всё ещё занят другим запросом. Сервер уже выполнял автоматические повторы. Повторите действие через несколько секунд.', 'API_BUSY', errText);
    }
    if (/Неправильный логин или пароль/i.test(errText)) {
      throw new BlueSalesError('Неверный логин или пароль BlueSales', 'AUTH');
    }
    if (busySeconds != null) {
      throw new BlueSalesError('BlueSales сообщает, что этот пользователь уже занят. Для стабильной одновременной работы используйте отдельного пользователя BlueSales для API.', 'BUSY', errText);
    }
    throw new BlueSalesError(String(errText).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), 'API', parsed);
  }

  if (response.status < 200 || response.status >= 300) {
    const snippet = blueSalesBodySnippet(text);
    console.error(`[BlueSales ${command}] HTTP ${response.status}; content-type=${response.headers['content-type'] || ''}; body=${snippet || '[empty]'}`);
    throw new BlueSalesError(`BlueSales HTTP ${response.status}${snippet ? `: ${snippet}` : ''}`, 'HTTP', {
      status: response.status,
      contentType: response.headers['content-type'] || '',
      body: snippet
    });
  }

  if (parsed === undefined) {
    const snippet = blueSalesBodySnippet(text);
    console.error(`[BlueSales ${command}] non-JSON; content-type=${response.headers['content-type'] || ''}; body=${snippet || '[empty]'}`);
    throw new BlueSalesError(`BlueSales вернул ответ не в JSON${snippet ? `: ${snippet}` : ''}`, 'BAD_RESPONSE', {
      contentType: response.headers['content-type'] || '',
      body: snippet
    });
  }

  return parsed;
}

// BlueSales rejects overlapping API calls at organization level. Every BlueSales call
// from this process goes through one FIFO queue. This is intentionally global rather
// than per browser request/session because the upstream lock is organization-wide.
function bsCall(session, command, data = null) {
  const queuedAt = now();
  const job = async () => {
    blueSalesQueueDepth += 1;
    try {
      const waited = now() - queuedAt;
      if (waited >= BS_QUEUE_MAX_WAIT_MS) {
        throw new BlueSalesError('BlueSales занят другими запросами. Повторите действие через несколько секунд.', 'QUEUE_BUSY', { command, waitedMs: waited, queueDepth: blueSalesQueueDepth });
      }
      if (waited >= 1200) console.log(`[BlueSales queue] ${command} waited ${waited}ms before start`);
      const gap = Math.max(0, BS_QUEUE_GAP_MS - (now() - blueSalesLastFinishedAt));
      if (gap) await sleep(gap);
      return await bsCallDirect(session, command, data, 0);
    } finally {
      blueSalesLastFinishedAt = now();
      blueSalesQueueDepth = Math.max(0, blueSalesQueueDepth - 1);
    }
  };
  const result = blueSalesQueueTail.then(job, job);
  blueSalesQueueTail = result.catch(() => undefined);
  return result;
}

async function cachedLoad(key, ttl, loader) {
  const cached = cacheGet(key);
  if (cached !== null && cached !== undefined) return cached;
  if (inflight.has(key)) return inflight.get(key);
  const promise = Promise.resolve().then(loader).then(value => {
    cacheSet(key, value, ttl);
    return value;
  }).finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

class VkApiError extends Error {
  constructor(message, code = 'VK_ERROR', details = null) {
    super(message);
    this.name = 'VkApiError';
    this.code = code;
    this.details = details;
  }
}

async function vkCall(token, method, params = {}) {
  if (!token) throw new VkApiError('VK не подключён. Войдите заново и укажите новый ключ сообщества.', 'VK_NOT_CONNECTED');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) body.set(key, value.join(','));
    else body.set(key, String(value));
  }
  body.set('access_token', token);
  body.set('v', VK_API_VERSION);
  let response;
  try {
    response = await fetch(`${VK_API_BASE}${encodeURIComponent(method)}`, {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8' },
      body,
      signal: controller.signal
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err?.name === 'AbortError') throw new VkApiError('VK API не ответил вовремя', 'VK_TIMEOUT');
    throw new VkApiError(`Не удалось подключиться к VK API: ${err.message}`, 'VK_NETWORK');
  }
  clearTimeout(timeout);
  const text = await response.text();
  if (!response.ok) throw new VkApiError(`VK API HTTP ${response.status}`, 'VK_HTTP', text.slice(0, 800));
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { throw new VkApiError('VK API вернул ответ не в JSON', 'VK_BAD_RESPONSE', text.slice(0, 800)); }
  if (parsed?.error) {
    const e = parsed.error;
    const code = Number(e.error_code || 0);
    const msg = String(e.error_msg || 'VK API error');
    if (code === 5) throw new VkApiError('Ключ VK недействителен или был отозван. Создайте новый ключ сообщества.', 'VK_AUTH', e);
    if (code === 7 || code === 15) throw new VkApiError('У ключа VK недостаточно прав. Нужен доступ к сообщениям сообщества.', 'VK_PERMISSIONS', e);
    if (code === 6) throw new VkApiError('VK API временно ограничил частоту запросов. Повторите через несколько секунд.', 'VK_RATE_LIMIT', e);
    throw new VkApiError(`VK API: ${msg}`, `VK_${code || 'ERROR'}`, e);
  }
  return parsed?.response;
}

function normalizeVkCommunityHint(value) {
  let raw = String(value || '').trim();
  if (!raw) return { groupId: 0, screenName: '' };
  const numeric = raw.match(/^-?\d+$/);
  if (numeric) return { groupId: Math.abs(Number(raw) || 0), screenName: '' };
  raw = raw.replace(/^https?:\/\/(?:www\.)?(?:vk\.com|vk\.ru)\//i, '');
  raw = raw.split(/[?#/]/)[0].trim();
  raw = raw.replace(/^club(?=\d+$)/i, '');
  if (/^\d+$/.test(raw)) return { groupId: Math.abs(Number(raw) || 0), screenName: '' };
  return { groupId: 0, screenName: raw.replace(/^@/, '') };
}

async function probeVk(token, groupHint = null) {
  const hint = normalizeVkCommunityHint(groupHint);
  let group = null;
  let resolvedGroupId = hint.groupId || 0;

  // Resolve the configured vk.ru/<screen_name> once on the server.
  try {
    const gp = { fields: 'photo_100,screen_name' };
    if (resolvedGroupId) gp.group_ids = String(resolvedGroupId);
    else if (hint.screenName) gp.group_ids = hint.screenName;
    const raw = await vkCall(token, 'groups.getById', gp);
    const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.groups) ? raw.groups : []);
    group = list[0] || null;
    if (group?.id) resolvedGroupId = Number(group.id) || resolvedGroupId;
  } catch (err) {
    // If the token itself is valid, messages.getConversations below will return the useful error.
    if (!resolvedGroupId && hint.screenName) {
      throw new VkApiError(`Не удалось определить VK-сообщество ${hint.screenName}: ${err.message}`, err.code || 'VK_GROUP_RESOLVE', err.details || null);
    }
  }

  const params = { count: 1, extended: 1, fields: 'photo_100' };
  if (resolvedGroupId) params.group_id = resolvedGroupId;
  const conv = await vkCall(token, 'messages.getConversations', params);

  return {
    groupId: Number(group?.id || resolvedGroupId || 0) || null,
    groupName: String(group?.name || hint.screenName || 'VK Сообщество'),
    groupScreenName: String(group?.screen_name || hint.screenName || ''),
    groupPhoto: String(group?.photo_100 || ''),
    conversationsCount: Number(conv?.count || 0)
  };
}

function vkIdentityMaps(raw) {
  const profiles = new Map();
  for (const p of raw?.profiles || []) profiles.set(Number(p.id), p);
  const groups = new Map();
  for (const g of raw?.groups || []) groups.set(Number(g.id), g);
  return { profiles, groups };
}

function vkNameForPeer(peer, conversation, maps) {
  const id = Number(peer?.id || 0);
  if (peer?.type === 'user') {
    const p = maps.profiles.get(id);
    return p ? `${p.first_name || ''} ${p.last_name || ''}`.trim() || `VK ${id}` : `VK ${id}`;
  }
  if (peer?.type === 'group') {
    const g = maps.groups.get(Math.abs(id));
    return g?.name || `Сообщество ${Math.abs(id)}`;
  }
  if (peer?.type === 'chat') return conversation?.chat_settings?.title || `Беседа ${peer?.local_id || id}`;
  return `Диалог ${id}`;
}

function vkAvatarForPeer(peer, conversation, maps) {
  const id = Number(peer?.id || 0);
  if (peer?.type === 'user') return String(maps.profiles.get(id)?.photo_100 || '');
  if (peer?.type === 'group') return String(maps.groups.get(Math.abs(id))?.photo_100 || '');
  if (peer?.type === 'chat') return String(conversation?.chat_settings?.photo?.photo_100 || '');
  return '';
}

function bestPhotoMeta(photo) {
  const sizes = Array.isArray(photo?.sizes) ? photo.sizes : [];
  const sorted = [...sizes].sort((a, b) => (Number(b.width || 0) * Number(b.height || 0)) - (Number(a.width || 0) * Number(a.height || 0)));
  const best = sorted[0] || {};
  return {
    url: String(best?.url || photo?.photo_807 || photo?.photo_604 || photo?.photo_130 || ''),
    width: Number(best?.width || photo?.width || 0),
    height: Number(best?.height || photo?.height || 0)
  };
}
function bestPhotoUrl(photo) { return bestPhotoMeta(photo).url; }

function stickerUrl(x) {
  const plain = Array.isArray(x?.images) ? [...x.images] : [];
  const withBg = Array.isArray(x?.images_with_background) ? [...x.images_with_background] : [];
  const bySize = rows => [...rows].sort((a,b)=>(Number(b.width||0)*Number(b.height||0))-(Number(a.width||0)*Number(a.height||0)));
  const best = bySize(plain)[0]?.url || bySize(withBg)[0]?.url || x?.animation_url || x?.photo_512 || x?.photo_352 || x?.photo_256 || x?.photo_128 || x?.photo_64 || '';
  if (best) return String(best);
  const stickerId = Number(x?.sticker_id || 0);
  return stickerId > 0 ? `https://vk.com/sticker/1-${stickerId}-512` : '';
}

function compactPersonName(name) {
  const raw = String(name || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  // BlueSales manager labels such as "0.1 Анастасия Ф." are already compact.
  if (/^\d+(?:\.\d+)?\s+/.test(raw)) return raw;
  const parts = raw.split(' ').filter(Boolean);
  if (parts.length < 2) return raw;
  return `${parts[0]} ${Array.from(parts[1])[0] || ''}.`.trim();
}

function parseCrmMessagePayload(payload) {
  if (!payload) return null;
  let value = payload;
  try { if (typeof value === 'string') value = JSON.parse(value); } catch { return null; }
  if (!value || typeof value !== 'object') return null;
  const mark = value.seb_gun_crm || value.sebGunCrm || value.sebGunCRM;
  if (!mark || typeof mark !== 'object') return null;
  const author = String(mark.author || mark.authorName || mark.name || '').trim();
  if (!author) return null;
  return { author, version: String(mark.version || mark.v || '') };
}

function audioMessageFromDoc(x) {
  const audio = x?.preview?.audio_msg || x?.preview?.audioMessage || null;
  if (!audio) return null;
  return {
    type: 'audio_message',
    url: String(audio.link_mp3 || audio.link_ogg || x?.url || ''),
    title: 'Голосовое сообщение',
    duration: Number(audio.duration || 0),
    transcript: String(audio.transcript || x?.transcript || ''),
    transcriptState: String(audio.transcript_state || x?.transcript_state || ''),
    transcriptError: Number(audio.transcript_error || x?.transcript_error || 0),
    waveform: Array.isArray(audio.waveform) ? audio.waveform : [],
    sourceType: 'doc',
    docId: Number(x?.id || 0),
    ownerId: Number(x?.owner_id || 0)
  };
}

function normalizeVkAttachments(list) {
  if (!Array.isArray(list)) return [];
  return list.map(a => {
    const type = String(a?.type || '');
    const x = a?.[type] || {};
    if (type === 'photo') {
      const pm=bestPhotoMeta(x);
      return { type, url: pm.url, preview: pm.url, title: 'Фото', width: pm.width, height: pm.height };
    }
    if (type === 'sticker') {
      const rows=[...(Array.isArray(x?.images)?x.images:[]),...(Array.isArray(x?.images_with_background)?x.images_with_background:[])].filter(Boolean);
      rows.sort((a,b)=>(Number(b?.width||0)*Number(b?.height||0))-(Number(a?.width||0)*Number(a?.height||0)));
      const sm=rows[0]||{};
      return { type, url: stickerUrl(x), preview: stickerUrl(x), title: 'Стикер', stickerId: Number(x?.sticker_id || 0), width:Number(sm.width||0), height:Number(sm.height||0) };
    }
    if (type === 'doc') {
      const voice = audioMessageFromDoc(x);
      if (voice) return voice;
      return { type, url: String(x?.url || ''), preview: String(x?.preview?.photo?.sizes?.slice?.(-1)?.[0]?.src || ''), title: String(x?.title || 'Документ'), ext: String(x?.ext || '') };
    }
    if (type === 'video') {
      const owner = Number(x?.owner_id || 0), id = Number(x?.id || 0);
      const external = owner && id ? `https://vk.com/video${owner}_${id}` : '';
      const images=Array.isArray(x?.image)?[...x.image]:[];
      images.sort((a,b)=>(Number(b?.width||0)*Number(b?.height||0))-(Number(a?.width||0)*Number(a?.height||0)));
      const vm=images[0]||{};
      return { type, url: external, preview: String(vm.url || ''), title: String(x?.title || 'Видео'), width:Number(vm.width||0), height:Number(vm.height||0) };
    }
    if (type === 'audio_message') return {
      type,
      url: String(x?.link_mp3 || x?.link_ogg || ''),
      title: 'Голосовое сообщение',
      duration: Number(x?.duration || 0),
      transcript: String(x?.transcript || ''),
      transcriptState: String(x?.transcript_state || ''),
      transcriptError: Number(x?.transcript_error || 0),
      waveform: Array.isArray(x?.waveform) ? x.waveform : [],
      sourceType: 'audio_message',
      docId: Number(x?.id || 0),
      ownerId: Number(x?.owner_id || 0)
    };
    if (type === 'link') return { type, url: String(x?.url || ''), preview: String(x?.photo ? bestPhotoUrl(x.photo) : ''), title: String(x?.title || x?.caption || x?.url || 'Ссылка') };
    return { type, url: '', title: type || 'Вложение' };
  }).filter(a => a.type);
}

function normalizeVkMessage(m, maps) {
  const from = Number(m?.from_id || 0);
  const out = Number(m?.out || 0) === 1;
  const adminAuthorId = Number(m?.admin_author_id || 0);
  let author = '';
  if (from > 0) {
    const p = maps.profiles.get(from);
    author = p ? `${p.first_name || ''} ${p.last_name || ''}`.trim() : `VK ${from}`;
  } else if (from < 0) author = maps.groups.get(Math.abs(from))?.name || `Сообщество ${Math.abs(from)}`;

  const crmMark = parseCrmMessagePayload(m?.payload);
  let displayAuthor = author;
  let authorSource = out ? 'vk' : 'client';
  if (out && crmMark?.author) {
    displayAuthor = crmMark.author;
    authorSource = 'crm';
  } else if (out) {
    const admin = maps.profiles.get(adminAuthorId);
    const adminName = admin ? `${admin.first_name || ''} ${admin.last_name || ''}`.trim() : '';
    displayAuthor = `VK ${compactPersonName(adminName || VK_DIRECT_AUTHOR)}`.trim();
    authorSource = 'vk';
  }

  return {
    id: String(m?.id ?? m?.conversation_message_id ?? ''),
    conversationMessageId: Number(m?.conversation_message_id || 0),
    peerId: Number(m?.peer_id || 0),
    fromId: from,
    adminAuthorId,
    author,
    displayAuthor,
    authorSource,
    crmAuthor: crmMark?.author || '',
    text: String(m?.text || ''),
    date: Number(m?.date || 0),
    out,
    payload: m?.payload || '',
    attachments: normalizeVkAttachments(m?.attachments),
    reply: m?.reply_message ? normalizeVkMessage(m.reply_message, maps) : null
  };
}

async function enrichVkMapsWithAdminAuthors(session, raw, maps = vkIdentityMaps(raw || {})) {
  const ids = [];
  const seen = new Set(maps.profiles.keys());
  const walk = message => {
    if (!message || typeof message !== 'object') return;
    const id = Number(message.admin_author_id || 0);
    if (id > 0 && !seen.has(id)) { seen.add(id); ids.push(id); }
    if (message.reply_message) walk(message.reply_message);
    for (const x of (message.fwd_messages || [])) walk(x);
  };
  for (const item of (raw?.items || [])) walk(item);
  if (!ids.length) return maps;
  try {
    const users = await vkCall(session.vkToken, 'users.get', { user_ids: ids.slice(0, 500).join(','), fields: 'photo_100,screen_name' });
    for (const p of (Array.isArray(users) ? users : [])) maps.profiles.set(Number(p.id), p);
  } catch (err) {
    console.warn('[VK admin authors]', err?.message || err);
  }
  return maps;
}

function messageVoiceAttachment(message) {
  return (message?.attachments || []).find(a => a?.type === 'audio_message') || null;
}

function normalizeDialogSearchText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}@+._-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractPeerIdFromDialogSearch(query) {
  const raw = String(query || '').trim();
  if (!raw) return 0;
  const patterns = [
    /(?:[?&]dialog=|#\/?dialog\/|\/dialog\/|\/convo\/|[?&]peer_id=)(-?\d+)/i,
    /(?:vk\.(?:com|ru)\/id)(\d+)/i
  ];
  for (const re of patterns) {
    const m = raw.match(re);
    if (m) return Number(m[1]) || 0;
  }
  return /^-?\d{5,}$/.test(raw) ? Number(raw) : 0;
}

function dialogSearchScore(query, values = []) {
  const q = normalizeDialogSearchText(query);
  if (!q) return 1;
  const qDigits = q.replace(/\D/g, '');
  const tokens = q.split(' ').filter(Boolean);
  let best = 0;
  for (const value of values) {
    const v = normalizeDialogSearchText(value);
    if (!v) continue;
    if (v === q) best = Math.max(best, 1000);
    else if (v.startsWith(q)) best = Math.max(best, 800);
    else if (v.includes(q)) best = Math.max(best, 650);
    const words = v.split(' ').filter(Boolean);
    if (tokens.length && tokens.every(t => words.some(w => w === t || w.startsWith(t)) || v.includes(t))) {
      best = Math.max(best, 500 + tokens.length * 10);
    }
    if (qDigits.length >= 5) {
      const d = v.replace(/\D/g, '');
      if (d === qDigits) best = Math.max(best, 950);
      else if (d.includes(qDigits)) best = Math.max(best, 700);
    }
  }
  return best;
}

function customerDialogSearchValues(c) {
  return [
    c?.fullName, c?.phone, c?.email, c?.social?.vkId, c?.social?.vkName,
    c?.raw?.vkName, c?.raw?.screenName
  ];
}

function dialogSearchValues(d) {
  return [d?.name, d?.peerId, d?.crm?.fullName, d?.crm?.phone, d?.crm?.email, d?.crm?.vkId];
}

function sortDialogsBySearchScore(dialogs, query) {
  return (dialogs || [])
    .map((d, i) => ({d, i, score: dialogSearchScore(query, dialogSearchValues(d))}))
    .filter(x => x.score > 0)
    .sort((a,b) => b.score - a.score || a.i - b.i)
    .map(x => x.d);
}

function normalizeVkDialog(item, maps) {
  const c = item?.conversation || {};
  const peer = c?.peer || {};
  const m = item?.last_message || {};
  return {
    id: String(peer?.id || ''),
    peerId: Number(peer?.id || 0),
    peerType: String(peer?.type || ''),
    name: vkNameForPeer(peer, c, maps),
    avatar: vkAvatarForPeer(peer, c, maps),
    unreadCount: Number(c?.unread_count || 0),
    lastMessage: String(m?.text || ''),
    lastMessageAt: Number(m?.date || 0),
    lastMessageOut: Number(m?.out || 0) === 1,
    lastMessageAuthorId: Number(m?.from_id || 0),
    crm: null
  };
}

function normalizeVkConversation(c, maps) {
  const conversation = c?.conversation || c || {};
  const peer = conversation?.peer || {};
  return {
    id: String(peer?.id || ''),
    peerId: Number(peer?.id || 0),
    peerType: String(peer?.type || ''),
    name: vkNameForPeer(peer, conversation, maps),
    avatar: vkAvatarForPeer(peer, conversation, maps),
    unreadCount: Number(conversation?.unread_count || 0),
    lastMessage: '',
    lastMessageAt: 0,
    lastMessageOut: false,
    lastMessageAuthorId: 0,
    crm: null
  };
}

function arrayFromResponse(raw, keys) {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== 'object') return [];
  for (const key of keys) if (Array.isArray(raw[key])) return raw[key];
  if (Array.isArray(raw.items)) return raw.items;
  if (Array.isArray(raw.data)) return raw.data;
  return [];
}

function firstDefined(obj, keys, fallback = '') {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k];
  }
  return fallback;
}

function objectName(v) {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (typeof v === 'object') return String(v.name ?? v.fullName ?? v.login ?? v.title ?? v.id ?? '');
  return '';
}


function normalizeCssColor(value) {
  const direct = BlueSalesWeb.normalizeColor(value);
  if (direct) return direct;
  return '';
}

function colorFromObject(value, depth = 0) {
  if (value == null || depth > 3) return '';
  if (typeof value === 'string') return normalizeCssColor(value);
  if (typeof value !== 'object') return '';
  const priority = ['color','colour','backgroundColor','background_color','bgColor','labelColor','textColor','htmlColor','cssColor'];
  for (const key of priority) {
    if (value[key] != null) {
      const c = normalizeCssColor(value[key]);
      if (c) return c;
    }
  }
  for (const [key,v] of Object.entries(value)) {
    if (/color|colour|background/i.test(key)) {
      const c = normalizeCssColor(v);
      if (c) return c;
    }
  }
  for (const key of ['style','settings','meta','ui','display']) {
    if (value[key] && typeof value[key] === 'object') {
      const c = colorFromObject(value[key], depth + 1);
      if (c) return c;
    }
  }
  return '';
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags.map(t => typeof t === 'string' ? { name: t, color: '', textColor:'' } : {
    id: t?.id ?? null,
    name: String(t?.name ?? t?.title ?? t?.tagName ?? ''),
    color: colorFromObject(t),
    textColor: String(t?.textColor ?? t?.text_color ?? '')
  }).filter(t => t.name);
}

function normalizeCustomer(c) {
  const vk = c?.vk || c?.vkontakte || {};
  const tg = c?.telegram || {};
  const wa = c?.whatsApp || c?.whatsapp || {};
  return {
    id: String(firstDefined(c, ['id', 'customerId', 'customerID'], '')),
    fullName: String(firstDefined(c, ['fullName', 'name', 'fio'], 'Без имени')),
    phone: String(firstDefined(c, ['phone', 'mobilePhone', 'mobile'], '')),
    email: String(firstDefined(c, ['email', 'eMail'], '')),
    country: objectName(c?.country),
    city: objectName(c?.city),
    crmStatus: objectName(c?.crmStatus || c?.status),
    crmStatusColor: colorFromObject(c?.crmStatus || c?.status),
    manager: objectName(c?.manager),
    managerColor: colorFromObject(c?.manager),
    managerLogin: String(c?.manager?.login ?? ''),
    firstContactDate: String(firstDefined(c, ['firstContactDate', 'dateFirstContact'], '')),
    lastContactDate: String(firstDefined(c, ['lastContactDate', 'dateLastContact'], '')),
    nextContactDate: String(firstDefined(c, ['nextContactDate', 'dateNextContact'], '')),
    shortNotes: String(firstDefined(c, ['shortNotes', 'note', 'notes'], '')),
    comments: String(firstDefined(c, ['comments', 'comment'], '')),
    source: objectName(c?.source),
    salesChannel: objectName(c?.salesChannel),
    tags: normalizeTags(c?.tags),
    social: {
      vkId: String(vk?.id ?? c?.vkId ?? ''),
      telegramId: String(tg?.id ?? c?.telegramId ?? ''),
      telegramLogin: String(tg?.login ?? ''),
      whatsappId: String(wa?.id ?? c?.whatsAppId ?? '')
    },
    raw: c
  };
}

function normalizeOrder(o) {
  const positions = Array.isArray(o?.goodsPositions) ? o.goodsPositions : (Array.isArray(o?.positions) ? o.positions : []);
  return {
    id: String(firstDefined(o, ['id', 'orderId'], '')),
    internalNumber: String(firstDefined(o, ['internalNumber', 'number'], '')),
    date: String(firstDefined(o, ['date', 'orderDate'], '')),
    status: objectName(o?.orderStatus || o?.status),
    manager: objectName(o?.manager),
    sum: Number(firstDefined(o, ['sum', 'total', 'totalSum'], 0)) || 0,
    prepay: Number(firstDefined(o, ['prepay', 'prepayment'], 0)) || 0,
    discount: Number(firstDefined(o, ['discount'], 0)) || 0,
    comments: String(firstDefined(o, ['internalComments', 'comments'], '')),
    positions: positions.map(p => ({
      id: p?.id ?? null,
      name: objectName(p?.goods || p?.product) || String(p?.name ?? ''),
      marking: String(p?.goods?.marking ?? p?.marking ?? ''),
      quantity: Number(p?.quantity ?? 1) || 1,
      price: Number(p?.price ?? 0) || 0,
      size: String(p?.size ?? '')
    })),
    raw: o
  };
}


function servicesFilePath(){return path.join(ROOT,'data','services.json')}
function loadServiceCatalog(){
  try{
    const raw=JSON.parse(fs.readFileSync(servicesFilePath(),'utf8'));
    const rows=Array.isArray(raw)?raw:(Array.isArray(raw.services)?raw.services:[]);
    return rows.map((x,i)=>({
      id:String(x.id??x.marking??`service-${i+1}`),
      marking:String(x.marking??x.article??''),
      name:String(x.name??x.title??''),
      defaultPrice:Number(x.defaultPrice??x.price??0)||0,
      active:x.active!==false
    })).filter(x=>x.name||x.marking);
  }catch{return[]}
}

function normalizeUser(u) {
  return {
    id: String(firstDefined(u, ['id', 'userId'], '')),
    name: String(firstDefined(u, ['name', 'fullName', 'fio'], '')),
    login: String(firstDefined(u, ['login', 'email'], '')),
    color: colorFromObject(u),
    raw: u
  };
}

function customerPageMeta(raw, list) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { count: list.length, notReturnedCount: 0 };
  return {
    count: Number(raw.count ?? raw.returnedCount ?? list.length) || list.length,
    notReturnedCount: Number(raw.notReturnedCount ?? raw.not_returned_count ?? raw.notReturned ?? 0) || 0
  };
}

async function getCustomersPage(session, { count = 100, offset = 0, ids, vkIds, phone, nextFrom, nextTo, managers, tags, sources } = {}) {
  const safeCount = Math.min(Math.max(Number(count) || BLUESALES_PAGE_SIZE, 1), BLUESALES_PAGE_SIZE);
  const payload = {
    firstContactDateFrom: null,
    firstContactDateTill: null,
    nextContactDateFrom: nextFrom || null,
    nextContactDateTill: nextTo || null,
    lastContactDateFrom: null,
    lastContactDateTill: null,
    ids: Array.isArray(ids) && ids.length ? ids.map(Number).filter(Number.isFinite) : null,
    vkIds: Array.isArray(vkIds) && vkIds.length ? vkIds.map(Number).filter(Number.isFinite) : null,
    pageSize: safeCount,
    startRowNumber: Math.max(Number(offset) || 0, 0),
    tags: Array.isArray(tags) && tags.length ? tags.map(String).filter(Boolean) : [],
    managers: Array.isArray(managers) && managers.length ? managers.map(x => /^\d+$/.test(String(x)) ? Number(x) : String(x)).filter(Boolean) : [],
    sources: Array.isArray(sources) && sources.length ? sources : null,
    phone: phone ? String(phone).replace(/\D/g, '') : null
  };
  const raw = await bsCall(session, 'customers.get', payload);
  const source = arrayFromResponse(raw, ['customers', 'Customers']);
  const customers = source.map(normalizeCustomer);
  return { raw, customers, ...customerPageMeta(raw, customers) };
}

async function getAllCustomers(session, maxRows) {
  const safeMax = Math.max(1, Number(maxRows) || SEARCH_SCAN_LIMIT);
  const cacheKey = `${session.login}:customers-all:${safeMax}`;
  return cachedLoad(cacheKey, Math.max(CACHE_TTL_MS, 60000), async () => {
    const out = [];
    let offset = 0;
    while (out.length < safeMax) {
      const take = Math.min(BLUESALES_PAGE_SIZE, safeMax - out.length);
      const page = await getCustomersPage(session, { count: take, offset });
      out.push(...page.customers);
      if (!page.customers.length) break;
      offset += page.customers.length;
      if (page.notReturnedCount <= 0) break;
      if (page.customers.length < take && page.notReturnedCount <= 0) break;
    }
    return out;
  });
}

async function getAllCustomersComplete(session) {
  const cacheKey = `${session.login}:customers-complete:v23`;
  return cachedLoad(cacheKey, Math.max(CACHE_TTL_MS, 90000), async () => {
    const out = [];
    let offset = 0;
    for (;;) {
      const page = await getCustomersPage(session, { count: BLUESALES_PAGE_SIZE, offset });
      out.push(...page.customers);
      if (!page.customers.length || page.notReturnedCount <= 0) break;
      offset += page.customers.length;
      if (offset > 250000) break;
    }
    return out;
  });
}
function sameText(a,b){return String(a??'').trim().toLocaleLowerCase('ru-RU')===String(b??'').trim().toLocaleLowerCase('ru-RU')}
function multiParamValues(value){return [...new Set(String(value||'').split(',').map(v=>v.trim()).filter(Boolean))]}
function customerHasTag(c,tag){const values=multiParamValues(tag);if(!values.length)return true;return values.some(v=>(c.tags||[]).some(t=>sameText(t?.name??t,v)))}
function customerMatchesManager(c,manager){const values=multiParamValues(manager);if(!values.length)return true;return values.some(v=>sameText(c.manager,v)||sameText(c.managerLogin,v))}
function customerMatchesStatus(c,status){const values=multiParamValues(status);if(!values.length)return true;return values.some(v=>sameText(c.crmStatus,v))}

async function getCustomersByNextContactRange(session, nextFrom = null, nextTo = null) {
  const key = `${session.login}:next-contact:${nextFrom || '*'}:${nextTo || '*'}`;
  return cachedLoad(key, Math.max(CACHE_TTL_MS, 60000), async () => {
    const out = [];
    let offset = 0;
    // BlueSales customers.get allows max 500 per page. There is no artificial
    // total limit here: continue until notReturnedCount reaches zero.
    for (;;) {
      const page = await getCustomersPage(session, {
        count: BLUESALES_PAGE_SIZE, offset, nextFrom, nextTo
      });
      out.push(...page.customers);
      if (!page.customers.length || page.notReturnedCount <= 0) break;
      offset += page.customers.length;
      if (page.customers.length < 1) break;
    }
    return out;
  });
}

function cachedCustomerById(session, id) {
  const n = String(id);
  for (const [key, entry] of cache.entries()) {
    if (!key.startsWith(`${session.login}:customers-all:`) || !entry || entry.expiresAt < now() || !Array.isArray(entry.value)) continue;
    const hit = entry.value.find(c => String(c.id) === n);
    if (hit) return hit;
  }
  return null;
}

function cachedCustomerByVkId(session, vkId) {
  const n = String(vkId);
  for (const [key, entry] of cache.entries()) {
    if (!key.startsWith(`${session.login}:customers-all:`) || !entry || entry.expiresAt < now() || !Array.isArray(entry.value)) continue;
    const hit = entry.value.find(c => String(c.social?.vkId || '') === n);
    if (hit) return hit;
  }
  return null;
}

async function getCustomerById(session, id) {
  const cached = cachedCustomerById(session, id);
  if (cached) return cached;
  const key = `${session.login}:customer-id:${id}`;
  return cachedLoad(key, 60000, async () => {
    const page = await getCustomersPage(session, { count: 10, ids: [id] });
    return page.customers.find(c => Number(c.id) === Number(id)) || page.customers[0] || null;
  });
}

async function getCustomerByVkId(session, vkId) {
  const cached = cachedCustomerByVkId(session, vkId);
  if (cached) return cached;
  const key = `${session.login}:customer-vk:${vkId}`;
  return cachedLoad(key, 60000, async () => {
    const page = await getCustomersPage(session, { count: 10, vkIds: [vkId] });
    return page.customers.find(c => Number(c.social?.vkId) === Number(vkId)) || page.customers[0] || null;
  });
}

async function getCustomersByVkIds(session, vkIds) {
  const ids = [...new Set((vkIds || []).map(Number).filter(Number.isFinite))].sort((a,b)=>a-b);
  if (!ids.length) return [];
  const cachedHits = ids.map(id => cachedCustomerByVkId(session, id)).filter(Boolean);
  if (cachedHits.length === ids.length) return cachedHits;
  const key = `${session.login}:customers-vk:${ids.join(',')}`;
  return cachedLoad(key, 45000, async () => {
    const page = await getCustomersPage(session, { count: Math.min(BLUESALES_PAGE_SIZE, Math.max(ids.length, 1)), vkIds: ids });
    return page.customers;
  });
}

function cacheGet(key) {
  const v = cache.get(key);
  if (!v || v.expiresAt < now()) { cache.delete(key); return null; }
  return v.value;
}
function cacheSet(key, value, ttl = CACHE_TTL_MS) { cache.set(key, { value, expiresAt: now() + ttl }); return value; }
function clearCachePrefix(prefix) {
  for (const key of cache.keys()) if (key.startsWith(prefix)) cache.delete(key);
  for (const key of inflight.keys()) if (key.startsWith(prefix)) inflight.delete(key);
}
function clearOrdersCache(login, customerId = '') {
  const base = `${login}:orders:`;
  if (!customerId) return clearCachePrefix(base);
  // There can be several limit/offset variants for one customer.
  clearCachePrefix(`${base}${Number(customerId) || customerId}:`);
}
function clearAccountCache(login) {
  clearCachePrefix(`${login}:`);
}

const appClockFormatters = new Map();
function appClockParts(ms = Date.now(), timeZone = APP_TIMEZONE) {
  const tz = String(timeZone || APP_TIMEZONE);
  let fmt = appClockFormatters.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23' });
    appClockFormatters.set(tz, fmt);
  }
  const out = { year:0, month:0, day:0, hour:0, minute:0, second:0 };
  for (const p of fmt.formatToParts(new Date(ms))) if (p.type in out) out[p.type] = Number(p.value);
  out.ymd = `${String(out.year).padStart(4,'0')}-${String(out.month).padStart(2,'0')}-${String(out.day).padStart(2,'0')}`;
  out.hhmm = `${String(out.hour).padStart(2,'0')}:${String(out.minute).padStart(2,'0')}`;
  out.minutes = out.hour * 60 + out.minute;
  return out;
}
function addYmd(ymd, days = 0) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2])-1, Number(m[3]) + Number(days || 0)));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
}
function appClockPayload(ms = Date.now()) {
  const p = appClockParts(ms);
  return { timezone:APP_TIMEZONE, nowIso:new Date(ms).toISOString(), localDate:p.ymd, localTime:p.hhmm, localDateTime:`${p.ymd} ${p.hhmm}` };
}
function ymdLocal(date = new Date()) { return appClockParts(date instanceof Date ? date.getTime() : Number(date) || Date.now()).ymd; }

function parseLooseDate(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (/T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)) {
    const zoned = new Date(raw);
    if (!Number.isNaN(zoned.getTime())) { const p=appClockParts(zoned.getTime()); return { ymd:p.ymd, hour:p.hour, minute:p.minute, second:p.second, hasTime:true, raw }; }
  }
  let m = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return { ymd:`${m[1]}-${m[2]}-${m[3]}`, hour:Number(m[4]||0), minute:Number(m[5]||0), second:Number(m[6]||0), hasTime:Boolean(m[4] != null), raw };
  m = raw.match(/^(\d{2})[.\/-](\d{2})[.\/-](\d{4})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return { ymd:`${m[3]}-${m[2]}-${m[1]}`, hour:Number(m[4]||0), minute:Number(m[5]||0), second:Number(m[6]||0), hasTime:Boolean(m[4] != null), raw };
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  const p = appClockParts(d.getTime());
  return { ymd:p.ymd, hour:p.hour, minute:p.minute, second:p.second, hasTime:/[T\s]\d{1,2}:\d{2}/.test(raw), raw };
}
function dateKey(value) { const p = parseLooseDate(value); return p ? `${p.ymd} ${String(p.hour).padStart(2,'0')}:${String(p.minute).padStart(2,'0')}` : ''; }
function reminderBucketFor(value, nowMs = Date.now()) {
  const r = parseLooseDate(value); if (!r) return '';
  const n = appClockParts(nowMs), tomorrow = addYmd(n.ymd, 1);
  if (r.ymd < n.ymd) return 'overdue';
  if (r.ymd === n.ymd) { if (r.hasTime && (r.hour*60+r.minute) < n.minutes) return 'overdue'; return 'today'; }
  if (r.ymd === tomorrow) return 'tomorrow';
  return 'future';
}

function matchesCustomer(c, q) {
  const needle = String(q || '').trim().toLowerCase();
  if (!needle) return true;
  const hay = [c.fullName, c.phone, c.email, c.city, c.crmStatus, c.manager, c.social.vkId, c.social.telegramId, ...c.tags.map(t => t.name)].join(' ').toLowerCase();
  return hay.includes(needle);
}



function isAllowedMediaHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  const exact = new Set(['vk.com','www.vk.com','vk.ru','www.vk.ru','vk.me','www.vk.me']);
  if (exact.has(h)) return true;
  const suffixes = ['.userapi.com','.vkuserphoto.ru','.vkuseraudio.net','.vkuserlive.net','.vkcdn.ru','.vk-cdn.net'];
  return suffixes.some(s => h.endsWith(s)) || ['userapi.com','vkuserphoto.ru','vkuseraudio.net','vkuserlive.net','vkcdn.ru','vk-cdn.net'].includes(h);
}

function transcriptCacheKey(peerId, conversationMessageId) {
  return `${Number(peerId)||0}:${Number(conversationMessageId)||0}`;
}
let voiceTranscriptSaveTimer=null;
function loadVoiceTranscriptStore() {
  try {
    if (!fs.existsSync(VOICE_TRANSCRIPT_STORE)) return;
    const parsed=JSON.parse(fs.readFileSync(VOICE_TRANSCRIPT_STORE,'utf8'));
    const rows=parsed && typeof parsed==='object' ? (parsed.items||parsed) : {};
    for (const [key,row] of Object.entries(rows||{})) {
      const text=String(row?.text||'').trim();
      const updatedAt=Number(row?.updatedAt||Date.now());
      if(!text || updatedAt+VOICE_TRANSCRIPT_TTL_MS<Date.now()) continue;
      voiceTranscriptCache.set(key,{text,source:String(row?.source||'transformers.js-whisper'),updatedAt,expiresAt:updatedAt+VOICE_TRANSCRIPT_TTL_MS});
    }
    console.log(`[voice transcript cache] loaded ${voiceTranscriptCache.size}`);
  } catch(err) { console.warn('[voice transcript cache load]',err?.message||err); }
}
function persistVoiceTranscriptStoreSoon() {
  clearTimeout(voiceTranscriptSaveTimer);
  voiceTranscriptSaveTimer=setTimeout(()=>{
    try {
      const items={};
      for(const [key,row] of voiceTranscriptCache){
        if(!row?.text || Number(row.expiresAt||0)<Date.now()) continue;
        items[key]={text:row.text,source:row.source||'transformers.js-whisper',updatedAt:Number(row.updatedAt||Date.now())};
      }
      fs.mkdirSync(path.dirname(VOICE_TRANSCRIPT_STORE),{recursive:true});
      const tmp=`${VOICE_TRANSCRIPT_STORE}.tmp`;
      fs.writeFileSync(tmp,JSON.stringify({version:1,updatedAt:new Date().toISOString(),items},null,2),'utf8');
      fs.renameSync(tmp,VOICE_TRANSCRIPT_STORE);
    } catch(err) { console.warn('[voice transcript cache save]',err?.message||err); }
  },250);
}
function putVoiceTranscriptCache(peerId, conversationMessageId, text, source='transformers.js-whisper') {
  const clean=String(text||'').trim();
  if(!clean)return;
  const updatedAt=Date.now();
  voiceTranscriptCache.set(transcriptCacheKey(peerId,conversationMessageId),{text:clean,source:String(source||'whisper.cpp'),updatedAt,expiresAt:updatedAt+VOICE_TRANSCRIPT_TTL_MS});
  persistVoiceTranscriptStoreSoon();
}
function getVoiceTranscriptCache(peerId, conversationMessageId) {
  const key=transcriptCacheKey(peerId,conversationMessageId),row=voiceTranscriptCache.get(key);
  if(!row)return null;
  if(Number(row.expiresAt||0)<Date.now()){voiceTranscriptCache.delete(key);persistVoiceTranscriptStoreSoon();return null}
  return row;
}
function applyVoiceTranscriptCache(peerId,messages=[]) {
  for(const m of messages||[]){
    const cmid=Number(m?.conversationMessageId||0),voice=messageVoiceAttachment(m),cached=cmid?getVoiceTranscriptCache(peerId,cmid):null;
    if(voice&&cached&&!String(voice.transcript||'').trim()){
      voice.transcript=cached.text;voice.transcriptState='done';voice.transcriptSource=cached.source;
    }
  }
  return messages;
}
loadVoiceTranscriptStore();
let localSttModulePromise = null;
function localSttReady() { return Boolean(STT_ENABLED); }
async function getLocalSttModule() {
  if (!localSttModulePromise) {
    localSttModulePromise = import('./lib/local-transformers-stt.mjs').catch(err => {
      localSttModulePromise = null;
      throw err;
    });
  }
  return localSttModulePromise;
}

async function downloadVoiceForStt(rawUrl) {
  let target;
  try { target = new URL(String(rawUrl || '')); }
  catch { throw Object.assign(new Error('Некорректная ссылка голосового сообщения'), { status: 400 }); }
  if (target.protocol !== 'https:' || !isAllowedMediaHost(target.hostname)) {
    throw Object.assign(new Error('Хост голосового сообщения не разрешён'), { status: 400 });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const r = await fetch(target, {
      redirect: 'follow',
      headers: {
        'Accept': 'audio/ogg,audio/mpeg,audio/webm,audio/*,*/*;q=0.8',
        'User-Agent': `seb_gun-CRM/${VERSION}`,
        'Referer': 'https://vk.com/'
      },
      signal: controller.signal
    });
    if (!r.ok) throw new Error(`Не удалось скачать голосовое: HTTP ${r.status}`);
    const declared = Number(r.headers.get('content-length') || 0);
    if (declared > STT_MAX_BYTES) throw new Error('Голосовое слишком большое для расшифровки');
    const ab = await r.arrayBuffer();
    if (ab.byteLength > STT_MAX_BYTES) throw new Error('Голосовое слишком большое для расшифровки');
    return {
      buffer: Buffer.from(ab),
      mimeType: String(r.headers.get('content-type') || 'audio/ogg').split(';')[0].trim() || 'audio/ogg'
    };
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error('Не удалось скачать голосовое: таймаут');
    throw err;
  } finally { clearTimeout(timer); }
}

let sttTail = Promise.resolve();
async function transcribeVoiceLocal(audioUrl) {
  if (!STT_ENABLED) return { configured: false, text: '', source: '' };
  const job = async () => {
    const audio = await downloadVoiceForStt(audioUrl);
    let mod;
    try { mod = await getLocalSttModule(); }
    catch (err) {
      const e = new Error(`Не удалось загрузить локальный Whisper: ${err?.message || err}`);
      e.code = 'STT_ENGINE_LOAD'; e.status = 503; throw e;
    }
    try {
      const r = await mod.transcribeBuffer(audio.buffer, {
        mimeType: audio.mimeType, ffmpegPath: FFMPEG_BIN, modelName: STT_MODEL,
        dtype: STT_DTYPE, language: STT_LANGUAGE, timeoutMs: STT_TIMEOUT_MS,
        idleReleaseMs: STT_IDLE_RELEASE_MS,
      });
      return { configured: true, text: String(r?.text || '').trim(), source: 'transformers.js-whisper', model: STT_MODEL };
    } catch (err) {
      const e = new Error(String(err?.message || err || 'Ошибка локальной расшифровки'));
      e.code = err?.code || 'STT_LOCAL'; e.status = Number(err?.status || 503); throw e;
    }
  };
  const result = sttTail.then(job, job);
  sttTail = result.catch(() => undefined);
  return result;
}

let googleSttModulePromise=null;
async function getGoogleSttModule(){if(!googleSttModulePromise)googleSttModulePromise=import('./lib/google-speech-stt.mjs').catch(err=>{googleSttModulePromise=null;throw err});return googleSttModulePromise}
function sttReady(){return Boolean(STT_ENABLED)}
async function transcribeVoicePreferred(audioUrl){
 if(!STT_ENABLED){const e=new Error('Расшифровка отключена на сервере');e.code='STT_DISABLED';e.status=503;throw e}
 const audio=await downloadVoiceForStt(audioUrl)
 if(STT_PROVIDER==='google-legacy'||STT_PROVIDER==='speechrecognition'){
  try{const mod=await getGoogleSttModule();const r=await mod.transcribeBuffer(audio.buffer,{mimeType:audio.mimeType,ffmpegPath:FFMPEG_BIN,language:'ru-RU',timeoutMs:STT_PROVIDER_TIMEOUT_MS});return{configured:true,text:String(r?.text||'').trim(),source:'google-speechrecognition',model:'SpeechRecognition/Google'}}
  catch(err){if(!STT_LOCAL_FALLBACK)throw err;console.warn('[stt google fallback -> local]',err?.message||err)}
 }
 return transcribeVoiceLocal(audioUrl)
}
function transcriptJobKey(peerId,cmid){return `${Number(peerId)||0}:${Number(cmid)||0}`}
function pruneTranscriptJobs(){const now=Date.now();for(const[k,j]of voiceTranscriptJobs)if(now-Number(j.updatedAt||j.createdAt||0)>STT_JOB_TTL_MS)voiceTranscriptJobs.delete(k)}
function enqueueTranscriptJob(peerId,cmid,audioUrl){pruneTranscriptJobs();const key=transcriptJobKey(peerId,cmid),cached=getVoiceTranscriptCache(peerId,cmid);if(cached)return{status:'done',transcript:cached.text,source:cached.source,cached:true};const existing=voiceTranscriptJobs.get(key);if(existing&&['queued','processing'].includes(existing.status))return existing;const job={key,status:'queued',createdAt:Date.now(),updatedAt:Date.now(),peerId,cmid,transcript:'',source:'',error:'',errorCode:''};voiceTranscriptJobs.set(key,job);setImmediate(async()=>{job.status='processing';job.updatedAt=Date.now();try{const ext=await transcribeVoicePreferred(audioUrl),text=String(ext?.text||'').trim();if(!text)throw Object.assign(new Error('Речь не удалось распознать'),{code:'STT_EMPTY',status:422});putVoiceTranscriptCache(peerId,cmid,text,ext.source||STT_PROVIDER);job.status='done';job.transcript=text;job.source=ext.source||STT_PROVIDER;job.model=ext.model||''}catch(err){job.status='error';job.error=String(err?.message||err);job.errorCode=String(err?.code||'STT_ERROR');job.httpStatus=Number(err?.status||503);console.warn('[voice STT job]',peerId,cmid,job.errorCode,job.error)}finally{job.updatedAt=Date.now()}});return job}
function transcriptJobResponse(peerId,cmid){const cached=getVoiceTranscriptCache(peerId,cmid);if(cached)return{ok:true,status:'done',available:true,transcript:cached.text,transcriptSource:cached.source,cached:true};const job=voiceTranscriptJobs.get(transcriptJobKey(peerId,cmid));if(!job)return{ok:true,status:'idle',available:false};return{ok:true,status:job.status,available:job.status==='done',transcript:job.transcript||'',transcriptSource:job.source||'',error:job.error||'',errorCode:job.errorCode||'',startedAt:job.createdAt,updatedAt:job.updatedAt}}

async function transcribeMissingVoiceMessages(peerId,messages,{max=12,concurrency=1}={}) {
  if(!sttReady())return {messages,transcribed:0,missing:0,skipped:0};
  const candidates=[];
  for(const m of messages||[]){
    const voice=messageVoiceAttachment(m),cmid=Number(m?.conversationMessageId||0);
    if(!voice||String(voice.transcript||'').trim())continue;
    const cached=cmid?getVoiceTranscriptCache(peerId,cmid):null;
    if(cached){voice.transcript=cached.text;voice.transcriptState='done';voice.transcriptSource=cached.source;continue;}
    if(voice.url)candidates.push({m,voice,cmid});
  }
  let transcribed=0;
  const selected=candidates.slice(0,Math.max(0,Number(max)||0));
  for (const row of selected) {
    try {
      const ext=await transcribeVoicePreferred(row.voice.url),text=String(ext.text||'').trim();
      if(text){
        row.voice.transcript=text;row.voice.transcriptState='done';row.voice.transcriptSource=ext.source||STT_PROVIDER;
        if(row.cmid)putVoiceTranscriptCache(peerId,row.cmid,text,row.voice.transcriptSource);
        transcribed++;
      }
    } catch(err) { console.warn('[voice export STT]',row.cmid||'?',String(err?.message||err).slice(0,240)); }
  }
  const missing=(messages||[]).filter(m=>{const v=messageVoiceAttachment(m);return v&&!String(v.transcript||'').trim()}).length;
  return {messages,transcribed,missing,skipped:Math.max(0,candidates.length-selected.length)};
}


function playbackCacheKey(rawUrl) { return crypto.createHash('sha256').update(String(rawUrl || '')).digest('hex'); }
function extForAudioMime(mime='audio/ogg') { const x=String(mime||'').toLowerCase(); if(x.includes('webm'))return'.webm'; if(x.includes('mpeg')||x.includes('mp3'))return'.mp3'; if(x.includes('mp4')||x.includes('m4a'))return'.m4a'; if(x.includes('wav'))return'.wav'; return'.ogg'; }
async function ensureVoicePlaybackMp3(rawUrl) {
  const key=playbackCacheKey(rawUrl),dir=VOICE_PLAYBACK_DIR,out=path.join(dir,`${key}.mp3`);
  try { const st=await fs.promises.stat(out); if(st.size>512)return out; } catch {}
  if(voicePlaybackInflight.has(key))return voicePlaybackInflight.get(key);
  const task=(async()=>{
    await fs.promises.mkdir(dir,{recursive:true});
    const audio=await downloadVoiceForStt(rawUrl),tmpDir=await fs.promises.mkdtemp(path.join(os.tmpdir(),'seb-gun-play-'));
    const input=path.join(tmpDir,`input${extForAudioMime(audio.mimeType)}`),tmpOut=path.join(tmpDir,'voice.mp3');
    try {
      await fs.promises.writeFile(input,audio.buffer);
      await execFileAsync(FFMPEG_BIN,['-hide_banner','-loglevel','error','-nostdin','-y','-i',input,'-vn','-ac','1','-ar','24000','-c:a','libmp3lame','-b:a','56k',tmpOut],{timeout:60000,maxBuffer:1024*1024});
      const st=await fs.promises.stat(tmpOut); if(st.size<256)throw new Error('FFmpeg создал пустой аудиофайл');
      await fs.promises.copyFile(tmpOut,out); return out;
    } finally { fs.promises.rm(tmpDir,{recursive:true,force:true}).catch(()=>{}); }
  })().finally(()=>voicePlaybackInflight.delete(key));
  voicePlaybackInflight.set(key,task); return task;
}
function serveFileWithRange(req,res,filePath,mime='audio/mpeg') {
  let st; try{st=fs.statSync(filePath)}catch{return sendJson(res,404,{ok:false,message:'Аудио не найдено'})}
  const size=st.size,range=String(req.headers.range||'');
  const common={'Content-Type':mime,'Accept-Ranges':'bytes','Cache-Control':'private, max-age=86400','X-Content-Type-Options':'nosniff','Content-Disposition':'inline'};
  if(range){
    const m=/bytes=(\\d*)-(\\d*)/.exec(range);
    if(!m){res.writeHead(416,{...common,'Content-Range':`bytes */${size}`});return res.end()}
    let start=m[1]?Number(m[1]):0,end=m[2]?Number(m[2]):size-1;
    if(!m[1]&&m[2]){const suffix=Number(m[2]);start=Math.max(0,size-suffix);end=size-1}
    start=Math.max(0,Math.min(start,size-1));end=Math.max(start,Math.min(end,size-1));
    res.writeHead(206,{...common,'Content-Range':`bytes ${start}-${end}/${size}`,'Content-Length':String(end-start+1)});
    if(req.method==='HEAD')return res.end();
    return fs.createReadStream(filePath,{start,end}).pipe(res);
  }
  res.writeHead(200,{...common,'Content-Length':String(size)});
  if(req.method==='HEAD')return res.end();
  fs.createReadStream(filePath).pipe(res);
}
async function proxyVoicePlayback(req,res,rawUrl){
  let target;try{target=new URL(String(rawUrl||''))}catch{return sendJson(res,400,{ok:false,message:'Некорректная ссылка аудио'})}
  if(target.protocol!=='https:'||!isAllowedMediaHost(target.hostname))return sendJson(res,400,{ok:false,message:'Этот аудио-хост не разрешён'});
  try{const file=await ensureVoicePlaybackMp3(target.href);return serveFileWithRange(req,res,file,'audio/mpeg')}
  catch(err){console.error('[voice playback]',err?.stack||err);return sendJson(res,502,{ok:false,error:'VOICE_PLAYBACK',message:`Не удалось подготовить голосовое: ${String(err?.message||err).slice(0,220)}`})}
}
async function proxyVoiceAudio(req, res, rawUrl) {
  let target;
  try { target=new URL(String(rawUrl||'')); }
  catch { return sendJson(res,400,{ok:false,message:'Некорректная ссылка аудио'}); }
  if(target.protocol!=='https:' || !isAllowedMediaHost(target.hostname)) {
    return sendJson(res,400,{ok:false,message:'Этот аудио-хост не разрешён'});
  }
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000);
  const headers={
    'Accept':'audio/mpeg,audio/ogg,audio/webm,audio/*,*/*;q=0.8',
    'User-Agent':req.headers['user-agent']||`seb_gun-CRM/${VERSION}`,
    'Referer':'https://vk.com/'
  };
  if(req.headers.range) headers.Range=String(req.headers.range);
  let upstream;
  try {
    upstream=await fetch(target,{method:'GET',redirect:'follow',headers,signal:controller.signal});
  } catch(err) {
    clearTimeout(timeout);
    return sendJson(res,err?.name==='AbortError'?504:502,{ok:false,message:err?.name==='AbortError'?'Аудио отвечает слишком долго':`Не удалось загрузить аудио: ${err.message}`});
  }
  clearTimeout(timeout);
  if(!upstream.ok && upstream.status!==206) return sendJson(res,upstream.status||502,{ok:false,message:`Аудио HTTP ${upstream.status}`});
  const out={
    'Content-Type':upstream.headers.get('content-type')||'audio/mpeg',
    'Cache-Control':'private, max-age=3600, stale-while-revalidate=86400',
    'Accept-Ranges':upstream.headers.get('accept-ranges')||'bytes',
    'X-Content-Type-Options':'nosniff',
    'Cross-Origin-Resource-Policy':'same-origin'
  };
  for(const name of ['content-length','content-range','etag','last-modified']){
    const v=upstream.headers.get(name);if(v)out[name.split('-').map(x=>x[0].toUpperCase()+x.slice(1)).join('-')]=v;
  }
  res.writeHead(upstream.status===206?206:200,out);
  if(!upstream.body)return res.end();
  try{for await(const chunk of upstream.body)res.write(chunk);res.end()}catch(err){try{res.destroy(err)}catch{}}
}

async function proxyVkMedia(req, res, rawUrl) {
  let target;
  try { target = new URL(String(rawUrl || '')); }
  catch { return sendJson(res, 400, { ok:false, message:'Некорректный URL медиа' }); }
  if (target.protocol !== 'https:' || !isAllowedMediaHost(target.hostname)) {
    return sendJson(res, 400, { ok:false, message:'Этот медиа-хост не разрешён' });
  }
  let kind='';try{kind=new URL(req.url,`http://${req.headers.host||'localhost'}`).searchParams.get('kind')||''}catch{}
  const imageRequest=kind==='image';
  let upstream=null,lastError=null;
  const variants=[
    {'Accept':req.headers.accept||'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8','User-Agent':req.headers['user-agent']||`seb_gun-CRM/${VERSION}`,'Referer':'https://vk.com/'},
    {'Accept':'image/avif,image/webp,image/*,*/*;q=0.8','User-Agent':'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36'},
  ];
  for(let attempt=0;attempt<variants.length;attempt++){
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),Math.min(API_TIMEOUT_MS,attempt===0?7000:4000));
    try{
      upstream=await fetch(target,{method:'GET',redirect:'follow',headers:variants[attempt],signal:controller.signal});
      if(upstream.ok)break;
      lastError=new Error(`VK media HTTP ${upstream.status}`);
      try{await upstream.body?.cancel()}catch{}
      upstream=null;
    }catch(err){lastError=err;upstream=null}
    finally{clearTimeout(timeout)}
    if(lastError?.name==='AbortError')break;
    if(attempt+1<variants.length)await sleep(120);
  }
  if(!upstream?.ok){
    if(imageRequest){
      const svg='<svg xmlns="http://www.w3.org/2000/svg" width="320" height="220" viewBox="0 0 320 220"><rect width="320" height="220" rx="18" fill="#e7f1ec"/><path d="M92 154l45-49 32 30 24-23 39 42H92z" fill="#8fb7a1"/><circle cx="205" cy="75" r="18" fill="#66a483"/><text x="160" y="190" text-anchor="middle" font-family="Arial,sans-serif" font-size="13" fill="#416553">Фото временно недоступно</text></svg>';
      res.writeHead(200,{'Content-Type':'image/svg+xml; charset=utf-8','Cache-Control':'public, max-age=45','X-Media-Fallback':'1','X-Content-Type-Options':'nosniff'});
      return res.end(svg);
    }
    const timeout=lastError?.name==='AbortError';
    return sendJson(res,timeout?504:502,{ok:false,message:timeout?'VK media timeout':String(lastError?.message||'VK media unavailable')});
  }

  const type = upstream.headers.get('content-type') || 'application/octet-stream';
  const len = upstream.headers.get('content-length');
  const headers = {
    'Content-Type': type,
    'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'same-origin'
  };
  if (len) headers['Content-Length'] = len;
  res.writeHead(200, headers);
  if (!upstream.body) return res.end();
  try {
    for await (const chunk of upstream.body) res.write(chunk);
    res.end();
  } catch (err) {
    try { res.destroy(err); } catch {}
  }
}

function requireAuth(req, res) {
  const s = getSession(req);
  if (!s) { sendJson(res, 401, { ok: false, error: 'AUTH_REQUIRED', message: 'Войдите в BlueSales' }); return null; }
  return s;
}

function requireCsrf(req, res, s) {
  const token = req.headers['x-csrf-token'];
  if (!token || token !== s.csrf) { sendJson(res, 403, { ok: false, error: 'CSRF', message: 'Сессия устарела. Обновите страницу.' }); return false; }
  return true;
}

function publicFile(reqPath) {
  let p = decodeURIComponent(reqPath.split('?')[0]);
  let base = PUBLIC;
  if (p === '/legacy' || p.startsWith('/legacy/')) {
    base = LEGACY_PUBLIC;
    p = p === '/legacy' || p === '/legacy/' ? '/index.html' : p.slice('/legacy'.length);
  }
  if (p === '/') p = '/index.html';
  const full = path.normalize(path.join(base, p));
  if (!full.startsWith(base)) return null;
  return full;
}

const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon'
};

function serveStatic(req, res, pathname) {
  const file = publicFile(pathname);
  if (!file) return sendText(res, 403, 'Forbidden');
  fs.stat(file, (err, st) => {
    let target = file;
    if (!err && st.isDirectory()) target = path.join(file, 'index.html');
    fs.readFile(target, (err2, data) => {
      if (err2 && pathname==='/manifest.webmanifest') return sendJson(res,200,{name:'seb_gun CRM',short_name:'seb_gun CRM',start_url:'/#/dialogs',scope:'/',display:'standalone',background_color:'#f4f7f5',theme_color:'#151b17',icons:[{src:'/icon.svg',sizes:'any',type:'image/svg+xml',purpose:'any maskable'}]},{'Cache-Control':'no-cache'});
      if (err2 && pathname==='/icon.svg') return sendText(res,200,'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="116" fill="#0b966f"/><path fill="#fff" d="M352 143c-24-23-58-35-102-35-66 0-112 32-112 83 0 49 37 69 103 84 55 13 72 24 72 47 0 25-23 40-60 40-42 0-78-16-108-47l-37 43c36 39 84 58 143 58 73 0 121-36 121-91 0-50-34-73-105-90-55-13-70-22-70-43 0-22 21-36 53-36 34 0 62 11 86 33l16-46Z"/></svg>','image/svg+xml');
      if (err2) return sendText(res, 404, 'Not Found');
      res.writeHead(200, {
        'Content-Type': mime[path.extname(target).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': path.basename(target) === 'sw.js' ? 'no-cache, no-store' : 'no-cache',
        'X-Content-Type-Options': 'nosniff'
      });
      res.end(data);
    });
  });
}

function blueSalesUiSeedPath(){ return path.join(ROOT,'data','bluesales-ui-seed.json'); }
function loadBlueSalesUiSeed(){
  try{
    const raw=JSON.parse(fs.readFileSync(blueSalesUiSeedPath(),'utf8'));
    return raw&&typeof raw==='object'?raw:{};
  }catch{return{};}
}
function statusOptions(customers) {
  const seed=loadBlueSalesUiSeed();
  const defaults=(Array.isArray(seed.statuses)?seed.statuses.map(x=>String(x?.name||'')).filter(Boolean):[
    'Не учитывать в лидах','Вступил в группу','Запустил воронку','Заявка','Диагностика','Отправлен урок',
    'Рассказ про курс','Цена озвучена','Принимает решение','Оплатил','Допродажа','Отказ','Черный список','Работа с игнором','Отложил покупку'
  ]);
  const set = new Set(defaults);
  (customers||[]).forEach(c => { if (c.crmStatus) set.add(c.crmStatus); });
  return [...set];
}


function quickPhrasesPath() { return path.join(ROOT, 'data', 'quick_phrases.json'); }
function managerColorsPath() { return path.join(ROOT, 'data', 'manager-colors.json'); }
function statusColorsPath() { return path.join(ROOT, 'data', 'status-colors.json'); }
function loadManagerColorOverrides() {
  try { const raw=JSON.parse(fs.readFileSync(managerColorsPath(),'utf8')); return raw && typeof raw==='object' && !Array.isArray(raw) ? raw : {}; }
  catch { return {}; }
}
function loadStatusColorOverrides() {
  try { const raw=JSON.parse(fs.readFileSync(statusColorsPath(),'utf8')); return raw && typeof raw==='object' && !Array.isArray(raw) ? raw : {}; }
  catch { return {}; }
}
function uiSyncDir() { return path.join(ROOT, 'data', 'ui-sync'); }
function uiSyncFile(login) {
  const key = crypto.createHash('sha256').update(String(login || '').toLowerCase()).digest('hex').slice(0, 16);
  return path.join(uiSyncDir(), `${key}.json`);
}
function loadQuickPhrases() {
  try {
    const raw = JSON.parse(fs.readFileSync(quickPhrasesPath(), 'utf8'));
    return Array.isArray(raw?.groups) ? raw.groups : [];
  } catch (err) {
    console.warn('[Quick phrases]', err?.message || err);
    return [];
  }
}
function readUiSync(login) {
  try {
    const file = uiSyncFile(login);
    if (!fs.existsSync(file)) return null;
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return raw && typeof raw === 'object' ? raw : null;
  } catch { return null; }
}
function writeUiSync(login, profile) {
  try {
    fs.mkdirSync(uiSyncDir(), { recursive: true });
    const safe = {
      savedAt: new Date().toISOString(), source: profile.source || 'bluesales-web',
      phrases: Array.isArray(profile.phrases) ? profile.phrases : [],
      statusColors: profile.statusColors || {}, managerColors: profile.managerColors || {}, tagColors: profile.tagColors || {},
      tagTextColors: profile.tagTextColors || {},
      managers: Array.isArray(profile.managers) ? profile.managers : [],
      statuses: Array.isArray(profile.statuses) ? profile.statuses : [],
      tags: Array.isArray(profile.tags) ? profile.tags : [],
      loggedManager: profile.loggedManager || null,
      selectedManagerId: profile.selectedManagerId || '',
      capabilities: profile.capabilities || {}, discovered: profile.discovered || {}
    };
    fs.writeFileSync(uiSyncFile(login), JSON.stringify(safe, null, 2), 'utf8');
  } catch (err) { console.warn('[BlueSales UI sync cache]', err?.message || err); }
}
function currentUserFrom(users, login) {
  const needle = String(login || '').trim().toLowerCase();
  const found=(users || []).find(u => String(u.login || '').trim().toLowerCase() === needle);
  if(found)return found;
  const seed=loadBlueSalesUiSeed();
  if(String(seed?.loggedManager?.login||'').trim().toLowerCase()===needle){
    return normalizeUser(seed.loggedManager);
  }
  return { id:'', name:'', login:String(login || ''), color:'' };
}
function localPhrasesForAccount(session) {
  // Local phrase export is an account-scoped fallback generated from the user's BlueSales export. v22.0 does not
  // grant scripts locally: BlueSales itself must confirm what this account can use.
  return BlueSalesWeb.filterPhraseGroups(
    loadQuickPhrases(), session.currentUser || null, session.login,
    { allowWildcard:false }
  );
}
function phrasePayloadForSession(session) {
  const profile = session.uiProfile || readUiSync(session.login);
  const localGroups = ALLOW_LOCAL_PHRASE_FALLBACK ? localPhrasesForAccount(session) : [];
  const profileGroups = Array.isArray(profile?.phrases) ? profile.phrases : [];
  const profileSource = String(profile?.source || '');

  // v24.2: the user supplied a complete BlueSales phrase export with original emoji.
  // It contains the Managers column and attachment tokens, which the public API
  // does not expose. Use this account-filtered export as the stable phrase
  // source; live BlueSales web sync still supplies UI metadata/capabilities and
  // can be retried/imported, but it is not allowed to replace the complete
  // exported set with a partial/zero parse.
  if (localGroups.length) {
    return {
      groups: localGroups,
      source: 'bluesales-emoji-export',
      capabilities: { ...(profile?.capabilities || {}), quickPhrases: true },
      discovered: profile?.discovered || {},
      syncedAt: profile?.savedAt || null,
      message: 'База скриптов загружена из экспортированной таблицы BlueSales и отфильтрована по колонке «Менеджеры» для текущего логина.'
    };
  }
  if (profile && Array.isArray(profile.phrases) && /^bluesales-(?:web|html-import)/.test(profileSource)) {
    return {
      groups: profileGroups,
      source: profileSource || 'bluesales-web-cache',
      capabilities: profile.capabilities || {},
      discovered: profile.discovered || {},
      syncedAt: profile.savedAt || null,
      message: profileGroups.length ? '' : 'BlueSales вернул 0 доступных быстрых фраз для этого аккаунта.'
    };
  }
  return {
    groups: [], source: 'bluesales-account-only', capabilities: profile?.capabilities || {},
    discovered: profile?.discovered || {}, syncedAt: profile?.savedAt || null,
    message: session.uiSyncMessage || 'BlueSales ещё не подтвердил доступ этого аккаунта к быстрым фразам.'
  };
}

async function syncBlueSalesUi(session, password, users, {force=false}={}) {
  if (session.uiSyncPromise && !force) return session.uiSyncPromise;
  const secret=password || session.webPassword || '';
  if (!secret || !BS_WEB_SYNC_ENABLED) {
    session.uiSyncState = BS_WEB_SYNC_ENABLED ? 'no-password' : 'disabled';
    return null;
  }
  const runner=(async()=>{
    session.uiSyncState = 'syncing';
    session.uiSyncMessage = '';
    try {
      const managerNames = (users || []).map(u => u.name).filter(Boolean);
      const profile = await BlueSalesWeb.bootstrap({
        base: BS_WEB_BASE,
        login: session.login,
        password: secret,
        currentUser: session.currentUser,
        statusNames: statusOptions([]),
        managerNames,
        busyRetries: 3,
        busyWaitMinMs: 5000,
        busyWaitMaxMs: 10000
      });
      if (!profile.ok) {
        session.uiSyncState = profile.code || 'unavailable';
        session.uiSyncMessage = profile.message || '';
        const cached = readUiSync(session.login);
        if (cached) session.uiProfile = { ...cached, source: 'bluesales-web-cache' };
        return profile;
      }
      session.uiSyncState = 'ready';
      session.uiSyncMessage = '';
      session.uiProfile = { ...profile, savedAt: new Date().toISOString() };
      writeUiSync(session.login, session.uiProfile);
      console.log(`[BlueSales UI sync] ${session.login}: phrases=${profile.phraseCount || 0}, statuses=${(profile.statuses||[]).length}, tags=${(profile.tags||[]).length}, managers=${(profile.managers||[]).length}, managerColors=${Object.keys(profile.managerColors || {}).length}`);
      return profile;
    } catch (err) {
      session.uiSyncState = 'error';
      session.uiSyncMessage = err?.message || String(err);
      const cached = readUiSync(session.login);
      if (cached) session.uiProfile = { ...cached, source: 'bluesales-web-cache' };
      console.warn('[BlueSales UI sync]', session.uiSyncMessage);
      return null;
    }
  })();
  session.uiSyncPromise=runner;
  try{return await runner;}finally{if(session.uiSyncPromise===runner)session.uiSyncPromise=null;}
}

function accountStyleProfile(session, users, customers) {
  const seed=loadBlueSalesUiSeed();
  const statusColors={...BS_SCREENSHOT_STATUS_COLORS};
  const managerColors={...BS_SCREENSHOT_MANAGER_COLORS,...(seed.managerColors||{}),...loadManagerColorOverrides()};
  for(const u of loadUserAccess().users||[]) if(u?.name&&u?.color) managerColors[u.name]=u.color;
  const tagColors={};
  const tagTextColors={};
  for(const x of seed.statuses||[]) if(x?.name&&x?.color) statusColors[x.name]=x.color;
  for(const x of seed.tags||[]){
    if(x?.name&&x?.color) tagColors[x.name]=x.color;
    if(x?.name&&x?.textColor) tagTextColors[x.name]=x.textColor;
  }
  for (const u of users || []) if (u.name && u.color) managerColors[u.name] = u.color;
  for (const c of customers || []) {
    if (c.crmStatus && c.crmStatusColor) statusColors[c.crmStatus] = c.crmStatusColor;
    if (c.manager && c.managerColor) managerColors[c.manager] = c.managerColor;
    for(const t of c.tags || []){
      if(t?.name && t?.color) tagColors[t.name]=t.color;
      if(t?.name && t?.textColor) tagTextColors[t.name]=t.textColor;
    }
  }
  const ui = session?.uiProfile || readUiSync(session?.login || '');
  Object.assign(statusColors, ui?.statusColors || {});
  Object.assign(managerColors, ui?.managerColors || {});
  Object.assign(tagColors, ui?.tagColors || {});
  Object.assign(tagTextColors, ui?.tagTextColors || {});
  // Explicit choices from the mobile admin are authoritative over the
  // periodically refreshed BlueSales UI cache.
  Object.assign(statusColors, loadStatusColorOverrides());
  return {
    statusColors, managerColors, tagColors, tagTextColors,
    source: ui?.source || 'captured-bluesales-bootstrap+api+manager-overrides'
  };
}

function attachmentId(prefix, x) {
  const owner = Number(x?.owner_id || 0), id = Number(x?.id || x?.video_id || 0);
  if (!owner || !id) return '';
  const access = String(x?.access_key || '');
  return `${prefix}${owner}_${id}${access ? `_${access}` : ''}`;
}

async function postMultipart(uploadUrl, fieldName, buffer, filename, mimeType) {
  const form = new FormData();
  form.append(fieldName, new Blob([buffer], { type: mimeType || 'application/octet-stream' }), filename || 'file');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(API_TIMEOUT_MS, 60000));
  try {
    const response = await fetch(uploadUrl, { method:'POST', body:form, signal:controller.signal });
    const text = await response.text();
    let data = null; try { data = JSON.parse(text); } catch {}
    if (!response.ok) throw new VkApiError(`VK upload HTTP ${response.status}: ${blueSalesBodySnippet(text, 450)}`, 'VK_UPLOAD');
    if (!data) throw new VkApiError(`VK upload вернул не JSON: ${blueSalesBodySnippet(text, 450)}`, 'VK_UPLOAD');
    return data;
  } finally { clearTimeout(timer); }
}

async function uploadVkDocument(session, peerId, buffer, filename, mimeType, type='doc') {
  const p = { peer_id: peerId, type: type === 'audio_message' ? 'audio_message' : 'doc' };
  const info = await vkCall(session.vkToken, 'docs.getMessagesUploadServer', p);
  const uploaded = await postMultipart(info?.upload_url, 'file', buffer, filename, mimeType);
  const saved = await vkCall(session.vkToken, 'docs.save', { file: uploaded?.file, title: filename || 'Файл' });
  const obj = saved?.audio_message || saved?.doc || saved?.graffiti || (Array.isArray(saved) ? saved[0] : null);
  const attachment = attachmentId(type === 'audio_message' ? 'audio_message' : 'doc', obj);
  if (!attachment) throw new VkApiError('VK сохранил файл, но не вернул owner_id/id', 'VK_UPLOAD', saved);
  return { attachment, kind: type, raw: saved };
}

function safeVkPhotoFilename(filename, mimeType) {
  const mt = String(mimeType || '').toLowerCase();
  const name = String(filename || '').toLowerCase();
  if (mt.includes('png') || name.endsWith('.png')) return 'upload.png';
  if (mt.includes('gif') || name.endsWith('.gif')) return 'upload.gif';
  if (mt.includes('webp') || name.endsWith('.webp')) return 'upload.webp';
  return 'upload.jpg';
}

function serializeVkMessagePhoto(value) {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value) || (value && typeof value === 'object')) {
    try { return JSON.stringify(value); } catch { return ''; }
  }
  return value === undefined || value === null ? '' : String(value);
}

function validVkMessagePhotoUpload(data){
  const photo = serializeVkMessagePhoto(data?.photo);
  return Boolean(data && photo && photo !== '[]' && photo !== '{}' && data.server !== undefined && data.server !== null && data.hash);
}

function retryableVkPhotoSaveError(err) {
  const msg = String(err?.message || '');
  return String(err?.code || '') === 'VK_100' || /photos_list is invalid|photo is undefined/i.test(msg);
}

async function uploadAndSaveVkMessagePhoto(session, peerId, info, buffer, filename, mimeType){
  if(!info?.upload_url)throw new VkApiError('VK не вернул upload_url для фото', 'VK_UPLOAD', info);
  const safeName = safeVkPhotoFilename(filename, mimeType);
  const isBulk = /\/v2\/bulk_upload(?:\?|$)/i.test(String(info.upload_url));
  const fields = isBulk ? ['photo','file','file1'] : ['photo','file'];
  const attempts = [];
  let lastError = null;

  for(const fieldName of fields){
    try{
      const uploaded = await postMultipart(info.upload_url, fieldName, buffer, safeName, mimeType || 'image/jpeg');
      const photo = serializeVkMessagePhoto(uploaded?.photo);
      const record = {
        fieldName,
        keys:Object.keys(uploaded||{}),
        hasPhoto:validVkMessagePhotoUpload(uploaded),
        photoType:Array.isArray(uploaded?.photo)?'array':typeof uploaded?.photo
      };
      attempts.push(record);
      if(!validVkMessagePhotoUpload(uploaded))continue;

      console.log(`[VK upload] photo peer=${peerId} field=${fieldName} bytes=${buffer.length} endpoint=${isBulk?'bulk':'classic'}`);
      try{
        const saved = await vkCall(session.vkToken, 'photos.saveMessagesPhoto', {
          photo,
          server: uploaded.server,
          hash: uploaded.hash
        });
        return {saved, fieldName, endpoint:isBulk?'bulk':'classic'};
      }catch(err){
        lastError = err;
        record.saveError = err?.code || err?.message || 'save failed';
        if(retryableVkPhotoSaveError(err))continue;
        throw err;
      }
    }catch(err){
      lastError = err;
      attempts.push({fieldName, uploadError:err?.code || err?.message || 'upload failed'});
    }
  }

  if(isBulk){
    throw new VkApiError(
      'VK вернул временный v2/bulk_upload без совместимого поля photo. Повторите отправку через несколько секунд; CRM не будет передавать пустой photos_list.',
      'VK_UPLOAD_BULK_INCOMPATIBLE',
      {attempts}
    );
  }
  if(lastError && !retryableVkPhotoSaveError(lastError))throw lastError;
  throw new VkApiError(
    'VK upload не удалось сохранить: upload-сервер не вернул корректные photo/server/hash или VK отклонил photos_list.',
    'VK_UPLOAD_BAD_RESPONSE',
    {attempts}
  );
}

async function uploadVkMediaBuffer(session, { peerId, type, filename, mimeType, buffer }) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw Object.assign(new Error('Файл пустой'), {status:400});
  if (buffer.length > 30 * 1024 * 1024) throw Object.assign(new Error('Файл больше 30 МБ'), {status:413});
  if (type === 'photo') {
    try {
      const info = await vkCall(session.vkToken, 'photos.getMessagesUploadServer', { peer_id: peerId });
      const result = await uploadAndSaveVkMessagePhoto(session, peerId, info, buffer, filename || 'photo.jpg', mimeType || 'image/jpeg');
      const saved = result.saved;
      const photo = Array.isArray(saved) ? saved[0] : saved?.[0] || saved;
      const attachment = attachmentId('photo', photo);
      if (!attachment) throw new VkApiError('VK сохранил фото, но не вернул owner_id/id', 'VK_UPLOAD', saved);
      return { attachment, kind:'photo' };
    } catch (photoErr) {
      // VK periodically returns a bulk upload endpoint or rejects phone formats
      // (HEIC/WEBP). Do not fail the whole composer: retry through documents so
      // the operator can still attach the file from the device.
      console.warn('[VK photo upload] photo path failed, document fallback:', photoErr?.code||photoErr?.message||photoErr);
      try {
        const doc = await uploadVkDocument(session, peerId, buffer, filename || 'photo.jpg', mimeType || 'application/octet-stream', 'doc');
        return {...doc, kind:'photo-fallback-doc', fallback:true, photoError:String(photoErr?.code||photoErr?.message||'VK_UPLOAD')};
      } catch (docErr) {
        if (photoErr instanceof VkApiError) throw new VkApiError(`${photoErr.message}; резервная загрузка файла тоже не удалась: ${docErr.message}`, photoErr.code || 'VK_UPLOAD', {photo:photoErr.details,doc:docErr.details});
        throw docErr;
      }
    }
  }
  if (type === 'audio_message') return uploadVkDocument(session, peerId, buffer, filename || 'voice.ogg', mimeType || 'audio/ogg', 'audio_message');
  if (type === 'video') {
    try {
      const p = { name: filename || 'Видео из CRM', is_private: 1 }; if (session.vkGroupId) p.group_id = session.vkGroupId;
      const info = await vkCall(session.vkToken, 'video.save', p);
      if (!info?.upload_url) throw new VkApiError('VK не вернул upload_url для видео', 'VK_UPLOAD', info);
      await postMultipart(info.upload_url, 'video_file', buffer, filename || 'video.mp4', mimeType || 'video/mp4');
      const owner = Number(info?.owner_id || (session.vkGroupId ? -Math.abs(session.vkGroupId) : 0));
      const vid = Number(info?.video_id || 0);
      const attachment = owner && vid ? `video${owner}_${vid}` : '';
      if (!attachment) throw new VkApiError('VK не вернул video_id', 'VK_UPLOAD', info);
      return { attachment, kind:'video' };
    } catch (err) {
      console.warn('[VK video] video.save недоступен, отправляю видео как документ:', err?.message || err);
      return uploadVkDocument(session, peerId, buffer, filename || 'video.mp4', mimeType || 'video/mp4', 'doc');
    }
  }
  return uploadVkDocument(session, peerId, buffer, filename || 'file', mimeType || 'application/octet-stream', 'doc');
}

async function uploadVkMedia(session, { peerId, type, filename, mimeType, dataBase64 }) {
  const buffer = Buffer.from(String(dataBase64 || ''), 'base64');
  return uploadVkMediaBuffer(session,{peerId,type,filename,mimeType,buffer});
}

async function createCustomerFromDraft(session, draft) {
  const vkId = Number(draft?.vkId || 0);
  if (vkId > 0) {
    const existing = await getCustomerByVkId(session, vkId);
    if (existing?.id) return { created:false, client:existing };
  }

  const fullName = String(draft?.fullName || '').trim() || (vkId ? `VK ${vkId}` : 'Новый клиент');
  // Keep the create call intentionally small. BlueSales' customers.add endpoint can
  // return its generic HTML error page when optional fields don't match an
  // installation's model. Additional CRM fields are applied with customers.update
  // after the client has a stable BlueSales ID.
  const createPayload = { fullName };
  if (vkId > 0) createPayload.vk = { id:String(vkId) };

  let raw = null;
  let createError = null;
  try {
    raw = await bsCall(session, 'customers.add', createPayload);
  } catch (err) {
    createError = err;
    // BlueSales can commit the write and still answer with its HTML error page.
    // Always check by VK id before retrying to avoid duplicate clients.
    if (vkId > 0) {
      try {
        clearAccountCache(session.login);
        const committed = await getCustomerByVkId(session, vkId);
        if (committed?.id) return { created:true, client:committed, recoveredFromUpstreamError:true };
      } catch {}
    }
    if (!['BAD_RESPONSE','HTTP','API'].includes(String(err?.code || ''))) throw err;

    console.warn('[BlueSales customers.add] non-JSON/API failure; trying customers.addMany compatibility fallback');
    try {
      raw = await bsCall(session, 'customers.addMany', [createPayload]);
      createError = null;
    } catch (batchErr) {
      if (vkId > 0) {
        try {
          clearAccountCache(session.login);
          const committed = await getCustomerByVkId(session, vkId);
          if (committed?.id) return { created:true, client:committed, recoveredFromUpstreamError:true };
        } catch {}
      }
      const details = {
        add: createError?.details || createError?.message || null,
        addMany: batchErr?.details || batchErr?.message || null
      };
      throw new BlueSalesError(
        'BlueSales не смог создать карточку через customers.add и customers.addMany. Сервер BlueSales вернул внутреннюю ошибку; повторите через несколько секунд.',
        batchErr?.code || createError?.code || 'API',
        details
      );
    }
  }

  clearAccountCache(session.login);
  let client = null;
  if (vkId > 0) {
    try { client = await getCustomerByVkId(session, vkId); } catch {}
  }
  if (!client) {
    const candidate = Array.isArray(raw) ? raw[0] : raw?.customer || raw?.Customer || raw;
    const normalized = normalizeCustomer(candidate || createPayload);
    if (normalized?.id) client = normalized;
  }

  // Apply the optional fields only after creation. A failure here must not make the
  // UI think that the whole create operation failed when the customer already exists.
  if (client?.id) {
    const update = { id:Number(client.id) };
    if (draft?.city) update.city = { name:String(draft.city) };
    if (draft?.crmStatus) update.crmStatus = { name:String(draft.crmStatus) };
    if (draft?.firstContactDate) update.firstContactDate = String(draft.firstContactDate);
    if (draft?.nextContactDate) update.nextContactDate = String(draft.nextContactDate);
    if (draft?.phone) update.mobilePhone = String(draft.phone);
    if (draft?.email) update.email = String(draft.email);
    if (draft?.managerLogin) update.manager = { login:String(draft.managerLogin) };
    if (draft?.shortNotes) update.shortNotes = String(draft.shortNotes);
    if (draft?.comments) update.comments = String(draft.comments);
    if (Object.keys(update).length > 1) {
      try {
        await bsCall(session, 'customers.update', update);
        clearAccountCache(session.login);
        if (vkId > 0) client = (await getCustomerByVkId(session, vkId)) || client;
        else client = (await getCustomerById(session, Number(client.id))) || client;
      } catch (updateErr) {
        console.warn('[BlueSales customers.update after add] client created, optional fields were not fully applied:', updateErr?.message || updateErr);
      }
    }
  }

  if (!client) {
    // Last verification for installations whose add endpoint returns an unusual body.
    if (vkId > 0) {
      try { client = await getCustomerByVkId(session, vkId); } catch {}
    }
  }
  if (!client?.id) {
    throw new BlueSalesError('BlueSales принял запрос на создание, но не вернул ID клиента и карточка не находится по VK ID.', 'BAD_RESPONSE', raw);
  }
  return { created:true, client };
}


// -----------------------------------------------------------------------------
// v22.0: local mirror of BlueSales system-user permissions and admin phrase CRUD.
// Public BlueSales API exposes users.get but no documented users.add/update or
// permission/quick-phrase write API. Therefore users are read from users.get and
// enriched with the exact roles/status/section access shown in the user's
// BlueSales "Пользователи системы" screenshots. Phrase editing is persisted
// locally and remains scoped by the BlueSales Managers column.
// -----------------------------------------------------------------------------
const ADMIN_SECTION_KEYS = [
  'Клиенты','Заказы','Мессенджер','Рассылки','Боты','Выручка и конверсия',
  'Выручка по источникам','Выручка по менеджерам','Предоплаты от клиентов',
  'Продажи по услугам','Быстрые фразы','Справочники'
];

function userAccessPath(){ return path.join(ROOT,'data','user-access.json'); }
function loadUserAccess(){
  try{
    const raw=JSON.parse(fs.readFileSync(userAccessPath(),'utf8'));
    return Array.isArray(raw?.users)?raw:{version:1,users:[]};
  }catch{return {version:1,users:[]};}
}
function saveUserAccess(raw){
  const out={version:Number(raw?.version||1),source:raw?.source||'mobile-admin',updatedAt:new Date().toISOString(),users:Array.isArray(raw?.users)?raw.users:[]};
  fs.writeFileSync(userAccessPath(),JSON.stringify(out,null,2),'utf8');
  return out;
}
function accessRecordFor(value){
  const key=String(value?.login||value?.email||value?.name||value?.id||value||'').trim().toLowerCase();
  if(!key)return null;
  return loadUserAccess().users.find(u=>[u.login,u.email,u.name,u.id].some(x=>String(x||'').trim().toLowerCase()===key))||null;
}
function decorateUserAccess(user){
  const u={...(user||{})};
  const rec=accessRecordFor(u)||null;
  if(rec){
    u.role=rec.role||u.role||'manager';
    u.status=rec.status||u.status||'active';
    u.sections=Array.isArray(rec.sections)?rec.sections:[];
    u.color=rec.color||u.color||'';
    u.email=rec.email||u.email||u.login||'';
    u.blueSalesEditUrl=rec.blueSalesEditUrl||'';
  }else{
    u.role=u.role||'manager';u.status=u.status||'active';u.sections=Array.isArray(u.sections)?u.sections:[];
  }
  return u;
}
function isAdminRole(role){
  return ['admin','administrator','creator_admin','creator'].includes(String(role||'').toLowerCase());
}
function isAdminSession(session){
  return isAdminRole(decorateUserAccess(session?.currentUser||{login:session?.login}).role);
}
function requireAdminSession(session,res){
  if(!isAdminSession(session)){sendJson(res,403,{ok:false,error:'ADMIN_REQUIRED',message:'Раздел доступен только администраторам BlueSales.'});return false;}
  return true;
}
function phraseStore(){
  try{
    const raw=JSON.parse(fs.readFileSync(quickPhrasesPath(),'utf8'));
    if(raw&&Array.isArray(raw.groups))return raw;
  }catch{}
  return {version:4,source:'mobile-admin',groups:[]};
}
function savePhraseStore(store){
  const safe={...(store||{}),version:Math.max(Number(store?.version||4),4),source:store?.source||'mobile-admin',updatedAt:new Date().toISOString(),groups:Array.isArray(store?.groups)?store.groups:[]};
  fs.writeFileSync(quickPhrasesPath(),JSON.stringify(safe,null,2),'utf8');
  return safe;
}
function phraseId(){return 'p-'+crypto.randomBytes(7).toString('hex');}
function groupId(name){return 'g-'+crypto.createHash('sha1').update(String(name||'Без раздела')).digest('hex').slice(0,10);}
function cleanPhraseInput(b){
  const rawText=String(b?.text||'').replace(/\r\n/g,'\n');
  const attachmentRe=/\[((?:photo|video|doc|audio_message)-?\d+_\d+(?:_[A-Za-z0-9]+)?)\]/gi;
  const fromText=[];
  let m;
  while((m=attachmentRe.exec(rawText))) fromText.push(m[1]);
  const fromField=(Array.isArray(b?.attachments)?b.attachments:[]).map(x=>String(x||'').trim());
  const attachments=[...new Set([...fromField,...fromText].filter(x=>/^(?:photo|video|doc|audio_message)-?\d+_\d+(?:_[A-Za-z0-9]+)?$/i.test(x)))];
  // BlueSales stores VK attachments alongside the phrase. If an admin pastes
  // [photo...], [video...], [audio_message...] or [doc...] back into the text,
  // keep it as a real attachment instead of showing the service token to the client.
  const text=rawText.replace(attachmentRe,'').replace(/\n{3,}/g,'\n\n').trim();
  return {
    name:String(b?.name||'').trim(),
    text,
    hotkey:String(b?.hotkey||'').trim(),
    managers:(Array.isArray(b?.managers)?b.managers:[]).map(x=>String(x||'').trim()).filter(Boolean),
    attachments
  };
}
function findPhrase(store,id){
  for(const g of store.groups||[]){
    const i=(g.phrases||[]).findIndex(p=>String(p.id)===String(id));
    if(i>=0)return {group:g,index:i,phrase:g.phrases[i]};
  }
  return null;
}
function ensurePhraseGroup(store,name){
  const n=String(name||'Без раздела').trim()||'Без раздела';
  let g=(store.groups||[]).find(x=>String(x.name||'').trim().toLowerCase()===n.toLowerCase());
  if(!g){g={id:groupId(n),name:n,phrases:[]};store.groups.push(g);}
  if(!Array.isArray(g.phrases))g.phrases=[];
  return g;
}
function movePhraseInStore(store,id,{groupName='',beforeId='',afterId='',index=null,position=''}={}){
  const found=findPhrase(store,id);
  if(!found)return null;
  const phrase=found.phrase;
  const sourceName=found.group.name;
  found.group.phrases.splice(found.index,1);
  const target=ensurePhraseGroup(store,String(groupName||sourceName).trim()||sourceName);
  let targetIndex=target.phrases.length;
  if(beforeId){
    const i=target.phrases.findIndex(p=>String(p.id)===String(beforeId));
    if(i>=0)targetIndex=i;
  }else if(afterId){
    const i=target.phrases.findIndex(p=>String(p.id)===String(afterId));
    if(i>=0)targetIndex=i+1;
  }else if(index!==null&&index!==''&&Number.isFinite(Number(index))){
    targetIndex=Math.max(0,Math.min(target.phrases.length,Number(index)));
  }else if(position==='start'){
    targetIndex=0;
  }
  target.phrases.splice(targetIndex,0,phrase);
  store.groups=store.groups.filter(g=>(g.phrases||[]).length);
  return {phrase,group:target.name,index:targetIndex,fromGroup:sourceName};
}
async function adminUsersForSession(session){
  let apiUsers=[];
  try{
    const raw=await bsCall(session,'users.get',null);
    apiUsers=arrayFromResponse(raw,['users','Users']).map(normalizeUser);
  }catch(err){console.warn('[Admin users] users.get:',err?.message||err);}
  const seed=loadUserAccess().users||[];
  const out=[];const seen=new Set();
  for(const raw of [...apiUsers,...seed]){
    const u=decorateUserAccess(raw);
    const k=String(u.login||u.id||u.name).toLowerCase();
    if(!k||seen.has(k))continue;seen.add(k);out.push(u);
  }
  return out;
}


function notificationDefaultStore(){return {version:2,rules:[],pairCodes:{},notified:{},outbox:{},updatedAt:0}}
function hydrateNotificationStoreFromEnvironment(input){
  const store={...notificationDefaultStore(),...(input&&typeof input==='object'?input:{})};
  store.rules=Array.isArray(store.rules)?store.rules:[];
  if(!NOTIFICATION_DEFAULT_CHAT_ID||!NOTIFICATION_DEFAULT_MANAGER)return store;
  const existing=findNotificationRule(store,NOTIFICATION_DEFAULT_MANAGER);
  const envRule=safeNotificationRule({
    ...(existing||{}),manager:NOTIFICATION_DEFAULT_MANAGER,enabled:true,
    telegramChatId:NOTIFICATION_DEFAULT_CHAT_ID,
    managerFilters:existing?.managerFilters?.length?existing.managerFilters:multiParamValues(NOTIFICATION_DEFAULT_MANAGER_FILTERS),
    statuses:existing?.statuses?.length?existing.statuses:multiParamValues(NOTIFICATION_DEFAULT_STATUSES),
    slaMinutes:existing?.slaMinutes||NOTIFICATION_DEFAULT_SLA,
    workStart:existing?.workStart||NOTIFICATION_DEFAULT_WORK_START,
    workEnd:existing?.workEnd||NOTIFICATION_DEFAULT_WORK_END,
    dialogFilter:existing?.dialogFilter||'unanswered',queueAlerts:existing?.queueAlerts!==false
  });
  const index=store.rules.findIndex(r=>notificationRuleKey(r.manager)===notificationRuleKey(NOTIFICATION_DEFAULT_MANAGER));
  if(index>=0)store.rules[index]=envRule;else store.rules.push(envRule);
  return store;
}
function readNotificationStore(){
  try{
    if(!fs.existsSync(NOTIFICATION_STORE))return hydrateNotificationStoreFromEnvironment(notificationDefaultStore());
    const raw=JSON.parse(fs.readFileSync(NOTIFICATION_STORE,'utf8'));
    return hydrateNotificationStoreFromEnvironment(raw);
  }catch(err){console.warn('[notifications store read]',err?.message||err);return hydrateNotificationStoreFromEnvironment(notificationDefaultStore())}
}
function writeNotificationStore(store){
  try{fs.mkdirSync(path.dirname(NOTIFICATION_STORE),{recursive:true});store.updatedAt=Date.now();fs.writeFileSync(NOTIFICATION_STORE,JSON.stringify(store,null,2),'utf8');return true}
  catch(err){console.warn('[notifications store write]',err?.message||err);return false}
}
function safeNotificationRule(rule={}){
  const manager=String(rule.manager||'').trim();
  return {
    id:String(rule.id||crypto.randomUUID?.()||randomToken(8)),
    manager,
    enabled:Boolean(rule.enabled),
    dialogFilter:['unanswered','unread'].includes(String(rule.dialogFilter||rule.filter||''))?String(rule.dialogFilter||rule.filter):'unanswered',
    managerFilters:multiParamValues(Array.isArray(rule.managerFilters)?rule.managerFilters.join(','):(rule.managerFilters||manager)),
    statuses:multiParamValues(Array.isArray(rule.statuses)?rule.statuses.join(','):rule.statuses),
    queueAlerts:rule.queueAlerts!==false,
    slaMinutes:Math.min(Math.max(Number(rule.slaMinutes||8),1),240),
    workStart:/^\d{2}:\d{2}$/.test(String(rule.workStart||''))?String(rule.workStart):'10:00',
    workEnd:/^\d{2}:\d{2}$/.test(String(rule.workEnd||''))?String(rule.workEnd):'22:00',
    timezone:String(rule.timezone||NOTIFICATION_DEFAULT_TZ||'Europe/Moscow').trim(),
    repeatMinutes:Math.min(Math.max(Number(rule.repeatMinutes||0),0),1440),
    telegramChatId:String(rule.telegramChatId||'').trim(),
    telegramUsername:String(rule.telegramUsername||'').trim(),
    telegramFirstName:String(rule.telegramFirstName||'').trim(),
    updatedAt:Number(rule.updatedAt||Date.now())
  }
}
function notificationRulePublic(rule={}){const r=safeNotificationRule(rule);return {...r,telegramChatId:undefined,telegramConnected:Boolean(r.telegramChatId)}}
function notificationRuleKey(manager=''){return String(manager||'').trim().toLocaleLowerCase('ru-RU')}
function findNotificationRule(store,manager=''){const k=notificationRuleKey(manager);return (store.rules||[]).find(r=>notificationRuleKey(r.manager)===k)||null}
function upsertNotificationRule(store,input={}){
  const manager=String(input.manager||'').trim();if(!manager)throw Object.assign(new Error('Выберите менеджера'),{status:400});
  const existing=findNotificationRule(store,manager)||{};const next=safeNotificationRule({...existing,...input,manager,telegramChatId:existing.telegramChatId||input.telegramChatId||'',telegramUsername:existing.telegramUsername||'',telegramFirstName:existing.telegramFirstName||'',updatedAt:Date.now()});
  const idx=(store.rules||[]).findIndex(r=>notificationRuleKey(r.manager)===notificationRuleKey(manager));if(idx>=0)store.rules[idx]=next;else store.rules.push(next);return next
}
function notificationActorNames(session){return [session?.currentUser?.name,session?.currentUser?.login,session?.login].map(x=>String(x||'').trim()).filter(Boolean)}
function notificationOutboxKey(value=''){return String(value||'').replace(/[^A-Za-z0-9:_-]/g,'').slice(0,160)}
function upsertNotificationOutbox(store,input={},session){
  store.outbox=store.outbox&&typeof store.outbox==='object'?store.outbox:{};
  const requestId=notificationOutboxKey(input.requestId||input.clientRequestId||input.localId);if(!requestId)throw Object.assign(new Error('Не указан идентификатор исходящего сообщения'),{status:400});
  const current=store.outbox[requestId]||{},status=['queued','sending','error','sent','removed'].includes(String(input.status))?String(input.status):'queued';
  const row={...current,requestId,peerId:Number(input.peerId||current.peerId||0),peerName:String(input.peerName||current.peerName||'').slice(0,160),snippet:String(input.text||input.snippet||current.snippet||'').trim().replace(/\s+/g,' ').slice(0,240),manager:String(current.manager||notificationActorNames(session)[0]||''),status,attempts:Math.max(0,Number(input.attempts??current.attempts??0)),error:String(input.error||'').slice(0,300),createdAt:Number(current.createdAt||input.createdAt||Date.now()),updatedAt:Date.now(),alerted:Boolean(current.alerted)};
  store.outbox[requestId]=row;return row
}
function notificationOutboxRows(store,session){
  const names=notificationActorNames(session).map(notificationRuleKey),cutoff=Date.now()-7*24*60*60*1000;store.outbox=store.outbox&&typeof store.outbox==='object'?store.outbox:{};
  for(const[k,row]of Object.entries(store.outbox))if(Number(row?.updatedAt||0)<cutoff||row?.status==='removed'||(row?.status==='sent'&&Date.now()-Number(row.updatedAt||0)>60*60*1000))delete store.outbox[k];
  return Object.values(store.outbox).filter(row=>['queued','sending','error'].includes(row.status)&&(!names.length||names.includes(notificationRuleKey(row.manager)))).sort((a,b)=>Number(a.createdAt||0)-Number(b.createdAt||0))
}
async function telegramCall(method,payload={}){
  if(!TELEGRAM_BOT_TOKEN)throw Object.assign(new Error('TELEGRAM_BOT_TOKEN не настроен'),{status:503,code:'TELEGRAM_NOT_CONFIGURED'});
  const response=await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
  const data=await response.json().catch(()=>({ok:false,description:`HTTP ${response.status}`}));
  if(!response.ok||!data?.ok)throw Object.assign(new Error(data?.description||`Telegram HTTP ${response.status}`),{status:502,code:'TELEGRAM_API'});
  return data.result
}
async function sendTelegramText(chatId,text,{url='',button='Открыть диалог'}={}){
  const payload={chat_id:String(chatId),text:String(text||''),disable_web_page_preview:true};
  if(url)payload.reply_markup={inline_keyboard:[[{text:button,url}]]};
  return telegramCall('sendMessage',payload)
}
async function refreshTelegramBotIdentity(){
  if(!TELEGRAM_BOT_TOKEN)return null;
  const me=await telegramCall('getMe');
  if(me?.username)activeTelegramBotUsername=String(me.username).replace(/^@/,'');
  return me
}
async function ensureTelegramWebhook(){
  if(!TELEGRAM_BOT_TOKEN||!PUBLIC_BASE_URL)return false;
  await refreshTelegramBotIdentity();
  const url=`${PUBLIC_BASE_URL}/api/telegram/webhook`;
  await telegramCall('setWebhook',{url,secret_token:TELEGRAM_WEBHOOK_SECRET,allowed_updates:['message']});
  console.log(`[Telegram] webhook ready: ${url}`);return true
}
function notificationServiceSession(){
  if(!NOTIFICATION_BS_LOGIN||!NOTIFICATION_BS_PASSWORD||!PRESET_VK_TOKEN)return null;
  return {login:NOTIFICATION_BS_LOGIN,passwordHash:md5Upper(NOTIFICATION_BS_PASSWORD),webPassword:NOTIFICATION_BS_PASSWORD,vkToken:PRESET_VK_TOKEN,vkGroupId:PRESET_VK_COMMUNITY||null,currentUser:{login:NOTIFICATION_BS_LOGIN,name:NOTIFICATION_BS_LOGIN}}
}
function notificationCheckAuthorized(req,url){
  if(!NOTIFICATION_CHECK_SECRET)return false;
  const auth=String(req.headers.authorization||'');if(auth===`Bearer ${NOTIFICATION_CHECK_SECRET}`)return true;
  return String(url.searchParams.get('key')||'')===NOTIFICATION_CHECK_SECRET
}
const zonedFormatterCache=new Map();
function zonedParts(ts,timeZone){
  const key=String(timeZone||NOTIFICATION_DEFAULT_TZ);let fmt=zonedFormatterCache.get(key);
  if(!fmt){fmt=new Intl.DateTimeFormat('en-US',{timeZone:key,weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});zonedFormatterCache.set(key,fmt)}
  const out={weekday:'',hour:0,minute:0};for(const p of fmt.formatToParts(new Date(ts))){if(p.type==='weekday')out.weekday=p.value;if(p.type==='hour')out.hour=Number(p.value);if(p.type==='minute')out.minute=Number(p.value)}return out
}
function hhmmMinutes(value='00:00'){const [h,m]=String(value).split(':').map(Number);return Math.max(0,Math.min(1439,(Number(h)||0)*60+(Number(m)||0)))}
function notificationWorkingNow(ts,rule){
  const p=zonedParts(ts,rule.timezone),minute=p.hour*60+p.minute,start=hhmmMinutes(rule.workStart),end=hhmmMinutes(rule.workEnd);
  if(start===end)return true;return start<end?(minute>=start&&minute<end):(minute>=start||minute<end)
}
function workingMinutesUntilThreshold(startMs,endMs,rule,threshold){
  if(!Number.isFinite(startMs)||!Number.isFinite(endMs)||endMs<=startMs)return 0;
  const need=Math.max(1,Number(threshold||rule.slaMinutes||8)),maxLookback=8*24*60,span=Math.min(maxLookback,Math.ceil((endMs-startMs)/60000)+2);let count=0;
  let t=Math.max(startMs,endMs-maxLookback*60000);t=Math.floor(t/60000)*60000;
  for(let i=0;i<span&&t<endMs;i++,t+=60000){if(notificationWorkingNow(t,rule)&&++count>=need)return count}
  return count
}
async function unansweredSinceForPeer(session,peerId){
  const params={peer_id:Number(peerId),count:100,offset:0,extended:0};if(session.vkGroupId)params.group_id=session.vkGroupId;
  const raw=await vkCall(session.vkToken,'messages.getHistory',params),items=Array.isArray(raw?.items)?raw.items:[];let earliest=0,seenIncoming=false;
  for(const m of items){if(Number(m?.out||0)===1)break;seenIncoming=true;const d=Number(m?.date||0);if(d)earliest=d}
  return seenIncoming?earliest:0
}
async function loadUnansweredDialogsForNotifications(session,{maxPages=5}={}){
  return loadDialogsForNotifications(session,{maxPages,filter:'unanswered'});
}
async function loadDialogsForNotifications(session,{maxPages=5,filter='unanswered'}={}){
  const all=[];let offset=0;for(let page=0;page<maxPages;page++){
    const params={count:200,offset,filter:['unanswered','unread'].includes(filter)?filter:'unanswered',extended:1,fields:'photo_100,screen_name'};if(session.vkGroupId)params.group_id=session.vkGroupId;
    const raw=await vkCall(session.vkToken,'messages.getConversations',params),maps=vkIdentityMaps(raw||{}),rows=(raw?.items||[]).map(x=>normalizeVkDialog(x,maps));all.push(...rows);offset+=rows.length;if(!rows.length||offset>=Number(raw?.count||0))break
  }
  const vkIds=all.filter(d=>d.peerType==='user'&&d.peerId>0).map(d=>d.peerId);
  if(vkIds.length){try{const linked=await getCustomersByVkIds(session,vkIds),byVk=new Map(linked.filter(c=>c.social?.vkId).map(c=>[Number(c.social.vkId),c]));for(const d of all){const c=byVk.get(d.peerId);if(c)d.crm={clientId:c.id,fullName:c.fullName,crmStatus:c.crmStatus,manager:c.manager,managerLogin:c.managerLogin,tags:c.tags}}}catch(err){console.warn('[notifications crm link]',err?.message||err)}}
  return all
}
function notificationDialogUrl(peerId){const base=PUBLIC_BASE_URL||'';return base?`${base}/#/dialogs/${encodeURIComponent(peerId)}`:''}
async function runNotificationCheck({session=null,manual=false}={}){
  const store=readNotificationStore(),rules=(store.rules||[]).map(safeNotificationRule).filter(r=>r.enabled&&r.telegramChatId&&r.manager);if(!rules.length)return {ok:true,checked:0,sent:0,message:'Нет активных подключённых правил'};
  const s=session||notificationServiceSession();if(!s)throw Object.assign(new Error('Для фоновой проверки задайте BLUESALES_NOTIFICATION_LOGIN и BLUESALES_NOTIFICATION_PASSWORD в Render'),{status:503,code:'NOTIFICATION_CREDENTIALS'});
  const nowMs=Date.now(),activeRules=rules.filter(r=>notificationWorkingNow(nowMs,r));if(!activeRules.length)return {ok:true,checked:0,sent:0,outsideWorkingHours:true};
  const filters=[...new Set(activeRules.map(r=>r.dialogFilter))],dialogs=[];
  for(const filter of filters){const rows=await loadDialogsForNotifications(s,{filter});for(const row of rows)dialogs.push({...row,notificationFilter:filter})}
  const relevant=dialogs.filter(d=>activeRules.some(r=>r.dialogFilter===d.notificationFilter&&customerMatchesManager(d.crm||{},(r.managerFilters||[]).join(','))&&customerMatchesStatus(d.crm||{},(r.statuses||[]).join(','))));let sent=0,checked=0;
  for(const d of relevant){
    const matching=activeRules.filter(r=>r.dialogFilter===d.notificationFilter&&customerMatchesManager(d.crm||{},(r.managerFilters||[]).join(','))&&customerMatchesStatus(d.crm||{},(r.statuses||[]).join(',')));if(!matching.length)continue;
    let since=0;try{since=await unansweredSinceForPeer(s,d.peerId)}catch(err){console.warn('[notifications history]',d.peerId,err?.message||err);continue}if(!since)continue;checked++;
    const startMs=since*1000;
    for(const r of matching){
      const worked=workingMinutesUntilThreshold(startMs,nowMs,r,r.slaMinutes);if(worked<r.slaMinutes)continue;
      const key=`${r.id}:${d.peerId}:${since}`,prev=store.notified?.[key]||null;
      if(prev){if(!r.repeatMinutes)continue;if(nowMs-Number(prev.sentAt||0)<r.repeatMinutes*60000)continue}
      const client=d.crm?.fullName||d.name||`VK ${d.peerId}`,snippet=String(d.lastMessage||'').trim().replace(/\s+/g,' ').slice(0,180),text=`🔴 Просрочен ответ — ${r.manager}\n\n${client}\nБез ответа: больше ${r.slaMinutes} рабочих минут\n${snippet?`\n«${snippet}»`:''}`;
      await sendTelegramText(r.telegramChatId,text,{url:notificationDialogUrl(d.peerId)});store.notified[key]={sentAt:nowMs,manager:r.manager,peerId:d.peerId,since};sent++
    }
  }
  // Keep the small JSON store bounded on Render's ephemeral filesystem.
  const cutoff=nowMs-14*24*60*60*1000;for(const[k,v]of Object.entries(store.notified||{}))if(Number(v?.sentAt||0)<cutoff)delete store.notified[k];writeNotificationStore(store);
  return {ok:true,checked,sent,dialogs:dialogs.length,manual}
}
let notificationCheckRunning=false;
const notificationSchedulerState={lastAt:0,lastSuccessAt:0,lastError:'',checked:0,sent:0,source:''};
function notificationMissingEnvironment(){
  const rows=[];
  if(!TELEGRAM_BOT_TOKEN)rows.push('TELEGRAM_BOT_TOKEN');
  if(!NOTIFICATION_BS_LOGIN)rows.push('BLUESALES_NOTIFICATION_LOGIN');
  if(!NOTIFICATION_BS_PASSWORD)rows.push('BLUESALES_NOTIFICATION_PASSWORD');
  if(!PRESET_VK_TOKEN)rows.push('VK_TOKEN');
  return rows;
}
async function executeNotificationCheck(options,source){
  notificationSchedulerState.lastAt=Date.now();notificationSchedulerState.source=source;notificationSchedulerState.lastError='';
  try{
    const result=await runNotificationCheck(options);
    notificationSchedulerState.lastSuccessAt=Date.now();notificationSchedulerState.checked=Number(result?.checked||0);notificationSchedulerState.sent=Number(result?.sent||0);
    return result;
  }catch(err){notificationSchedulerState.lastError=String(err?.message||err).slice(0,400);throw err}
}
async function runScheduledNotificationCheck(){
  if(notificationCheckRunning||!TELEGRAM_BOT_TOKEN||!NOTIFICATION_BS_LOGIN||!NOTIFICATION_BS_PASSWORD||!PRESET_VK_TOKEN)return;
  notificationCheckRunning=true;try{await executeNotificationCheck({manual:false},'internal')}catch(err){console.warn('[notifications scheduler]',err?.message||err)}finally{notificationCheckRunning=false}
}
async function handleTelegramWebhook(req,res){
  if(!TELEGRAM_BOT_TOKEN)return sendJson(res,503,{ok:false,message:'Telegram bot не настроен'});
  if(TELEGRAM_WEBHOOK_SECRET&&String(req.headers['x-telegram-bot-api-secret-token']||'')!==TELEGRAM_WEBHOOK_SECRET)return sendJson(res,403,{ok:false});
  const update=await readJson(req),msg=update?.message;if(!msg?.chat?.id)return sendJson(res,200,{ok:true});
  const text=String(msg.text||'').trim(),chatId=String(msg.chat.id),store=readNotificationStore();
  if(/^\/id(?:\s|$)/i.test(text)){await sendTelegramText(chatId,`Ваш Telegram chat ID: ${chatId}\n\nДобавьте его в Render Environment как NOTIFICATION_DEFAULT_CHAT_ID, чтобы подключение сохранялось после перезапуска бесплатного сервера.`);return sendJson(res,200,{ok:true})}
  const m=text.match(/^\/start(?:\s+([A-Za-z0-9_-]+))?/i);
  if(m){const code=String(m[1]||'');const pair=store.pairCodes?.[code];if(pair&&Number(pair.expiresAt||0)>Date.now()){
      const rule=findNotificationRule(store,pair.manager)||upsertNotificationRule(store,{manager:pair.manager,enabled:false});rule.telegramChatId=chatId;rule.telegramUsername=String(msg.from?.username||'');rule.telegramFirstName=String(msg.from?.first_name||'');delete store.pairCodes[code];writeNotificationStore(store);await sendTelegramText(chatId,`✅ seb_gun CRM подключена.\nМенеджер: ${rule.manager}\nУведомления: ${rule.enabled?'включены':'пока выключены'}`);return sendJson(res,200,{ok:true})
    }
    await sendTelegramText(chatId,'Откройте «CRM → Ещё → Telegram-уведомления» и нажмите «Подключить Telegram».');return sendJson(res,200,{ok:true})
  }
  if(/^\/status/i.test(text)){const rule=(store.rules||[]).find(r=>String(r.telegramChatId||'')===chatId);await sendTelegramText(chatId,rule?`CRM подключена: ${rule.manager}. SLA ${rule.slaMinutes} мин, ${rule.workStart}–${rule.workEnd}.`:'Этот Telegram ещё не привязан к менеджеру.');return sendJson(res,200,{ok:true})}
  return sendJson(res,200,{ok:true})
}

async function apiRouter(req, res, url) {
  const pathname = url.pathname;

  if (pathname === '/api/health' && req.method === 'GET') {
    return sendJson(res, 200, { ok: true, version: VERSION, mode: 'web-only-bluesales+vk-direct-preconfigured', blueSalesApi: BS_BASE, blueSalesWebSync: BS_WEB_SYNC_ENABLED, quickPhrasesAuthority: 'local-bluesales-table-export+manager-filter+admin-editor', vkApiVersion: VK_API_VERSION, vkConfigured: Boolean(PRESET_VK_TOKEN), vkCommunity: PRESET_VK_COMMUNITY || null, vkCommunityUrl: PRESET_VK_COMMUNITY_URL || null, sttConfigured:sttReady(), sttMode:STT_PROVIDER==='google-legacy'?'async-google-speechrecognition':(STT_PROVIDER==='speechrecognition'?'async-google-speechrecognition':'async-local-whisper'), sttProvider:STT_PROVIDER, sttModel:STT_PROVIDER==='google-legacy'?'SpeechRecognition/Google':(STT_ENABLED?STT_MODEL:null), sttDtype:STT_DTYPE, sttNeedsApiKey:false, sttAsync:true, telegramConfigured:Boolean(TELEGRAM_BOT_TOKEN), notificationSchedulerConfigured:Boolean(NOTIFICATION_CHECK_SECRET), notificationWorkerCredentials:Boolean(NOTIFICATION_BS_LOGIN&&NOTIFICATION_BS_PASSWORD), sessionResume:true, clock:appClockPayload() });
  }


  if (pathname === '/api/telegram/webhook' && req.method === 'POST') {
    try{return await handleTelegramWebhook(req,res)}catch(err){console.error('[Telegram webhook]',err?.message||err);return sendJson(res,200,{ok:true})}
  }

  if (pathname === '/api/notifications/check' && (req.method === 'POST' || req.method === 'GET')) {
    if(!notificationCheckAuthorized(req,url))return sendJson(res,403,{ok:false,message:'Неверный ключ планировщика'});
    try{return sendJson(res,200,await executeNotificationCheck({manual:false},'external'))}catch(err){return handleApiError(res,err)}
  }

  if (pathname === '/api/auth/login' && req.method === 'POST') {
    const body = await readJson(req);
    const login = String(body.login || '').trim();
    const password = String(body.password || '');
    const vkToken = PRESET_VK_TOKEN;
    const vkGroupId = PRESET_VK_COMMUNITY || null;
    if (!login || !password) return sendJson(res, 400, { ok: false, message: 'Введите логин и пароль BlueSales' });
    if (!vkToken) return sendJson(res, 500, { ok: false, message: 'VK не настроен на сервере. Проверьте файл .env.local.' });
    const probe = { login, passwordHash: md5Upper(password) };
    let users, vkInfo;
    try {
      [users, vkInfo] = await Promise.all([bsCall(probe, 'users.get', null), probeVk(vkToken, vkGroupId)]);
    } catch (err) { return handleApiError(res, err); }
    const userList = arrayFromResponse(users, ['users', 'Users']).map(normalizeUser).map(decorateUserAccess);
    const currentUser = decorateUserAccess(currentUserFrom(userList, login));
    const cachedUi = readUiSync(login);
    const s = {
      login,
      passwordHash: probe.passwordHash,
      webPassword: password, // RAM only; never written to disk; used for manual BlueSales UI re-sync
      currentUser,
      uiProfile: cachedUi ? { ...cachedUi, source: 'bluesales-web-cache' } : null,
      uiSyncState: cachedUi ? 'cached' : 'pending',
      uiSyncMessage: '',
      vkToken,
      vkGroupId: vkInfo.groupId,
      vkGroupName: vkInfo.groupName,
      vkGroupScreenName: vkInfo.groupScreenName || '',
      vkGroupPhoto: vkInfo.groupPhoto,
      csrf: randomToken(16),
      expiresAt: now() + SESSION_TTL_MS,
      createdAt: now()
    };
    const sid = sealSessionSnapshot(s);
    sessions.set(sid, s);
    // Best-effort account sync: uses the same BlueSales credentials only to create an in-memory
    // authenticated web session and read the account's own Quick Phrases / UI metadata.
    // The plaintext password is not stored in the mobile session or written to disk.
    setImmediate(() => syncBlueSalesUi(s, password, userList).catch(err => console.warn('[BlueSales UI sync background]', err?.message || err)));
    return sendJson(res, 200, {
      ok: true, authenticated: true, login, csrf: s.csrf, users: userList, account: currentUser, isAdmin:isAdminSession(s), shareBaseUrl:shareBaseUrl(req),
      uiSync: { state: s.uiSyncState, source: s.uiProfile?.source || null },
      vk: { connected: true, groupId: s.vkGroupId, groupName: s.vkGroupName, groupScreenName: s.vkGroupScreenName || '', groupUrl: PRESET_VK_COMMUNITY_URL || '', groupPhoto: s.vkGroupPhoto, conversationsCount: vkInfo.conversationsCount }
    }, { 'Set-Cookie': sessionCookie(sid, req) });
  }

  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    const cookies = parseCookies(req);
    if (cookies[COOKIE_NAME]) sessions.delete(cookies[COOKIE_NAME]);
    return sendJson(res, 200, { ok: true }, { 'Set-Cookie': clearSessionCookie(req) });
  }

  if (pathname === '/api/session' && req.method === 'GET') {
    const s = getSession(req);
    if (!s) return sendJson(res, 200, { authenticated: false, version: VERSION });
    return sendJson(res, 200, { authenticated: true, login: s.login, csrf: s.csrf, version: VERSION, shareBaseUrl:shareBaseUrl(req), account: decorateUserAccess(s.currentUser || {login:s.login}), isAdmin:isAdminSession(s), uiSync: {state:s.uiSyncState || 'unknown', source:s.uiProfile?.source || null, message:s.uiSyncMessage || ''}, vk: { connected: Boolean(s.vkToken), groupId: s.vkGroupId || null, groupName: s.vkGroupName || 'VK Сообщество', groupScreenName: s.vkGroupScreenName || '', groupUrl: PRESET_VK_COMMUNITY_URL || '', groupPhoto: s.vkGroupPhoto || '' } });
  }

  const s = requireAuth(req, res);
  if (!s) return;

  if (pathname === '/api/notifications/settings' && req.method === 'GET') {
    const store=readNotificationStore();
    return sendJson(res,200,{ok:true,botConfigured:Boolean(TELEGRAM_BOT_TOKEN),botUsername:activeTelegramBotUsername,schedulerConfigured:Boolean(NOTIFICATION_CHECK_SECRET),internalSchedulerConfigured:notificationMissingEnvironment().length===0,workerCredentialsConfigured:Boolean(NOTIFICATION_BS_LOGIN&&NOTIFICATION_BS_PASSWORD),environmentPairingConfigured:Boolean(NOTIFICATION_DEFAULT_CHAT_ID&&NOTIFICATION_DEFAULT_MANAGER),missingEnvironment:notificationMissingEnvironment(),lastCheck:{...notificationSchedulerState},rules:(store.rules||[]).map(notificationRulePublic),filesystemPersistent:false});
  }
  if (pathname === '/api/notifications/settings' && req.method === 'POST') {
    if(!requireCsrf(req,res,s))return;
    try{const body=await readJson(req),store=readNotificationStore(),rule=upsertNotificationRule(store,body);writeNotificationStore(store);return sendJson(res,200,{ok:true,rule:notificationRulePublic(rule)})}catch(err){return handleApiError(res,err)}
  }
  if (pathname === '/api/notifications/pair' && req.method === 'POST') {
    if(!requireCsrf(req,res,s))return;
    try{if(!TELEGRAM_BOT_TOKEN)return sendJson(res,503,{ok:false,message:'В Render → Environment добавьте секрет TELEGRAM_BOT_TOKEN и дождитесь перезапуска сервиса'});await refreshTelegramBotIdentity();const body=await readJson(req),manager=String(body.manager||'').trim();if(!manager)return sendJson(res,400,{ok:false,message:'Выберите менеджера'});const store=readNotificationStore();upsertNotificationRule(store,{manager,...(findNotificationRule(store,manager)||{})});const code=randomToken(12);store.pairCodes=store.pairCodes||{};store.pairCodes[code]={manager,expiresAt:Date.now()+15*60*1000};writeNotificationStore(store);return sendJson(res,200,{ok:true,botUsername:activeTelegramBotUsername,pairUrl:`https://t.me/${activeTelegramBotUsername}?start=${code}`,expiresMinutes:15})}catch(err){return handleApiError(res,err)}
  }
  if (pathname === '/api/notifications/unpair' && req.method === 'POST') {
    if(!requireCsrf(req,res,s))return;const body=await readJson(req),store=readNotificationStore(),rule=findNotificationRule(store,body.manager);if(rule){rule.telegramChatId='';rule.telegramUsername='';rule.telegramFirstName='';writeNotificationStore(store)}return sendJson(res,200,{ok:true})
  }
  if (pathname === '/api/notifications/test' && req.method === 'POST') {
    if(!requireCsrf(req,res,s))return;try{const body=await readJson(req),store=readNotificationStore(),rule=findNotificationRule(store,body.manager);if(!rule?.telegramChatId)return sendJson(res,400,{ok:false,message:'Сначала подключите Telegram этого менеджера'});await sendTelegramText(rule.telegramChatId,`✅ Тест seb_gun CRM\nМенеджер: ${rule.manager}\nSLA: ${rule.slaMinutes} рабочих минут\nГрафик: ${rule.workStart}–${rule.workEnd}`);return sendJson(res,200,{ok:true})}catch(err){return handleApiError(res,err)}
  }
  if (pathname === '/api/notifications/check-now' && req.method === 'POST') {
    if(!requireCsrf(req,res,s))return;try{return sendJson(res,200,await executeNotificationCheck({session:s,manual:true},'manual'))}catch(err){return handleApiError(res,err)}
  }
  if (pathname === '/api/notifications/overview' && req.method === 'GET') {
    try {
      const store=readNotificationStore(),names=notificationActorNames(s),saved=(store.rules||[]).map(safeNotificationRule).find(r=>names.some(n=>notificationRuleKey(n)===notificationRuleKey(r.manager)));
      const rule=saved||safeNotificationRule({manager:names[0]||'',enabled:false,slaMinutes:8,managerFilters:[],statuses:[],dialogFilter:'unanswered'});
      const dialogs=await loadDialogsForNotifications(s,{maxPages:5,filter:rule.dialogFilter});
      const now=Math.floor(Date.now()/1000);
      const rows=dialogs.filter(d=>!d.lastMessageOut&&customerMatchesManager(d.crm||{},(rule.managerFilters||[]).join(','))&&customerMatchesStatus(d.crm||{},(rule.statuses||[]).join(','))).map(d=>({
        peerId:d.peerId,name:d.crm?.fullName||d.name||`VK ${d.peerId}`,
        manager:d.crm?.manager||d.crm?.managerLogin||'',crmStatus:d.crm?.crmStatus||'',
        snippet:String(d.lastMessage||'').trim().replace(/\s+/g,' ').slice(0,180),
        since:Number(d.lastMessageAt||0),waitMinutes:Math.max(0,Math.floor((now-Number(d.lastMessageAt||now))/60)),
        workingWaitMinutes:workingMinutesUntilThreshold(Number(d.lastMessageAt||now)*1000,Date.now(),rule,rule.slaMinutes)
      })).filter(d=>d.workingWaitMinutes>=rule.slaMinutes).sort((a,b)=>b.waitMinutes-a.waitMinutes);
      const outbox=notificationOutboxRows(store,s);writeNotificationStore(store);
      return sendJson(res,200,{ok:true,dialogs:rows,outbox,checkedAt:Date.now(),slaMinutes:rule.slaMinutes,dialogFilter:rule.dialogFilter,background:{ready:notificationMissingEnvironment().length===0,externalSchedulerConfigured:Boolean(NOTIFICATION_CHECK_SECRET),environmentPairingConfigured:Boolean(NOTIFICATION_DEFAULT_CHAT_ID&&NOTIFICATION_DEFAULT_MANAGER),missingEnvironment:notificationMissingEnvironment(),lastCheck:{...notificationSchedulerState}},filters:{managers:rule.managerFilters,statuses:rule.statuses}});
    } catch(err){return handleApiError(res,err)}
  }
  if (pathname === '/api/notifications/outbox-event' && req.method === 'POST') {
    if(!requireCsrf(req,res,s))return;
    try{const body=await readJson(req),store=readNotificationStore(),row=upsertNotificationOutbox(store,body,s);writeNotificationStore(store);return sendJson(res,200,{ok:true,row})}catch(err){return handleApiError(res,err)}
  }
  if (pathname === '/api/notifications/queue-alert' && req.method === 'POST') {
    if(!requireCsrf(req,res,s))return;
    try {
      const body=await readJson(req),store=readNotificationStore(),row=upsertNotificationOutbox(store,{...body,status:'error',attempts:body.attempts||2},s);
      const names=notificationActorNames(s);
      const rules=(store.rules||[]).map(safeNotificationRule).filter(r=>r.queueAlerts&&r.telegramChatId&&names.some(n=>notificationRuleKey(n)===notificationRuleKey(r.manager)));
      const who=String(body.peerName||'').trim()||`VK ${Number(body.peerId||0)}`;
      const text=`🟠 Сообщение стоит в очереди\n\nПолучатель: ${who}\nПричина: ${String(body.error||'сервер временно недоступен').slice(0,250)}\nCRM продолжит повторять отправку.`;
      for(const r of rules)await sendTelegramText(r.telegramChatId,text,{url:notificationDialogUrl(Number(body.peerId||0))});
      row.alerted=true;writeNotificationStore(store);
      return sendJson(res,200,{ok:true,sent:rules.length});
    } catch(err){return handleApiError(res,err)}
  }

  if (pathname === '/api/activity' && req.method === 'POST') {
    if (!requireCsrf(req, res, s)) return;
    try {
      const b=await readJson(req);
      const action=String(b.action||'activity').replace(/[^a-zA-Z0-9_.:-]/g,'-').slice(0,80);
      const details=safeUiDetails(b.details||'');
      console.log(`[UI] ${s.login} ${action}${details?` | ${details}`:''}`);
      return sendJson(res,200,{ok:true});
    } catch(err) { return handleApiError(res,err); }
  }

  if (pathname === '/api/media' && req.method === 'GET') {
    return proxyVkMedia(req, res, url.searchParams.get('url'));
  }

  if (pathname === '/api/voice/playback' && (req.method === 'GET' || req.method === 'HEAD')) {
    return proxyVoicePlayback(req, res, url.searchParams.get('url'));
  }

  if (pathname === '/api/voice/audio' && req.method === 'GET') {
    return proxyVoiceAudio(req, res, url.searchParams.get('url'));
  }

  if (pathname === '/api/vk/status' && req.method === 'GET') {
    try {
      const params = { count: 1, extended: 1 };
      if (s.vkGroupId) params.group_id = s.vkGroupId;
      const raw = await vkCall(s.vkToken, 'messages.getConversations', params);
      return sendJson(res, 200, { ok: true, connected: true, groupId: s.vkGroupId || null, groupName: s.vkGroupName || 'VK Сообщество', conversationsCount: Number(raw?.count || 0) });
    } catch (err) { return handleApiError(res, err); }
  }

  if (pathname === '/api/vk/dialogs' && req.method === 'GET') {
    try {
      const count = Math.min(Math.max(Number(url.searchParams.get('count') || 50), 1), 200);
      const offset = Math.max(Number(url.searchParams.get('offset') || 0), 0);
      const q = String(url.searchParams.get('q') || '').trim();
      const filter = ['all','unread','unanswered','important','archive'].includes(String(url.searchParams.get('filter') || 'all')) ? String(url.searchParams.get('filter') || 'all') : 'all';
      const includeCrm = String(url.searchParams.get('crm') || '1') !== '0';
      let raw, dialogs;
      if (q) {
        // v24.3: searchConversations discovers candidates; local ranking decides
        // what is actually a match. This prevents VK's broad candidate count
        // from being displayed as 50 unrelated results.
        const exactPeerId = extractPeerIdFromDialogSearch(q);
        if (exactPeerId) {
          const params = { peer_ids: String(exactPeerId), extended: 1, fields: 'photo_100,screen_name' };
          if (s.vkGroupId) params.group_id = s.vkGroupId;
          try {
            raw = await vkCall(s.vkToken, 'messages.getConversationsById', params);
            const maps = vkIdentityMaps(raw || {});
            dialogs = (raw?.items || []).map(x => normalizeVkDialog(x, maps)).filter(d => Number(d.peerId) === Number(exactPeerId));
          } catch (directErr) {
            console.warn('[Dialog exact lookup]', directErr?.message || directErr);
            raw = { count: 0, items: [] };
            dialogs = [];
          }
        } else {
          const params = { q, count: Math.min(Math.max(count, 50), 100), extended: 1, fields: 'photo_100,screen_name' };
          if (s.vkGroupId) params.group_id = s.vkGroupId;
          raw = await vkCall(s.vkToken, 'messages.searchConversations', params);
          const maps = vkIdentityMaps(raw || {});
          dialogs = (raw?.items || []).map(x => normalizeVkConversation(x, maps));
          dialogs = sortDialogsBySearchScore(dialogs, q);
        }

        const seenPeers = new Set(dialogs.map(d => Number(d.peerId)));
        if (includeCrm) try {
          const crmHits = [];
          const digits = q.replace(/\D/g, '');
          if (/^\d{5,}$/.test(digits)) {
            try { crmHits.push(...(await getCustomersPage(s, { count: 100, vkIds: [Number(digits)] })).customers); } catch {}
            try { crmHits.push(...(await getCustomersPage(s, { count: 100, phone: digits })).customers); } catch {}
          }
          if (!exactPeerId && (dialogs.length === 0 || /[@+\d]/.test(q))) {
            const all = await getAllCustomersComplete(s);
            for (const c of all) if (dialogSearchScore(q, customerDialogSearchValues(c)) > 0) crmHits.push(c);
          }

          const uniqueCrm = new Map(crmHits.map(c => [String(c.id || c.social?.vkId || ''), c]));
          const rankedCrm = [...uniqueCrm.values()]
            .map(c => ({c, score: dialogSearchScore(q, customerDialogSearchValues(c))}))
            .filter(x => x.score > 0)
            .sort((a,b) => b.score - a.score)
            .slice(0, 100)
            .map(x => x.c);

          for (const c of rankedCrm) {
            const peerId = Number(c.social?.vkId || 0);
            if (!peerId || seenPeers.has(peerId)) continue;
            seenPeers.add(peerId);
            dialogs.push({
              id:String(peerId), peerId, peerType:'user', name:c.fullName || `VK ${peerId}`, avatar:'', unreadCount:0,
              lastMessage:'', lastMessageAt:0, lastMessageOut:false, lastMessageAuthorId:0,
              crm:{clientId:c.id,fullName:c.fullName,phone:c.phone,email:c.email,vkId:c.social?.vkId,crmStatus:c.crmStatus,crmStatusColor:c.crmStatusColor,manager:c.manager,managerColor:c.managerColor,tags:c.tags,nextContactDate:c.nextContactDate}
            });
          }
          dialogs = sortDialogsBySearchScore(dialogs, q).slice(0, count);
        } catch (crmSearchErr) {
          console.warn('[Dialog CRM search]', crmSearchErr?.message || crmSearchErr);
          dialogs = sortDialogsBySearchScore(dialogs, q).slice(0, count);
        }
            } else {
        const params = { count, offset, filter, extended: 1, fields: 'photo_100,screen_name' };
        if (s.vkGroupId) params.group_id = s.vkGroupId;
        raw = await vkCall(s.vkToken, 'messages.getConversations', params);
        const maps = vkIdentityMaps(raw || {});
        dialogs = (raw?.items || []).map(x => normalizeVkDialog(x, maps));
      }

      // Link VK users to BlueSales CRM cards by VK id. Cached for 45s so polling does not hammer BlueSales.
      const vkIds = dialogs.filter(d => d.peerType === 'user' && d.peerId > 0).map(d => d.peerId).slice(0, 500);
      if (includeCrm && vkIds.length) {
        try {
          const linked = await getCustomersByVkIds(s, vkIds);
          const byVk = new Map(linked.filter(c => c.social?.vkId).map(c => [Number(c.social.vkId), c]));
          for (const d of dialogs) {
            const c = byVk.get(d.peerId);
            if (c) d.crm = { clientId: c.id, crmStatus: c.crmStatus, crmStatusColor:c.crmStatusColor, manager: c.manager, managerColor:c.managerColor, tags: c.tags, nextContactDate: c.nextContactDate };
          }
        } catch (linkErr) {
          console.warn('[VK->BlueSales link]', linkErr?.message || linkErr);
        }
      }
      const rawCount = Number(raw?.count || 0);
      const total = q ? dialogs.length : Number(raw?.count || dialogs.length);
      return sendJson(res, 200, { ok: true, dialogs, count: total, rawCount: q ? rawCount : undefined, offset: q ? 0 : offset, hasMore: q ? false : offset + dialogs.length < total, search: q || null, crmLinked: includeCrm });
    } catch (err) { return handleApiError(res, err); }
  }

  const vkExportMatch = pathname.match(/^\/api\/vk\/dialogs\/(-?\d+)\/export-text$/);
  if (vkExportMatch && req.method === 'GET') {
    try {
      const peerId=Number(vkExportMatch[1]),rows=[],seen=new Set();let offset=0,total=Infinity,guard=0;
      while(offset<total && guard++<50){
        const params={peer_id:peerId,count:200,offset,extended:1,fields:'photo_100,screen_name'};if(s.vkGroupId)params.group_id=s.vkGroupId;
        const raw=await vkCall(s.vkToken,'messages.getHistory',params),items=Array.isArray(raw?.items)?raw.items:[];
        const maps=await enrichVkMapsWithAdminAuthors(s,raw,vkIdentityMaps(raw||{}));
        total=Number(raw?.count||items.length);
        const pageMessages=applyVoiceTranscriptCache(peerId,items.map(item=>normalizeVkMessage(item,maps)));
        for(const m of pageMessages){const key=String(m.id||m.conversationMessageId);if(!seen.has(key)){seen.add(key);rows.push(m)}}
        offset+=items.length;if(!items.length)break;if(offset<total)await sleep(140);
      }
      // Copying must never start speech recognition for old messages. It only
      // reuses transcripts already in cache; otherwise a large dialog can lock
      // a free Render instance for minutes.
      const voices=rows.flatMap(m=>(m.attachments||[]).filter(a=>a.type==='audio_message'));
      const exportStt={transcribed:voices.filter(a=>String(a.transcript||'').trim()).length,missing:voices.filter(a=>!String(a.transcript||'').trim()).length,skipped:0};
      rows.sort((a,b)=>Number(a.date||0)-Number(b.date||0)||Number(a.id||0)-Number(b.id||0));
      const lineFor=m=>{const d=new Date(Number(m.date||0)*1000),stamp=d.toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).replace(',',''),author=String(m.displayAuthor||m.author||(m.out?`VK ${VK_DIRECT_AUTHOR}`:'Собеседник'));const parts=[];if(String(m.text||'').trim())parts.push(String(m.text).trim());for(const a of (m.attachments||[])){if(a.type==='audio_message')parts.push(a.transcript?`[Голосовое сообщение: ${a.transcript}]`:'[Голосовое сообщение]');else if(a.type==='photo')parts.push('[Фото]');else if(a.type==='video')parts.push(`[Видео${a.title?`: ${a.title}`:''}]`);else if(a.type==='doc')parts.push(`[Файл${a.title?`: ${a.title}`:''}]`);else if(a.type==='sticker')parts.push('[Стикер]');else parts.push(`[${a.title||a.type||'Вложение'}]`)}return`[${stamp}] ${author}: ${parts.join(' ')||'[Пустое сообщение]'}`};
      return sendJson(res,200,{ok:true,peerId,count:rows.length,total,text:rows.map(lineFor).join('\n'),voiceTranscribed:Number(exportStt.transcribed||0),voiceMissing:Number(exportStt.missing||0),voiceSkipped:Number(exportStt.skipped||0),sttConfigured:sttReady()});
    } catch(err){return handleApiError(res,err)}
  }

  const vkMessagesMatch = pathname.match(/^\/api\/vk\/dialogs\/(-?\d+)\/messages$/);
  if (vkMessagesMatch && req.method === 'GET') {
    try {
      const peerId = Number(vkMessagesMatch[1]);
      const count = Math.min(Math.max(Number(url.searchParams.get('count') || 100), 1), 200);
      const offset = Math.max(Number(url.searchParams.get('offset') || 0), 0);
      const params = { peer_id: peerId, count, offset, extended: 1, fields: 'photo_100,screen_name' };
      if (s.vkGroupId) params.group_id = s.vkGroupId;
      const raw = await vkCall(s.vkToken, 'messages.getHistory', params);
      const maps = await enrichVkMapsWithAdminAuthors(s, raw, vkIdentityMaps(raw || {}));
      const messages = applyVoiceTranscriptCache(peerId,(raw?.items || []).map(m => normalizeVkMessage(m, maps)).reverse());
      let crm = null;
      const includeCrm = String(url.searchParams.get('crm') || '1') !== '0';
      if (includeCrm && peerId > 0 && peerId < 2000000000) {
        try {
          const c = await getCustomerByVkId(s, peerId);
          if (c) crm = c;
        } catch (linkErr) { console.warn('[VK chat CRM link]', linkErr?.message || linkErr); }
      }
      let peer = { peerId, peerType: peerId >= 2000000000 ? 'chat' : (peerId < 0 ? 'group' : 'user'), name: '', avatar: '' };
      if (peer.peerType === 'user') {
        const p = maps.profiles.get(peerId);
        if (p) { peer.name = `${p.first_name || ''} ${p.last_name || ''}`.trim(); peer.avatar = String(p.photo_100 || ''); }
      } else if (peer.peerType === 'group') {
        const g = maps.groups.get(Math.abs(peerId));
        if (g) { peer.name = String(g.name || ''); peer.avatar = String(g.photo_100 || ''); }
      }
      if (!peer.name && crm?.fullName) peer.name = crm.fullName;
      if (!peer.name) peer.name = peer.peerType === 'chat' ? `Беседа ${peerId}` : `VK ${peerId}`;
      return sendJson(res, 200, { ok: true, peerId, peer, messages, total: Number(raw?.count || messages.length), crm });
    } catch (err) { return handleApiError(res, err); }
  }


if ((pathname === '/api/voice/transcribe' || pathname === '/api/stt/transcribe') && req.method === 'POST') {
  if (!requireCsrf(req, res, s)) return;
  try {
    const b=await readJson(req),peerId=Number(b.peerId||0),cmid=Number(b.conversationMessageId||0),audioUrl=String(b.audioUrl||'').trim();
    if(!peerId||!cmid||!audioUrl)return sendJson(res,400,{ok:false,message:'Не удалось определить аудиофайл голосового'});
    if(!STT_ENABLED)return sendJson(res,503,{ok:false,error:'STT_DISABLED',message:'Расшифровка отключена на сервере'});
    const cached=getVoiceTranscriptCache(peerId,cmid);
    if(cached)return sendJson(res,200,{ok:true,status:'done',available:true,transcript:cached.text,transcriptSource:cached.source,conversationMessageId:cmid,cached:true});
    const job=enqueueTranscriptJob(peerId,cmid,audioUrl);
    return sendJson(res,202,{ok:true,status:job.status||'queued',available:false,conversationMessageId:cmid,message:'Расшифровка запущена в фоне'});
  }catch(err){return handleApiError(res,err)}
}
if ((pathname === '/api/voice/transcribe/status' || pathname === '/api/stt/transcribe/status') && req.method === 'GET') {
  const peerId=Number(url.searchParams.get('peerId')||0),cmid=Number(url.searchParams.get('conversationMessageId')||0);
  if(!peerId||!cmid)return sendJson(res,400,{ok:false,message:'Не указан peerId или conversationMessageId'});
  const row=transcriptJobResponse(peerId,cmid);
  if(row.status==='error')return sendJson(res,200,row);
  return sendJson(res,200,row);
}

  if (vkMessagesMatch && req.method === 'POST') {
    if (!requireCsrf(req, res, s)) return;
    try {
      const peerId = Number(vkMessagesMatch[1]);
      const b = await readJson(req);
      const message = String(b.message || '').trim();
      const attachment = String(b.attachment || '').trim();
      const stickerId = Number(b.stickerId || 0);
      const replyTo = Number(b.replyTo || 0);
      const forwardMessageIds = (Array.isArray(b.forwardMessageIds)?b.forwardMessageIds:String(b.forwardMessageIds||'').split(',')).map(Number).filter(v=>Number.isFinite(v)&&v>0).slice(0,100);
      if (!message && !attachment && !stickerId && !forwardMessageIds.length) return sendJson(res, 400, { ok: false, message: 'Введите сообщение или прикрепите файл' });

      // v25.7: idempotent sending. Mobile browsers can repeat submit/touch events or
      // lose the HTTP response after VK has already accepted a message. The client
      // therefore sends one stable request id per draft. Repeating that request id
      // returns the same result instead of creating another VK message.
      pruneRecentMessageSends();
      const clientRequestId=normalizeClientRequestId(b.clientRequestId||'');
      const fingerprint=messageSendFingerprint(peerId,b);
      const actor=String(s.currentUser?.login||s.currentUser?.name||s.login||'session');
      const dedupeKey=clientRequestId?`id:${actor}:${peerId}:${clientRequestId}`:`legacy:${actor}:${peerId}:${fingerprint}`;
      const dedupeTtl=clientRequestId?10*60*1000:8000;
      const existing=recentMessageSends.get(dedupeKey);
      if(existing&&Number(existing.expiresAt||0)>Date.now()){
        try{const result=existing.promise?await existing.promise:existing.result;if(result)return sendJson(res,200,{...result,deduplicated:true})}catch{recentMessageSends.delete(dedupeKey)}
      }

      const params = { peer_id: peerId, random_id: clientRequestId?stableVkRandomId(clientRequestId):crypto.randomInt(1, 2147483647) };
      if (message) params.message = message;
      if (attachment) params.attachment = attachment;
      if (stickerId) params.sticker_id = stickerId;
      if (replyTo > 0) params.reply_to = replyTo;
      if (forwardMessageIds.length) params.forward_messages = forwardMessageIds.join(',');
      params.payload = JSON.stringify({seb_gun_crm:{author:String(s.currentUser?.name||s.login||'CRM'),version:VERSION,requestId:clientRequestId||undefined}});
      if (s.vkGroupId) params.group_id = s.vkGroupId;

      const sendPromise=(async()=>{const messageId=await vkCall(s.vkToken,'messages.send',params);return{ok:true,messageId,clientRequestId:clientRequestId||null}})();
      recentMessageSends.set(dedupeKey,{promise:sendPromise,expiresAt:Date.now()+dedupeTtl});
      try{
        const result=await sendPromise;
        recentMessageSends.set(dedupeKey,{result,expiresAt:Date.now()+dedupeTtl});
        return sendJson(res,200,result);
      }catch(err){recentMessageSends.delete(dedupeKey);throw err}
    } catch (err) { return handleApiError(res, err); }
  }

  if (pathname === '/api/vk/upload' && req.method === 'POST') {
    if (!requireCsrf(req, res, s)) return;
    try {
      if (url.searchParams.get('binary') === '1') {
        const peerId=Number(url.searchParams.get('peerId')||0),type=String(url.searchParams.get('type')||'doc'),filename=String(url.searchParams.get('filename')||'file'),mimeType=String(req.headers['x-upload-mime']||req.headers['content-type']||'application/octet-stream').split(';')[0].trim();
        if(!peerId)return sendJson(res,400,{ok:false,message:'Нужен peerId'});
        const buffer=await readBuffer(req,31*1024*1024);
        if(!buffer.length)return sendJson(res,400,{ok:false,message:'Файл пустой'});
        const result=await uploadVkMediaBuffer(s,{peerId,type,filename,mimeType,buffer});
        return sendJson(res,200,{ok:true,...result});
      }
      const b = await readJson(req, 45 * 1024 * 1024);
      const peerId = Number(b.peerId || 0);
      const type = String(b.type || 'doc');
      if (!peerId || !b.dataBase64) return sendJson(res, 400, {ok:false,message:'Нужны peerId и файл'});
      const result = await uploadVkMedia(s, {peerId,type,filename:String(b.filename||'file'),mimeType:String(b.mimeType||''),dataBase64:String(b.dataBase64||'')});
      return sendJson(res, 200, {ok:true,...result});
    } catch (err) { return handleApiError(res, err); }
  }

  const vkCreateClientMatch = pathname.match(/^\/api\/vk\/dialogs\/(\d+)\/create-client$/);
  if (vkCreateClientMatch && req.method === 'POST') {
    if (!requireCsrf(req, res, s)) return;
    try {
      const vkId = Number(vkCreateClientMatch[1]);
      const b = await readJson(req);
      if (!Number.isFinite(vkId) || vkId <= 0) return sendJson(res, 400, { ok:false, message:'Некорректный VK ID' });
      let profile = null;
      try {
        const rawProfile = await vkCall(s.vkToken, 'users.get', { user_ids:String(vkId), fields:'photo_100,city,screen_name' });
        profile = Array.isArray(rawProfile) ? rawProfile[0] : null;
      } catch {}
      const result = await createCustomerFromDraft(s, {
        ...b,
        vkId,
        vkName: String(profile?.screen_name || b?.vkName || ''),
        fullName: String(b?.fullName || (profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : `VK ${vkId}`)),
        city: String(b?.city || profile?.city?.title || '')
      });
      return sendJson(res, 200, {ok:true,...result});
    } catch (err) { return handleApiError(res, err); }
  }

  if (pathname === '/api/clients' && req.method === 'POST') {
    if (!requireCsrf(req, res, s)) return;
    try {
      const b = await readJson(req);
      const result = await createCustomerFromDraft(s, b);
      return sendJson(res, 200, {ok:true,...result});
    } catch (err) { return handleApiError(res, err); }
  }

  if (pathname === '/api/account-ui/import' && req.method === 'POST') {
    if (!requireCsrf(req, res, s)) return;
    try {
      const b = await readJson(req, 6 * 1024 * 1024);
      const html = String(b.html || '');
      if (!html.trim()) return sendJson(res, 400, {ok:false,message:'HTML пустой'});
      const parsed = BlueSalesWeb.parseImportedHtml(html,{currentUser:s.currentUser,login:s.login});
      const seed=loadBlueSalesUiSeed();
      const previous=s.uiProfile || readUiSync(s.login) || {};
      const ms=parsed.messenger||{};
      const profile={
        ...previous,
        ok:true,
        source:'bluesales-html-import',
        phrases:(parsed.phrases&&parsed.phrases.length)?parsed.phrases:(previous.phrases||[]),
        statusColors:{...(previous.statusColors||{}),...(ms.statusColors||{})},
        tagColors:{...(previous.tagColors||{}),...(ms.tagColors||{})},
        tagTextColors:{...(previous.tagTextColors||{}),...(ms.tagTextColors||{})},
        managerColors:{...(previous.managerColors||{})},
        managers:(ms.managers&&ms.managers.length)?ms.managers:(previous.managers||seed.managers||[]),
        statuses:(ms.statuses&&ms.statuses.length)?ms.statuses:(previous.statuses||seed.statuses||[]),
        tags:(ms.tags&&ms.tags.length)?ms.tags:(previous.tags||seed.tags||[]),
        loggedManager:ms.loggedManager||previous.loggedManager||null,
        selectedManagerId:ms.selectedManagerId||previous.selectedManagerId||'',
        capabilities:{...(previous.capabilities||{}),quickPhrases:Boolean((parsed.phrases||[]).length||(previous.phrases||[]).length)},
        discovered:{...(previous.discovered||{}),imported:true},
        savedAt:new Date().toISOString()
      };
      s.uiProfile=profile;
      s.uiSyncState='imported';
      s.uiSyncMessage='';
      if(ms.loggedManager && String(ms.loggedManager.login||'').toLowerCase()===String(s.login||'').toLowerCase()){
        s.currentUser=normalizeUser(ms.loggedManager);
      }
      writeUiSync(s.login,profile);
      clearAccountCache(s.login);
      return sendJson(res,200,{
        ok:true,
        source:profile.source,
        phrases:{groups:(profile.phrases||[]).length,count:(profile.phrases||[]).reduce((n,g)=>n+(g.phrases||[]).length,0)},
        dictionaries:{managers:(profile.managers||[]).length,statuses:(profile.statuses||[]).length,tags:(profile.tags||[]).length},
        message:'HTML BlueSales сохранён только для текущего логина.'
      });
    } catch(err){ return handleApiError(res,err); }
  }

  if (pathname === '/api/account-ui/sync' && req.method === 'POST') {
    if (!requireCsrf(req, res, s)) return;
    try {
      const usersRaw = await bsCall(s, 'users.get', null);
      const users = arrayFromResponse(usersRaw, ['users','Users']).map(normalizeUser);
      s.currentUser = currentUserFrom(users, s.login);
      const profile = await syncBlueSalesUi(s, s.webPassword, users, {force:true});
      clearAccountCache(s.login);
      const phrases = phrasePayloadForSession(s);
      const style = accountStyleProfile(s, users, []);
      return sendJson(res, profile?.ok ? 200 : 409, {
        ok:Boolean(profile?.ok),
        state:s.uiSyncState||'unknown',
        message:s.uiSyncMessage||profile?.message||'',
        source:s.uiProfile?.source||phrases.source||null,
        quickPhrases:{groups:(phrases.groups||[]).length,count:(phrases.groups||[]).reduce((n,g)=>n+(g.phrases||[]).length,0),source:phrases.source},
        colors:{statuses:Object.keys(style.statusColors||{}).length,tags:Object.keys(style.tagColors||{}).length,managers:Object.keys(style.managerColors||{}).length},
        capabilities:phrases.capabilities||{}
      });
    } catch (err) { return handleApiError(res, err); }
  }

  if (pathname === '/api/quick-phrases' && req.method === 'GET') {
    // The local BlueSales export is already account-filtered and must be immediately usable.
    // Do not block the drawer while the optional BlueSales web UI sync is still busy.
    const p = phrasePayloadForSession(s);
    return sendJson(res, 200, {ok:true, manager:s.currentUser || {login:s.login}, groups:p.groups, source:p.source, message:p.message||'', syncedAt:p.syncedAt, uiSync:{state:s.uiSyncState||'unknown',message:s.uiSyncMessage||''}, capabilities:p.capabilities, discovered:p.discovered||{}, editUrl:p.discovered?.phraseUrl||null});
  }


  if (pathname === '/api/admin/overview' && req.method === 'GET') {
    if(!requireAdminSession(s,res))return;
    try{
      const users=await adminUsersForSession(s);
      const store=phraseStore();
      const phraseCount=(store.groups||[]).reduce((n,g)=>n+(g.phrases||[]).length,0);
      return sendJson(res,200,{ok:true,isAdmin:true,currentUser:decorateUserAccess(s.currentUser||{login:s.login}),users,sections:ADMIN_SECTION_KEYS,phraseCount,groupCount:(store.groups||[]).length});
    }catch(err){return handleApiError(res,err);}
  }

  if (pathname === '/api/admin/users' && req.method === 'GET') {
    if(!requireAdminSession(s,res))return;
    try{return sendJson(res,200,{ok:true,users:await adminUsersForSession(s),sections:ADMIN_SECTION_KEYS});}
    catch(err){return handleApiError(res,err);}
  }

  if (pathname === '/api/admin/statuses' && req.method === 'GET') {
    if(!requireAdminSession(s,res))return;
    const seed=loadBlueSalesUiSeed();
    const names=new Set(statusOptions([]));
    for(const item of [...(Array.isArray(seed.statuses)?seed.statuses:[]),...(Array.isArray(s.uiProfile?.statuses)?s.uiProfile.statuses:[])]){
      const name=String(item?.name||item||'').trim();if(name)names.add(name);
    }
    const colors=accountStyleProfile(s,[],[]).statusColors||{};
    return sendJson(res,200,{ok:true,statuses:[...names].map(name=>({name,color:String(colors[name]||'')}))});
  }
  const adminStatusMatch=pathname.match(/^\/api\/admin\/statuses\/([^/]+)$/);
  if(adminStatusMatch && req.method==='PUT'){
    if(!requireAdminSession(s,res))return;
    if(!requireCsrf(req,res,s))return;
    try{
      const name=decodeURIComponent(adminStatusMatch[1]).trim(),b=await readJson(req),color=String(b?.color||'').trim();
      if(!name)return sendJson(res,400,{ok:false,message:'Не указан CRM-статус'});
      if(color&&!/^#[0-9a-f]{6}$/i.test(color))return sendJson(res,400,{ok:false,message:'Цвет должен быть в формате #RRGGBB'});
      const colors=loadStatusColorOverrides();if(color)colors[name]=color;else delete colors[name];
      fs.writeFileSync(statusColorsPath(),JSON.stringify(colors,null,2),'utf8');clearAccountCache(s.login);
      return sendJson(res,200,{ok:true,status:{name,color}});
    }catch(err){return handleApiError(res,err);}
  }

  const adminUserMatch=pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
  if(adminUserMatch && req.method==='PUT'){
    if(!requireAdminSession(s,res))return;
    if(!requireCsrf(req,res,s))return;
    try{
      const key=decodeURIComponent(adminUserMatch[1]).toLowerCase();
      const b=await readJson(req);
      const data=loadUserAccess();
      let rec=(data.users||[]).find(u=>[u.id,u.login,u.email,u.name].some(x=>String(x||'').toLowerCase()===key));
      if(!rec){
        const source=(await adminUsersForSession(s)).find(u=>[u.id,u.login,u.email,u.name].some(x=>String(x||'').toLowerCase()===key));
        if(!source)return sendJson(res,404,{ok:false,message:'Пользователь не найден'});
        rec={id:source.id||'',name:source.name||source.login||'',email:source.email||source.login||'',login:source.login||source.email||'',role:source.role||'manager',status:source.status||'active',sections:Array.isArray(source.sections)?source.sections:[],color:source.color||''};
        data.users.push(rec);
      }
      if(b.color!==undefined){
        const c=String(b.color||'').trim();
        if(c&&!/^#[0-9a-f]{6}$/i.test(c))return sendJson(res,400,{ok:false,message:'Цвет должен быть в формате #RRGGBB'});
        rec.color=c;
        const colors=loadManagerColorOverrides();if(c){colors[rec.name]=c;}else delete colors[rec.name];
        fs.writeFileSync(managerColorsPath(),JSON.stringify(colors,null,2),'utf8');
      }
      if(b.role!==undefined && ['manager','admin','creator_admin'].includes(String(b.role)))rec.role=String(b.role);
      if(b.status!==undefined && ['active','blocked'].includes(String(b.status)))rec.status=String(b.status);
      if(Array.isArray(b.sections))rec.sections=b.sections.map(String).filter(x=>ADMIN_SECTION_KEYS.includes(x));
      saveUserAccess(data);clearAccountCache(s.login);
      return sendJson(res,200,{ok:true,user:decorateUserAccess(rec),message:'Настройки мобильной версии сохранены. Права самого BlueSales меняются только в BlueSales.'});
    }catch(err){return handleApiError(res,err);}
  }

  if (pathname === '/api/admin/phrases' && req.method === 'GET') {
    if(!requireAdminSession(s,res))return;
    const store=phraseStore();
    return sendJson(res,200,{ok:true,groups:store.groups||[],users:await adminUsersForSession(s)});
  }
  if (pathname === '/api/admin/phrases' && req.method === 'POST') {
    if(!requireAdminSession(s,res))return;
    if(!requireCsrf(req,res,s))return;
    try{
      const b=await readJson(req,2*1024*1024), phrase=cleanPhraseInput(b);
      if(!phrase.name)return sendJson(res,400,{ok:false,message:'Введите название фразы'});
      const store=phraseStore(),g=ensurePhraseGroup(store,b.groupName);
      phrase.id=phraseId();g.phrases.push(phrase);savePhraseStore(store);clearAccountCache(s.login);
      return sendJson(res,200,{ok:true,phrase,group:g.name});
    }catch(err){return handleApiError(res,err);}
  }
  if (pathname === '/api/admin/phrase-groups' && req.method === 'POST') {
    if(!requireAdminSession(s,res))return;
    if(!requireCsrf(req,res,s))return;
    try{
      const b=await readJson(req,128*1024),name=String(b.name||'').trim();
      if(!name)return sendJson(res,400,{ok:false,message:'Введите название раздела'});
      const store=phraseStore();
      if((store.groups||[]).some(g=>String(g.name||'').trim().toLocaleLowerCase('ru-RU')===name.toLocaleLowerCase('ru-RU')))return sendJson(res,409,{ok:false,message:'Такой раздел уже существует'});
      const group=ensurePhraseGroup(store,name);savePhraseStore(store);clearAccountCache(s.login);
      return sendJson(res,200,{ok:true,group});
    }catch(err){return handleApiError(res,err)}
  }
  const adminPhraseMatch=pathname.match(/^\/api\/admin\/phrases\/([^/]+)$/);
  if(adminPhraseMatch && req.method==='PUT'){
    if(!requireAdminSession(s,res))return;
    if(!requireCsrf(req,res,s))return;
    try{
      const id=decodeURIComponent(adminPhraseMatch[1]),b=await readJson(req,2*1024*1024),store=phraseStore(),found=findPhrase(store,id);
      if(!found)return sendJson(res,404,{ok:false,message:'Фраза не найдена'});
      const phrase={...cleanPhraseInput(b),id};
      if(!phrase.name)return sendJson(res,400,{ok:false,message:'Введите название фразы'});
      // v24.5: normal editing NEVER changes the section or position.
      // Moving is a separate explicit action through /move.
      found.group.phrases[found.index]=phrase;
      savePhraseStore(store);
      clearAccountCache(s.login);
      return sendJson(res,200,{ok:true,phrase,group:found.group.name,index:found.index,moved:false});
    }catch(err){return handleApiError(res,err);}
  }
  const adminPhraseMoveMatch=pathname.match(/^\/api\/admin\/phrases\/([^/]+)\/move$/);
  if(adminPhraseMoveMatch && req.method==='POST'){
    if(!requireAdminSession(s,res))return;
    if(!requireCsrf(req,res,s))return;
    try{
      const id=decodeURIComponent(adminPhraseMoveMatch[1]),b=await readJson(req,512*1024),store=phraseStore();
      const moved=movePhraseInStore(store,id,b||{});
      if(!moved)return sendJson(res,404,{ok:false,message:'Фраза не найдена'});
      savePhraseStore(store);
      clearAccountCache(s.login);
      console.log(`[UI] ${s.login} phrase-move | ${JSON.stringify({id,from:moved.fromGroup,to:moved.group,index:moved.index})}`);
      return sendJson(res,200,{ok:true,...moved});
    }catch(err){return handleApiError(res,err);}
  }

  if(adminPhraseMatch && req.method==='DELETE'){
    if(!requireAdminSession(s,res))return;
    if(!requireCsrf(req,res,s))return;
    try{
      const id=decodeURIComponent(adminPhraseMatch[1]),store=phraseStore(),found=findPhrase(store,id);
      if(!found)return sendJson(res,404,{ok:false,message:'Фраза не найдена'});
      found.group.phrases.splice(found.index,1);store.groups=store.groups.filter(x=>(x.phrases||[]).length);savePhraseStore(store);clearAccountCache(s.login);
      return sendJson(res,200,{ok:true});
    }catch(err){return handleApiError(res,err);}
  }

  if (pathname === '/api/debug/ui-sync' && req.method === 'GET') {
    const p = phrasePayloadForSession(s);
    const style = accountStyleProfile(s, [], []);
    const count = (p.groups || []).reduce((n,g)=>n+(g.phrases||[]).length,0);
    return sendJson(res, 200, {
      ok:true, version:VERSION,
      account:s.currentUser || {login:s.login},
      uiSync:{state:s.uiSyncState||'unknown',source:s.uiProfile?.source||null,message:s.uiSyncMessage||'',syncedAt:p.syncedAt||null},
      quickPhrases:{source:p.source,count,groups:(p.groups||[]).length,allowed:Boolean(p.capabilities?.quickPhrases ?? count)},
      colors:{source:style.source,statuses:Object.keys(style.statusColors||{}).length,tags:Object.keys(style.tagColors||{}).length,managers:Object.keys(style.managerColors||{}).length},
      capabilities:p.capabilities||{},
      discovered:p.discovered||{}
    });
  }

  if (pathname === '/api/debug/account-ui' && req.method === 'GET') {
    const p = phrasePayloadForSession(s);
    const style = accountStyleProfile(s, [], []);
    return sendJson(res, 200, {
      ok: true,
      version: VERSION,
      account: s.currentUser || { login:s.login },
      sync: { state:s.uiSyncState || 'unknown', message:s.uiSyncMessage || '', source:s.uiProfile?.source || null, savedAt:s.uiProfile?.savedAt || p.syncedAt || null },
      quickPhrases: { source:p.source, groups:(p.groups || []).length, count:(p.groups || []).reduce((n,g)=>n+(g.phrases||[]).length,0), editUrl:p.discovered?.phraseUrl || null, message:p.message || '' },
      capabilities: p.capabilities || {},
      colors: { source:style.source, statuses:style.statusColors, tags:style.tagColors, tagTextColors:style.tagTextColors, managers:style.managerColors }, dictionaries:{managers:(s.uiProfile?.managers||loadBlueSalesUiSeed().managers||[]).length,statuses:(s.uiProfile?.statuses||loadBlueSalesUiSeed().statuses||[]).length,tags:(s.uiProfile?.tags||loadBlueSalesUiSeed().tags||[]).length}
    });
  }

  if (pathname === '/api/debug/bluesales'  && req.method === 'GET') {
    try {
      const result = { ok: true, version: VERSION, queue: { depth: blueSalesQueueDepth, gapMs: BS_QUEUE_GAP_MS, maxWaitMs: BS_QUEUE_MAX_WAIT_MS }, tests: {} };
      try {
        const usersRaw = await bsCall(s, 'users.get', null);
        result.tests.users = { ok: true, count: arrayFromResponse(usersRaw, ['users', 'Users']).length };
      } catch (err) {
        result.ok = false;
        result.tests.users = { ok: false, code: err.code || 'ERROR', message: err.message, details: err.details || undefined };
      }
      try {
        const page = await getCustomersPage(s, { count: 1, offset: 0 });
        result.tests.customers = { ok: true, count: page.count, notReturnedCount: page.notReturnedCount, received: page.customers.length };
      } catch (err) {
        result.ok = false;
        result.tests.customers = { ok: false, code: err.code || 'ERROR', message: err.message, details: err.details || undefined };
      }
      return sendJson(res, result.ok ? 200 : 502, result);
    } catch (err) { return handleApiError(res, err); }
  }

  if (pathname === '/api/meta' && req.method === 'GET') {
    try {
      // v24.5 PERF: metadata must never scan the entire customer database.
      // Statuses/tags/colors already come from the BlueSales UI profile/seed,
      // while users.get is one small API call. This keeps Orders/Services from
      // waiting behind dozens of customers.get pages in the organization queue.
      const cacheKey = `${s.login}:meta:v25.0`;
      const value = await cachedLoad(cacheKey, 5 * 60 * 1000, async () => {
        const seed = loadBlueSalesUiSeed();
        const ui = s.uiProfile || readUiSync(s.login) || {};
        let users = [];
        try {
          const usersRaw = await cachedLoad(`${s.login}:users:v25.0`, 5 * 60 * 1000, () => bsCall(s, 'users.get', null));
          users = arrayFromResponse(usersRaw, ['users', 'Users']).map(normalizeUser);
        } catch (err) {
          // Do not block CRM drawers if BlueSales is temporarily busy.
          console.warn('[meta users fallback]', err?.message || err);
        }

        const mergedUsers = users.map(decorateUserAccess);
        const userKeys = new Set(mergedUsers.map(u => String(u.id || u.login || u.name)));
        const fallbackManagers = [
          ...(Array.isArray(ui.managers) ? ui.managers : []),
          ...(Array.isArray(seed.managers) ? seed.managers : [])
        ];
        for (const u of fallbackManagers) {
          const nu = normalizeUser(u);
          const key = String(nu.id || nu.login || nu.name);
          if (key && !userKeys.has(key)) { userKeys.add(key); mergedUsers.push(decorateUserAccess(nu)); }
        }
        if (s.login && !mergedUsers.some(u => sameText(u.login, s.login))) {
          mergedUsers.unshift(decorateUserAccess(normalizeUser(s.currentUser || { login:s.login, name:s.currentUser?.name || s.login })));
        }

        const mergedTags = [];
        const tagKeys = new Set();
        for (const t of [
          ...(Array.isArray(ui.tags) ? ui.tags : []),
          ...(Array.isArray(seed.tags) ? seed.tags : [])
        ]) {
          const nt = { id:t?.id ?? null, name:String(t?.name || ''), color:String(t?.color || ''), textColor:String(t?.textColor || '') };
          const key = String(nt.id || nt.name);
          if (nt.name && !tagKeys.has(key)) { tagKeys.add(key); mergedTags.push(nt); }
        }

        const statusSet = new Set(statusOptions([]));
        for (const st of [
          ...(Array.isArray(ui.statuses) ? ui.statuses : []),
          ...(Array.isArray(seed.statuses) ? seed.statuses : [])
        ]) {
          const name = String(st?.name ?? st ?? '').trim();
          if (name) statusSet.add(name);
        }

        const style = accountStyleProfile(s, mergedUsers, []);
        return {
          users: mergedUsers,
          statuses: [...statusSet],
          tags: mergedTags,
          statusColors: style.statusColors,
          managerColors: style.managerColors,
          tagColors: style.tagColors,
          tagTextColors: style.tagTextColors,
          styleSource: style.source,
          currentUser: decorateUserAccess(s.currentUser || currentUserFrom(mergedUsers, s.login)),
          isAdmin: isAdminSession(s),
          capabilities: ui.capabilities || s.uiProfile?.capabilities || {},
          uiSync: { state:s.uiSyncState || 'unknown', source:ui.source || null, message:s.uiSyncMessage || '' },
          perf: { mode:'fast-meta', customerScan:false },
          clock: appClockPayload()
        };
      });
      return sendJson(res, 200, { ok: true, ...value });
    } catch (err) { return handleApiError(res, err); }
  }

  if (pathname === '/api/clients' && req.method === 'GET') {
    try {
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 20), 1), 100);
      const offset = Math.max(Number(url.searchParams.get('offset') || 0), 0);
      const q = String(url.searchParams.get('q') || '').trim();
      const status = String(url.searchParams.get('status') || '').trim();
      const manager = String(url.searchParams.get('manager') || '').trim();
      const tag = String(url.searchParams.get('tag') || '').trim();
      let customers = [], hasMore = false, totalHint = 0;

      if (multiParamValues(manager).length > 0 && !q && !status && !tag) {
        const managerValues=multiParamValues(manager);
        const managerKey=`${s.login}:clients-manager:${managerValues.join('|')}:${limit}:${offset}`;
        const page = await cachedLoad(managerKey,60000,()=>getCustomersPage(s,{count:limit,offset,managers:managerValues}));
        customers = page.customers; hasMore = page.notReturnedCount > 0; totalHint = page.count + page.notReturnedCount;
      } else if (!q && !status && !manager && !tag) {
        const page = await getCustomersPage(s, { count: limit, offset });
        customers = page.customers; hasMore = page.notReturnedCount > 0 || customers.length === limit; totalHint = page.count + page.notReturnedCount;
      } else {
        let source = null;
        const digits = q.replace(/\D/g,'');
        if (q && /^\d{5,}$/.test(digits)) {
          const hits=[];
          try{hits.push(...(await getCustomersPage(s,{count:500,vkIds:[Number(digits)]})).customers)}catch{}
          try{hits.push(...(await getCustomersPage(s,{count:500,phone:digits})).customers)}catch{}
          const seen=new Set(),uniqHits=hits.filter(c=>c.id&&!seen.has(c.id)&&seen.add(c.id));
          if(uniqHits.length)source=uniqHits;
        }
        if(!source)source=await getAllCustomersComplete(s);
        const nq=q.toLocaleLowerCase('ru-RU');
        const scan=source.filter(c=>{
          const qOk=!q||[c.fullName,c.phone,c.email,c.city,c.crmStatus,c.manager,c.managerLogin,c.social?.vkId,...(c.tags||[]).map(t=>t?.name||t)]
            .some(v=>String(v||'').toLocaleLowerCase('ru-RU').includes(nq));
          return qOk&&customerMatchesStatus(c,status)&&customerMatchesManager(c,manager)&&customerHasTag(c,tag);
        });
        customers=scan.slice(offset,offset+limit);hasMore=offset+limit<scan.length;totalHint=scan.length;
      }
      return sendJson(res, 200, { ok: true, clients: customers, offset, limit, hasMore, totalHint });
    } catch (err) { return handleApiError(res, err); }
  }

  const clientMatch = pathname.match(/^\/api\/clients\/([^/]+)$/);
  if (clientMatch && req.method === 'GET') {
    try {
      const id = Number(decodeURIComponent(clientMatch[1]));
      if (!Number.isFinite(id)) return sendJson(res, 400, { ok: false, message: 'Некорректный id клиента' });
      const fresh = url.searchParams.get('fresh') === '1';
      const client = fresh
        ? (await getCustomersPage(s, { count: 10, ids: [id] })).customers.find(c => Number(c.id) === Number(id)) || null
        : await getCustomerById(s, id);
      if (!client) return sendJson(res, 404, { ok: false, message: 'Клиент не найден' });
      return sendJson(res, 200, { ok: true, client });
    } catch (err) { return handleApiError(res, err); }
  }

  if (clientMatch && req.method === 'PUT') {
    if (!requireCsrf(req, res, s)) return;
    try {
      const id = Number(decodeURIComponent(clientMatch[1]));
      if (!Number.isFinite(id)) return sendJson(res, 400, { ok: false, message: 'Некорректный id клиента' });
      const b = await readJson(req);
      const payload = { id };
      if ('fullName' in b) payload.fullName = String(b.fullName || '');
      if ('phone' in b) payload.mobilePhone = String(b.phone || '');
      if ('email' in b) payload.email = String(b.email || '');
      if ('city' in b) payload.city = { name: String(b.city || '') };
      if ('crmStatus' in b) payload.crmStatus = { name: String(b.crmStatus || '') };
      if ('nextContactDate' in b) payload.nextContactDate = String(b.nextContactDate || '');
      if ('shortNotes' in b) payload.shortNotes = String(b.shortNotes || '');
      if ('comments' in b) payload.comments = String(b.comments || '');
      if ('managerLogin' in b && b.managerLogin) payload.manager = { login: String(b.managerLogin) };
      await bsCall(s, 'customers.update', payload);
      clearAccountCache(s.login);
      const client = await getCustomerById(s, id);
      return sendJson(res, 200, { ok: true, client: client || normalizeCustomer(payload) });
    } catch (err) { return handleApiError(res, err); }
  }

  if (pathname === '/api/services' && req.method === 'GET') {
    try {
      const normalizeSearch=v=>String(v||'').normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/[^\p{L}\p{N}@+._-]+/gu,' ').replace(/\s+/g,' ').trim();
      const q=normalizeSearch(url.searchParams.get('q')||''),tokens=q.split(' ').filter(Boolean);
      const rows=loadServiceCatalog().filter(x=>{if(!x.active)return false;const hay=normalizeSearch(`${x.marking||''} ${x.name||''}`);return !tokens.length||tokens.every(t=>hay.includes(t))});
      return sendJson(res,200,{ok:true,services:rows.slice(0,100),source:'server-service-catalog'});
    } catch (err) { return handleApiError(res, err); }
  }

  if (pathname === '/api/orders' && req.method === 'POST') {
    if (!requireCsrf(req, res, s)) return;
    try {
      const b = await readJson(req);
      const customerId = Number(b.customerId || b.customer?.id || 0);
      const statusName = String(b.orderStatus || b.status || 'Новый').trim();
      if (!customerId) return sendJson(res,400,{ok:false,message:'Для заказа нужен клиент BlueSales'});
      if (!statusName) return sendJson(res,400,{ok:false,message:'Укажите статус заказа'});
      // Official BlueSales API Demo requires customer.id + orderStatus.name.
      const payload = { customer:{id:customerId}, orderStatus:{name:statusName} };
      if (b.managerLogin) payload.manager={login:String(b.managerLogin)};
      if (b.date) payload.date=String(b.date);
      if (b.prepay!=='' && b.prepay!=null && Number.isFinite(Number(b.prepay))) payload.prepay=Number(b.prepay);
      if (b.discount!=='' && b.discount!=null && Number.isFinite(Number(b.discount))) {
        const d=Number(b.discount); payload.discount=d>1?Math.max(0,Math.min(100,d))/100:Math.max(0,Math.min(1,d));
      }
      if (b.internalComments) payload.internalComments=String(b.internalComments);
      if (b.customerComments) payload.customerComments=String(b.customerComments);
      if (Array.isArray(b.goodsPositions) && b.goodsPositions.length) {
        payload.goodsPositions=b.goodsPositions.map(x=>{
          const goodsId=Number(x.goods?.id);
          const goods=Number.isFinite(goodsId)&&goodsId>0
            ?{id:goodsId}
            :(x.goods?.marking?{marking:String(x.goods.marking)}:{name:String(x.goods?.name||x.name||'')});
          return {goods,size:String(x.size||''),price:Math.max(0,Number(x.price||0)),quantity:Math.max(1,Number(x.quantity||1))};
        }).filter(x=>x.goods.id||x.goods.marking||x.goods.name);
      }
      const calculated=(payload.goodsPositions||[]).reduce((sum,x)=>sum+Number(x.price||0)*Number(x.quantity||1),0);
      const afterDiscount=calculated*(1-Number(payload.discount||0));
      if (b.sum!=='' && b.sum!=null && Number.isFinite(Number(b.sum))) payload.sum=Number(b.sum);
      else if(payload.goodsPositions?.length)payload.sum=Math.round(afterDiscount*100)/100;
      const raw = await bsCall(s,'orders.add',payload);
      // Creating an order does not invalidate CRM dictionaries/customer scans.
      // Only the order cache for this client must be refreshed.
      clearOrdersCache(s.login, customerId);
      const candidate=raw?.order||raw?.Order||raw;
      return sendJson(res,200,{ok:true,order:normalizeOrder(candidate||payload),raw: candidate?.id?undefined:raw});
    } catch(err){ return handleApiError(res,err); }
  }

  if (pathname === '/api/orders' && req.method === 'GET') {
    try {
      const customerId = Number(url.searchParams.get('customerId') || 0);
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 20), 1), 100);
      const offset = Math.max(Number(url.searchParams.get('offset') || 0), 0);
      const fresh = String(url.searchParams.get('fresh') || '') === '1';
      const cacheKey = `${s.login}:orders:${customerId || 0}:${limit}:${offset}`;
      if(fresh)cache.delete(cacheKey);
      const value = await cachedLoad(cacheKey, 120000, async () => {
        const payload = {
          dateFrom: null,
          dateTill: null,
          orderStatuses: [],
          customerId: customerId || null,
          ids: null,
          internalNumbers: null,
          pageSize: limit,
          startRowNumber: offset
        };
        const raw = await bsCall(s, 'orders.get', payload);
        const source = arrayFromResponse(raw, ['orders', 'Orders']);
        const orders = source.map(normalizeOrder);
        const meta = customerPageMeta(raw, orders);
        return { orders, offset, limit, hasMore: meta.notReturnedCount > 0 || orders.length === limit, totalHint: meta.count + meta.notReturnedCount };
      });
      return sendJson(res, 200, { ok: true, ...value });
    } catch (err) { return handleApiError(res, err); }
  }

  const orderStatusMatch = pathname.match(/^\/api\/orders\/([^/]+)\/status$/);
  if (orderStatusMatch && req.method === 'PUT') {
    if (!requireCsrf(req, res, s)) return;
    try {
      const id = Number(decodeURIComponent(orderStatusMatch[1]));
      const b = await readJson(req);
      if (!Number.isFinite(id) || !b.status) return sendJson(res, 400, { ok: false, message: 'Нужны id заказа и статус' });
      const payload = { id, orderStatus: String(b.status) };
      if (b.postTrackingNumber) payload.postTrackingNumber = String(b.postTrackingNumber);
      if (b.postStatus) payload.postStatus = String(b.postStatus);
      await bsCall(s, 'orders.setStatus', payload);
      clearOrdersCache(s.login);
      return sendJson(res, 200, { ok: true });
    } catch (err) { return handleApiError(res, err); }
  }

  const reminderDeleteMatch=pathname.match(/^\/api\/reminders\/([^/]+)$/);
  if(reminderDeleteMatch && req.method==='DELETE'){
    if(!requireCsrf(req,res,s))return;
    try{
      const id=Number(decodeURIComponent(reminderDeleteMatch[1]));
      if(!Number.isFinite(id))return sendJson(res,400,{ok:false,message:'Некорректный id клиента'});
      // BlueSales installations differ in how they clear the next-contact date.
      // Try null first, then the empty-string form used by customers.update UI flows.
      try{await bsCall(s,'customers.update',{id,nextContactDate:null});}
      catch(firstErr){await bsCall(s,'customers.update',{id,nextContactDate:''});}
      clearAccountCache(s.login);
      return sendJson(res,200,{ok:true,id});
    }catch(err){return handleApiError(res,err);}
  }

  if (pathname === '/api/reminders' && req.method === 'GET') {
    try {
      const manager=String(url.searchParams.get('manager')||'').trim();
      const status=String(url.searchParams.get('status')||'').trim();
      const tag=String(url.searchParams.get('tag')||'').trim();
      const clock=appClockPayload(),today=clock.localDate,yesterday=addYmd(today,-1),tomorrow=addYmd(today,1),dayAfter=addYmd(today,2);
      // Cache raw date windows, not computed groups: a reminder with today's
      // explicit time can become overdue as the clock moves without another
      // expensive full BlueSales scan.
      const cacheKey=`${s.login}:reminders:raw:v27.0:${today}`;
      let rawBuckets=cacheGet(cacheKey);
      if(!rawBuckets){
        rawBuckets={
          today:await getCustomersByNextContactRange(s,today,today),
          tomorrow:await getCustomersByNextContactRange(s,tomorrow,tomorrow),
          future:await getCustomersByNextContactRange(s,dayAfter,null),
          previous:await getCustomersByNextContactRange(s,null,yesterday)
        };
        cacheSet(cacheKey,rawBuckets,60000);
      }
      const groups={today:[],tomorrow:[],future:[],overdue:[]},seen=new Set();
      const add=(c,fallback)=>{
        if(!c?.nextContactDate)return;const id=String(c.id||'');const dedupe=`${fallback}:${id}`;if(seen.has(dedupe))return;seen.add(dedupe);
        const computed=reminderBucketFor(c.nextContactDate)||fallback,bucket=(fallback==='previous'?'overdue':computed);
        const item={id:c.id,fullName:c.fullName,crmStatus:c.crmStatus,crmStatusColor:c.crmStatusColor,manager:c.manager,managerLogin:c.managerLogin,managerColor:c.managerColor,nextContactDate:c.nextContactDate,tags:c.tags,vkId:c.social?.vkId||'',reminderBucket:bucket};
        (groups[bucket]||groups[fallback==='previous'?'overdue':fallback]).push(item);
      };
      for(const c of rawBuckets.previous||[])add(c,'previous');for(const c of rawBuckets.today||[])add(c,'today');for(const c of rawBuckets.tomorrow||[])add(c,'tomorrow');for(const c of rawBuckets.future||[])add(c,'future');
      for(const rows of Object.values(groups))rows.sort((a,b)=>dateKey(a.nextContactDate).localeCompare(dateKey(b.nextContactDate))||a.fullName.localeCompare(b.fullName,'ru'));
      const filtered={};for(const[key,rows]of Object.entries(groups))filtered[key]=rows.filter(c=>customerMatchesManager(c,manager)&&customerMatchesStatus(c,status)&&customerHasTag(c,tag));
      return sendJson(res,200,{ok:true,source:'customers.get-nextContactDate-range+crm-clock',clock,reminders:filtered,counts:Object.fromEntries(Object.entries(filtered).map(([k,v])=>[k,v.length])),filters:{manager,status,tag}});
    } catch (err) { return handleApiError(res, err); }
  }

  return sendJson(res, 404, { ok: false, message: 'API route not found' });
}

function handleApiError(res, err) {
  console.error('[API]', err && err.stack ? err.stack : err);
  if (err instanceof VkApiError) {
    const status = err.code === 'VK_AUTH' ? 401 : err.code === 'VK_RATE_LIMIT' ? 429 : err.code === 'VK_TIMEOUT' ? 504 : err.code === 'VK_PERMISSIONS' ? 403 : 502;
    return sendJson(res, status, { ok: false, error: err.code, message: err.message, details: err.details || undefined });
  }
  if (err instanceof BlueSalesError) {
    if (err.details) {
      try { console.error('[BlueSales API details]', JSON.stringify(err.details).slice(0, 1800)); }
      catch { console.error('[BlueSales API details]', String(err.details).slice(0, 1800)); }
    }
    const status = err.code === 'AUTH' ? 401 : err.code === 'BUSY' ? 409 : (err.code === 'API_BUSY' || err.code === 'QUEUE_BUSY') ? 503 : err.code === 'TIMEOUT' ? 504 : 502;
    return sendJson(res, status, { ok: false, error: err.code, message: err.message, details: err.details || undefined });
  }
  const status = err && err.status ? err.status : 500;
  const code = String(err?.code || (status===503?'SERVICE_UNAVAILABLE':'SERVER'));
  return sendJson(res, status, { ok: false, error: code, message: err?.message || 'Внутренняя ошибка сервера' });
}

const server = http.createServer(async (req, res) => {
  const started=Date.now();
  let pathname='/';
  try{pathname=new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname}catch{}
  const shouldLog=pathname==='/'||pathname.startsWith('/api/');
  if(shouldLog)res.on('finish',()=>console.log(`[HTTP] ${req.method} ${pathname} -> ${res.statusCode} (${Date.now()-started}ms)`));
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) return await apiRouter(req, res, url);
    return serveStatic(req, res, url.pathname);
  } catch (err) {
    return handleApiError(res, err);
  }
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log(`seb_gun CRM + VK DIRECT v${VERSION}`);
  console.log('Без расширений. CRM: BlueSales API. Диалоги: VK API сообщества напрямую.');
  console.log('');
  console.log(`PC:    http://localhost:${PORT}/`);
  let nets={};try{nets=os.networkInterfaces()}catch(err){console.warn('[network interfaces]',err?.message||err)}
  for (const [name, entries] of Object.entries(nets)) {
    for (const n of entries || []) {
      if (n.family === 'IPv4' && !n.internal) {
        const virtualBySubnet = /^192\.168\.56\./.test(n.address) || /^169\.254\./.test(n.address);
        const virtualByName = /virtual|vmware|vbox|host-only|hyper-v|wsl|vethernet|loopback|tailscale/i.test(name);
        if (!virtualBySubnet && !virtualByName) console.log(`Phone: http://${n.address}:${PORT}/   [${name}]`);
      }
    }
  }
  console.log('');
  console.log('Важно: для CRM API BlueSales нужен тариф PRO. Для диалогов нужен ключ сообщества VK с правом messages.');
  console.log('BlueSales API вызывается через внутреннюю очередь: одновременные запросы сериализуются автоматически.');
  const qp=loadQuickPhrases(); const qpc=qp.reduce((n,g)=>n+(g.phrases||[]).length,0); const qpa=qp.reduce((n,g)=>n+(g.phrases||[]).reduce((m,p)=>m+(p.attachments||[]).length,0),0);
  console.log(`Быстрые фразы: ${qpc} фраз из BlueSales export, групп: ${qp.length}, вложений: ${qpa}. Доступ фильтруется по логину BlueSales.`);
  console.log(`Ссылки для другого устройства: ${PUBLIC_BASE_URL||(`http://${preferredLanIpv4()||'LAN-IP'}:${PORT}`)} (PUBLIC_BASE_URL можно задать для HTTPS/VPS).`);
  console.log('HTTP/API и основные UI-действия пишутся ниже в это окно без текста сообщений и паролей.');
  console.log('Для доступа из интернета размещайте этот сервер за HTTPS (VPS/Reverse Proxy).');
  console.log('Не закрывайте это окно во время работы локального сайта.');
  console.log('');
  if(TELEGRAM_BOT_TOKEN&&PUBLIC_BASE_URL)setTimeout(()=>ensureTelegramWebhook().catch(err=>console.warn('[Telegram webhook setup]',err?.message||err)),1200);
  if(TELEGRAM_BOT_TOKEN&&NOTIFICATION_BS_LOGIN&&NOTIFICATION_BS_PASSWORD&&PRESET_VK_TOKEN){setTimeout(runScheduledNotificationCheck,15000);setInterval(runScheduledNotificationCheck,60000)}
});

process.on('SIGINT', () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
