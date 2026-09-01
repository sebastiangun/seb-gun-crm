const fs=require('fs');
const path=require('path');
const assert=require('assert');
const ROOT=path.resolve(__dirname,'..');
const q=JSON.parse(fs.readFileSync(path.join(ROOT,'data','quick_phrases.json'),'utf8'));
const groups=q.groups||[];
const phrases=groups.flatMap(g=>(g.phrases||[]).map(p=>({...p,groupName:g.name})));
assert.equal(q.version,5);
assert.equal(groups.length,25);
assert.equal(phrases.length,151);
const atts=phrases.flatMap(p=>p.attachments||[]);
const count=(prefix)=>atts.filter(a=>String(a).startsWith(prefix)).length;
assert.equal(count('audio_message'),35);
assert.equal(count('photo'),11);
assert.equal(count('doc'),1);
assert.equal(count('video'),0);
assert.equal(phrases.filter(p=>String(p.text||'').includes('https://kinescope.io/')).length > 0,true);
assert.equal(phrases.reduce((n,p)=>n+(String(p.text||'').match(/https:\/\/kinescope\.io\//g)||[]).length,0),34);
const rise=phrases.find(p=>p.groupName==='ПОДНЯТИЕ'&&p.name==='ПОДНЯТИЕ игнор');
assert(rise);
assert(rise.text.includes('Скоро уже 3 сентября'));
assert(rise.text.includes('😊'));
const pay=phrases.find(p=>p.name==='рассрочка за две минуты');
assert(pay);
assert(pay.text.includes('1️⃣'));
assert(pay.text.includes('🎁'));
assert((pay.attachments||[]).includes('photo-235927687_457239905'));
const desc=phrases.find(p=>p.name==='Описание и расписание');
assert(desc);
assert((desc.attachments||[]).includes('photo-235927687_457241272'));
assert((desc.attachments||[]).includes('photo-235927687_457241273'));
const voice=phrases.find(p=>p.name==='Перед квалификацией (голосовое)');
assert(voice);
assert((voice.attachments||[]).includes('audio_message374026411_700691759'));
for(const p of phrases){
  assert(!/\[(?:photo|video|doc|audio_message)-?\d+_\d+/i.test(String(p.text||'')), `raw attachment token remains in ${p.name}`);
}

// Preserve the v26.6 UI/server fixes while bumping the release version.
const app=fs.readFileSync(path.join(ROOT,'public/app.js'),'utf8');
const css=fs.readFileSync(path.join(ROOT,'public/styles.css'),'utf8');
const api=fs.readFileSync(path.join(ROOT,'public/api.js'),'utf8');
const index=fs.readFileSync(path.join(ROOT,'public/index.html'),'utf8');
const sw=fs.readFileSync(path.join(ROOT,'public/sw.js'),'utf8');
const server=fs.readFileSync(path.join(ROOT,'server.js'),'utf8');
assert(server.includes("const VERSION = '26.7'"));
assert(index.includes('app.js?v=26.7.0')&&index.includes('api.js?v=26.7.0'));
assert(sw.includes('v26.7.0'));
assert(app.includes('function syncChatDrawerDom()'));
const openDrawer=app.slice(app.indexOf('function openChatDrawer'),app.indexOf('function closeChatDrawer'));
assert(openDrawer.includes('syncChatDrawerDom()')&&!openDrawer.includes('renderChatKeepScroll()'));
const phraseBind=app.slice(app.indexOf('function bindPhraseButtons'),app.indexOf('function refreshPhraseListOnly'));
assert(phraseBind.includes('e.preventDefault()')&&phraseBind.includes("b.type='button'"));
assert(app.includes("toast('Скрипт вставлен в сообщение — нажмите ➤ для отправки','ok')"));
assert(app.includes('loadPhraseDataCache()')&&app.includes('savePhraseDataCache(d)'));
assert(css.includes('--ui-font:Inter')&&css.includes('.multi-filter-menu[hidden]'));
assert(api.includes('timeout=35000')&&api.includes("'/api/session',{timeout:60000}"));

console.log('v26.7 full integration checks: OK');
