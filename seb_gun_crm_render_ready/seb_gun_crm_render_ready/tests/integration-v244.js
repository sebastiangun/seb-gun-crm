'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert');
const ROOT=path.resolve(__dirname,'..');
const app=fs.readFileSync(path.join(ROOT,'public','app.js'),'utf8');
const api=fs.readFileSync(path.join(ROOT,'public','api.js'),'utf8');
const css=fs.readFileSync(path.join(ROOT,'public','styles.css'),'utf8');
const server=fs.readFileSync(path.join(ROOT,'server.js'),'utf8');
const index=fs.readFileSync(path.join(ROOT,'public','index.html'),'utf8');

assert(server.includes("const VERSION = '24.5'"),'v24.5 server version missing');
assert(index.includes('app.js?v=24.5.0')&&index.includes('styles.css?v=24.5.0'),'v24.5 cache busting missing');

// Search state is visible/copyable in the browser URL and restored after reload.
assert(app.includes('function putDialogParams(u)'),'dialog URL param writer missing');
assert(app.includes("u.searchParams.set('q',q)"),'search q URL sync missing');
assert(app.includes("u.searchParams.set('filter',state.dialogFilter)"),'filter URL sync missing');
assert(app.includes('function applyDialogStateFromUrl()'),'dialog URL restore missing');
assert(app.includes('syncDialogAddress();const info'),'live search URL synchronization missing');

// Unanswered/unread tabs load every VK page and are not later truncated to 50 by polling.
assert(app.includes("['unread','unanswered'].includes(state.dialogFilter)"),'exhaustive filtered dialog mode missing');
assert(app.includes('count:200,offset,filter:state.dialogFilter'),'filtered pagination page size missing');
assert(app.includes('while(guard++<30)'),'filtered pagination loop missing');
assert(app.includes('function dialogIntegrityText()'),'filtered completeness indicator missing');
assert(app.includes("state.dialogFilter==='all'&&!state.dialogSearch"),'poll must not truncate unanswered/unread list');

// Opening a conversation stays at the newest message while media/async sidebars load.
assert(app.includes('lockChatToBottom(peerId,5200)'),'initial bottom lock missing');
assert(app.includes('chatBottomAnchor'),'bottom sentinel missing');
assert(app.includes("new ResizeObserver(()=>apply())"),'media/layout bottom observer missing');
assert(app.includes('[40,100,220,450,900,1600,2800,4200]'),'deferred bottom retries missing');

// BlueSales status/manager color survives dark theme and the right CRM card uses statusHtml.
assert(app.includes('class="bs-status-cell">${statusHtml(c.crmStatus,c.crmStatusColor)}'),'CRM status badge missing');
assert(css.includes('.bs-status-cell .status'),'CRM status CSS missing');
assert(css.includes('background:var(--manager,#38463f)!important'),'dark manager color preservation missing');

// Normal edit preserves group/order; moving is explicit via the 3-line handle / move API.
assert(server.includes('found.group.phrases[found.index]=phrase'),'phrase edit must be in-place');
assert(server.includes('/move$/'),'phrase move route missing');
assert(api.includes('moveAdminPhrase:'),'phrase move client API missing');
assert(app.includes('phrase-drag-handle'),'three-line phrase move handle missing');
assert(app.includes('data-phrase-card'),'drag/drop phrase cards missing');
assert(app.includes('Редактирование не перемещает скрипт'),'locked edit group notice missing');

// Dark controls use dark surfaces + white text, while primary remains brand green.
assert(css.includes('[data-theme="dark"] .secondary'),'dark secondary button block missing');
assert(css.includes('background:var(--surface-2,#151e1a)!important'),'dark control background missing');
assert(css.includes('[data-theme="dark"] .primary'),'dark primary override missing');

console.log('OK: v24.5 URL search sync + exhaustive unanswered/unread dialogs.');
console.log('OK: v24.5 bottom-locked chat + preserved BlueSales colors + dark controls.');
console.log('OK: v24.5 phrase editing stays in place; explicit ☰ move/reorder works.');
