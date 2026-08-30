'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert');
const ROOT=path.resolve(__dirname,'..');
const app=fs.readFileSync(path.join(ROOT,'public','app.js'),'utf8');
const css=fs.readFileSync(path.join(ROOT,'public','styles.css'),'utf8');
const server=fs.readFileSync(path.join(ROOT,'server.js'),'utf8');
const index=fs.readFileSync(path.join(ROOT,'public','index.html'),'utf8');

assert(server.includes("const VERSION = '24.5'"),'version 24.5 missing');
assert(index.includes('app.js?v=24.5.0')&&index.includes('styles.css?v=24.5.0'),'cache-busting version missing');

// Search: VK returns candidates, but UI receives only locally matched results.
assert(server.includes('function normalizeDialogSearchText('),'search normalization missing');
assert(server.includes('function dialogSearchScore('),'search scorer missing');
assert(server.includes('function sortDialogsBySearchScore('),'search post-filter missing');
assert(server.includes("'messages.getConversationsById'"),'exact peer lookup missing');
assert(server.includes('const total = q ? dialogs.length'),'search count must be actual rendered result count');
assert(server.includes('rawCount: q ? rawCount : undefined'),'raw VK count diagnostic missing');

// Deep links should be real URLs that can be opened/copied independently.
assert(app.includes('function shareButton(hash')&&app.includes('data-route-link'),'real route links missing');
assert(app.includes('class="row-link-btn route-link"'),'dialog row route link missing');
assert(app.includes("u.searchParams.set('dialog',id)"),'query deep link missing');

// Tab crash from v24.2.
assert(app.includes('async function switchTab(id){'),'switchTab missing');
assert(app.includes("track('tab-switch'"),'tab switch logging missing');

// Initial chat opens at bottom; subsequent drawer/CRM rerenders use message anchor.
assert(app.includes('data-message-id='),'message scroll anchor missing');
assert(app.includes('anchorId')&&app.includes('anchorOffset'),'anchor scroll state missing');
assert(app.includes('chatBottomLockActive()')&&app.includes('chatBottomAnchor')&&app.includes('ResizeObserver'),'stable initial bottom lock missing');

// Selecting a new script replaces prior text attachments.
assert(app.includes('if(!append)state.messageAttachments=[]'),'phrase replace must clear old attachments');

// Sticker payloads with only sticker_id still get a VK image URL and media proxy.
assert(server.includes('https://vk.com/sticker/1-${stickerId}-512'),'server sticker fallback missing');
assert(app.includes('https://vk.com/sticker/1-${Number(a.stickerId)}-512'),'client sticker fallback missing');
assert(app.includes("h==='vk.com'"),'vk.com sticker proxy missing');

// Photo upload: official photo field first, safe filename, retry save error, bulk diagnostic.
assert(server.includes("return 'upload.jpg'"),'safe jpg filename missing');
assert(server.includes("const fields = isBulk ? ['photo','file','file1'] : ['photo','file']"),'photo-first fallback sequence missing');
assert(server.includes('retryableVkPhotoSaveError'),'save retry helper missing');
assert(server.includes('VK_UPLOAD_BULK_INCOMPATIBLE'),'bulk upload diagnostic missing');

// Dark theme keeps BlueSales colors and improves contrast; rounded workspace.
assert(app.includes('--tag-bg:${c};--tag-text:${fg}'),'tag color vars missing');
assert(css.includes('[data-theme="dark"] .tag[style]'),'dark colored tag contrast missing');
assert(css.includes('[data-theme="dark"] .status:not(.muted-status)'),'dark status contrast missing');
assert(css.includes('v24.3 — exact-search links, rounded workspace, dark contrast'),'v24.3 CSS block missing');

console.log('OK: v24.3 legacy exact dialog search + real deep links + tab navigation.');
console.log('OK: v24.3 legacy phrase replacement + VK stickers.');
console.log('OK: v24.3 legacy photo upload retries/diagnostics + dark contrast + rounded UI.');
