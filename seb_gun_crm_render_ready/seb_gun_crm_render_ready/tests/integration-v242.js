const fs=require('fs'),path=require('path'),assert=require('assert');
const ROOT=path.resolve(__dirname,'..');
const app=fs.readFileSync(path.join(ROOT,'public','app.js'),'utf8');
const css=fs.readFileSync(path.join(ROOT,'public','styles.css'),'utf8');
const api=fs.readFileSync(path.join(ROOT,'public','api.js'),'utf8');
const server=fs.readFileSync(path.join(ROOT,'server.js'),'utf8');

assert(server.includes("const VERSION = '24.5'"),'version not bumped');
assert(server.includes('function shareBaseUrl(req)'),'share-base helper missing');
assert(server.includes('shareBaseUrl:shareBaseUrl(req)'),'session must expose shareable base URL');
assert(server.includes("pathname === '/api/activity'"),'UI activity route missing');
assert(server.includes('[HTTP] ${req.method} ${pathname}'),'HTTP access log missing');
assert(api.includes("activity:(action,details={})=>request('/api/activity'"),'frontend activity API missing');

assert(server.includes('images_with_background'),'VK sticker background images fallback missing');
assert(server.includes('async function uploadAndSaveVkMessagePhoto('),'message photo upload validator missing');
assert(server.includes("const fields = isBulk ? ['photo','file','file1'] : ['photo','file']"),'VK photo upload field fallback missing');
assert(server.includes("photos.getMessagesUploadServer', { peer_id: peerId }"),'photo upload server must use peer_id without group_id');
assert(server.includes("photo,\n          server: uploaded.server,\n          hash: uploaded.hash"),'saveMessagesPhoto must only receive validated upload fields');
assert(server.includes('VK_UPLOAD_BAD_RESPONSE'),'undefined photo guard missing');

assert(app.includes('composerExpanded:false'),'expanded composer state missing');
assert(app.includes('data-expand-composer'),'composer expand control missing');
assert(app.includes('function autoSizeComposer()'),'composer autosize missing');
assert(app.includes('function renderPhotoGallery('),'photo gallery renderer missing');
assert(app.includes('msg-photo-grid'),'photo gallery markup missing');
assert(app.includes('chatScroll:{}'),'per-dialog scroll state missing');
assert(app.includes("['wheel','touchstart','pointerdown']"),'scroll restoration cancellation missing');
assert(app.includes('function renderChat(scroll=true,preserved=null)'),'render signature/preserve path missing');
assert(app.includes('--status-text:${textOnColor(c)}'),'contrast-aware status text missing');
assert(app.includes('async function openClientDialog('),'client deep-link resolver missing');
assert(app.includes('state.session?.shareBaseUrl'),'loopback share URL adaptation missing');
assert(app.includes('class="row-link-btn route-link"'),'row-level dialog deep link missing');

const loginStart=app.indexOf('function loginView(){');
const loginEnd=app.indexOf('\nfunction uniq',loginStart);
const login=app.slice(loginStart,loginEnd);
assert(login.indexOf('setLoading(false);render();') < login.indexOf('await loadDialogs(true)'),'login still blocks first render on dialogs load');
const initStart=app.indexOf('async function init(){');
const initEnd=app.indexOf('\nasync function poll',initStart);
const init=app.slice(initStart,initEnd>0?initEnd:initStart+2200);
assert(init.indexOf('render();track(\'page-load\'') < init.indexOf('await loadDialogs(true)'),'startup still blocks first render on dialogs load');

assert(css.includes('v24.2 — desktop scale'),'v24.2 CSS block missing');
assert(css.includes('.composer-rich.composer-expanded textarea'),'expanded composer CSS missing');
assert(css.includes('.msg-photo-grid'),'photo collage CSS missing');
assert(css.includes('[data-theme="dark"] .status:not(.muted-status)'),'dark status contrast CSS missing');
assert(css.includes('.shell:not(.chat-shell)'),'desktop list scale override missing');
console.log('OK: v24.2 instant render + stable scroll + deep links + media + dark theme + activity logging.');
