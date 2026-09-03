'use strict';
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
function read(p){return fs.readFileSync(path.join(root,p),'utf8')}
const server=read('server.js'), pkg=JSON.parse(read('package.json'));
const required=[
  'frontend/src/stores/drafts.js','frontend/src/stores/chat.js','frontend/src/stores/dialogs.js','frontend/src/stores/phrases.js',
  'frontend/src/components/MultiFilterSheet.vue','frontend/src/components/Composer.vue','frontend/src/components/PhraseDrawer.vue',
  'frontend/src/views/ChatView.vue','frontend/src/views/DialogsView.vue'
];
for(const f of required)if(!fs.existsSync(path.join(root,f)))throw new Error(`missing ${f}`);
if(!server.includes("const VERSION = '28.0'"))throw new Error('server version');
if(!server.includes('LEGACY_PUBLIC'))throw new Error('legacy fallback missing');
if(!pkg.scripts?.build?.includes('vite build'))throw new Error('vite build missing');
const drafts=read('frontend/src/stores/drafts.js');
if(!drafts.includes('localStorage')||!drafts.includes('clear(peerId)'))throw new Error('persistent per-dialog drafts missing');
const chat=read('frontend/src/stores/chat.js');
if(!chat.includes('refreshLatest')||!chat.includes('clientRequestId')||!chat.includes('loadOlder'))throw new Error('chat isolation/idempotency missing');
const sheet=read('frontend/src/components/MultiFilterSheet.vue');
if(!sheet.includes('sheet-actions')||!sheet.includes('Применить')||!sheet.includes('Сбросить'))throw new Error('mobile sheet actions missing');
const phrases=JSON.parse(read('data/quick_phrases.json'));
const count=(phrases.groups||[]).reduce((n,g)=>n+(g.phrases||[]).length,0);
if(count!==151)throw new Error(`phrase count ${count}`);
console.log('v28.0 integration checks: OK (Vue core, 151 phrases)');
