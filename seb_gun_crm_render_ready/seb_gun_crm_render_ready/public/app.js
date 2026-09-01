(() => {
const app=document.getElementById('app'),toastNode=document.getElementById('toast');
const state={session:null,tab:'dialogs',dialogs:[],dialogsOffset:0,dialogsHasMore:false,dialogFilter:'all',dialogSearch:'',dialogManager:'',dialogStatus:'',selectedDialog:null,messages:[],chatCrm:null,chatTotal:0,clients:[],clientsLoaded:false,metaLoaded:false,metaPromise:null,remindersLoaded:false,offset:0,hasMore:false,q:'',status:'',manager:'',meta:{users:[],statuses:[],tags:[],statusColors:{},managerColors:{},tagColors:{},tagTextColors:{},capabilities:{},currentUser:null,uiSync:null},reminders:{today:[],tomorrow:[],future:[],overdue:[]},reminderTab:'today',reminderSearch:'',reminderManager:'',reminderStatus:'',reminderTag:'',clientTag:'',leftDrawer:false,rightDrawer:false,rightTab:'client',phraseGroups:[],phraseLoaded:false,phraseQuery:'',phraseSource:'',phraseSync:null,phraseManager:null,phraseDiscovered:{},phraseMessage:'',phraseEditUrl:'',phraseCapabilities:{},clientDraft:null,drawerOrders:[],drawerOrdersLoaded:false,drawerOrdersLoading:false,drawerOrdersPromise:null,drawerOrdersError:'',drawerEdit:false,newOrderDraft:null,serviceCatalog:[],serviceLoaded:false,servicePromise:null,serviceQuery:'',messageDraft:'',messageAttachments:[],replyTarget:null,forwardTarget:null,messageMenuId:'',messageExportLoading:false,phraseSuggestOpen:false,phraseSuggestIndex:0,adminLoaded:false,adminOverview:null,adminUsers:[],adminPhraseGroups:[],adminSection:'phrases',adminQuery:'',adminPhraseEdit:null,adminUserEdit:null,loading:false,pollBusy:false,theme:(localStorage.getItem('seb_gun_theme')||'light'),clientEditSnapshot:null,composerExpanded:false,chatScroll:{},chatBottomLockPeer:'',chatBottomLockUntil:0,dialogsLoading:false,dialogsTotal:0,adminPhraseMove:null,phraseLastId:'',phraseScrollTop:0,phraseRestorePending:false,phraseRecentIds:[],phraseResumePending:false};
const I={chat:'💬',people:'👥',bell:'🔔',menu:'☰',admin:'⚙',search:'⌕',back:'‹',refresh:'↻',send:'➤',bolt:'⚡',crm:'◫',clip:'＋',mic:'🎤',close:'×'};
const esc=(v='')=>String(v).replace(/[&<>'"]/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[x]));
function toast(m,k=''){toastNode.textContent=m;toastNode.className=`toast show ${k}`;clearTimeout(toastNode._t);toastNode._t=setTimeout(()=>toastNode.className='toast',3600)}
let loadingDepth=0,loadingTimer=0,loadingSlowTimer=0,loadingWatchdog=0,loadingCycle=0;
function resetLoadingUi(reason=''){
  loadingDepth=0;state.loading=false;
  clearTimeout(loadingTimer);clearTimeout(loadingSlowTimer);clearTimeout(loadingWatchdog);
  document.body.classList.remove('busy');
  if(reason)console.warn('[loading watchdog]',reason);
}
function setLoading(v){
  if(v){
    if(loadingDepth===0)loadingCycle+=1;
    loadingDepth+=1;state.loading=true;
    const cycle=loadingCycle;
    clearTimeout(loadingTimer);
    loadingTimer=setTimeout(()=>{if(loadingDepth>0&&cycle===loadingCycle)document.body.classList.add('busy')},420);
    clearTimeout(loadingSlowTimer);
    loadingSlowTimer=setTimeout(()=>{if(loadingDepth>0&&cycle===loadingCycle)toast('Сервер отвечает медленно. Экран не заблокирован — можно продолжать работу.','')},6000);
    clearTimeout(loadingWatchdog);
    loadingWatchdog=setTimeout(()=>{
      if(loadingDepth>0&&cycle===loadingCycle){
        resetLoadingUi('операция дольше 24 секунд');
        toast('Долгая загрузка остановлена. Повторите только нужное действие.','error');
      }
    },24000);
    return;
  }
  loadingDepth=Math.max(0,loadingDepth-1);
  if(!loadingDepth)resetLoadingUi();
}
function track(action,details={}){try{BSAPI.activity(action,details).catch(()=>{})}catch{}}
function logo(){return '<div class="logo-mark">S</div>'}function initials(n=''){return String(n||'?').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()}
function fmtDate(v){if(!v)return'—';const m=String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);return m?`${m[3]}.${m[2]}.${m[1]}`:String(v)}
function fmtTime(ts){if(!ts)return'';const d=new Date(Number(ts)*1000),n=new Date();return d.toDateString()===n.toDateString()?d.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}):d.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit'})}
function fmtDateTime(ts){if(!ts)return'';const d=new Date(Number(ts)*1000);return d.toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).replace(',','')}
function normSearch(v=''){return String(v??'').normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/[^\p{L}\p{N}@+._-]+/gu,' ').replace(/\s+/g,' ').trim()}
function searchTokens(v=''){return normSearch(v).split(' ').filter(Boolean)}
function textMatchesQuery(text='',query=''){const hay=normSearch(text),tokens=searchTokens(query);return !tokens.length||tokens.every(t=>hay.includes(t))}
const PHRASE_DRAWER_STORAGE='seb_gun_phrase_drawer_v4';
function phraseDrawerStorageKey(){const who=normSearch(state.session?.login||state.session?.account?.name||'default').replace(/\s+/g,'_')||'default';return `${PHRASE_DRAWER_STORAGE}:${who}`}
function phraseDrawerLegacyKeys(){return[phraseDrawerStorageKey(),PHRASE_DRAWER_STORAGE,'seb_gun_phrase_drawer_v3','seb_gun_phrase_drawer_v2']}
function loadPhraseDrawerState(){
  try{
    const raw=phraseDrawerLegacyKeys().map(k=>localStorage.getItem(k)).find(Boolean)||'{}';const x=JSON.parse(raw);
    state.phraseQuery=String(x.query||'');
    state.phraseLastId=String(x.lastId||'');
    state.phraseScrollTop=Math.max(0,Number(x.scrollTop||0));
    state.phraseRecentIds=Array.isArray(x.recentIds)?x.recentIds.map(String).filter(Boolean).slice(0,6):[];
  }catch{}
}
function savePhraseDrawerState(){
  try{
    localStorage.setItem(phraseDrawerStorageKey(),JSON.stringify({
      query:state.phraseQuery||'',
      lastId:state.phraseLastId||'',
      recentIds:(state.phraseRecentIds||[]).slice(0,6),
      scrollTop:Math.max(0,Number(state.phraseScrollTop||0)),
      updatedAt:Date.now()
    }));
  }catch{}
}
function rememberPhraseUse(id=''){
  const key=String(id||'');if(!key)return;
  state.phraseLastId=key;
  state.phraseRecentIds=[key,...(state.phraseRecentIds||[]).filter(x=>String(x)!==key)].slice(0,6);
}
function capturePhraseDrawerState(){const d=document.querySelector('.drawer-left');if(d)state.phraseScrollTop=Math.max(0,d.scrollTop||0);savePhraseDrawerState()}
function scrollPhraseIntoView(id=state.phraseLastId,{center=false}={}){
  const d=document.querySelector('.drawer-left');if(!d||!id)return false;
  const selected=[...d.querySelectorAll('[data-phrase-id]')].find(x=>String(x.dataset.phraseId)===String(id));
  if(!selected)return false;
  const details=selected.closest('details');if(details)details.open=true;
  if(center)selected.scrollIntoView({block:'center',behavior:'smooth'});
  else{
    const r=selected.getBoundingClientRect(),dr=d.getBoundingClientRect();
    if(r.bottom<dr.top+118||r.top>dr.bottom-70)selected.scrollIntoView({block:'center'});
    else d.scrollTop=Math.max(0,state.phraseScrollTop||d.scrollTop);
  }
  selected.classList.add('phrase-current');
  return true;
}
function restorePhraseDrawerPosition(){
  if(!state.leftDrawer&&!workspaceDesktop())return;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    const d=document.querySelector('.drawer-left');if(!d)return;
    if(!scrollPhraseIntoView(state.phraseLastId))d.scrollTop=Math.max(0,state.phraseScrollTop||0);
  }));
}
function dateInput(v){const s=String(v||'').trim();if(!s)return'';let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);if(m)return`${m[1]}-${m[2]}-${m[3]}`;m=s.match(/^(\d{2})[.\/-](\d{2})[.\/-](\d{4})/);if(m)return`${m[3]}-${m[2]}-${m[1]}`;const d=new Date(s);if(!Number.isNaN(d.getTime()))return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;return''}
function todayPlus(days){const d=new Date();d.setDate(d.getDate()+days);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function workspaceDesktop(){return typeof window!=='undefined'&&window.innerWidth>=1100}
function workspaceTablet(){return typeof window!=='undefined'&&window.innerWidth>=700&&window.innerWidth<1100}
function syncMobileViewport(){
  if(typeof window==='undefined')return;
  if(window.innerWidth>=700){document.documentElement.style.removeProperty('--app-height');return}
  const vv=window.visualViewport;
  const h=Math.max(320,Math.round(vv?.height||window.innerHeight||document.documentElement.clientHeight||0));
  document.documentElement.style.setProperty('--app-height',`${h}px`);
}
function installMobileViewportFix(){
  syncMobileViewport();
  window.addEventListener('resize',syncMobileViewport,{passive:true});
  window.addEventListener('orientationchange',()=>setTimeout(syncMobileViewport,80),{passive:true});
  if(window.visualViewport){
    window.visualViewport.addEventListener('resize',syncMobileViewport,{passive:true});
    window.visualViewport.addEventListener('scroll',syncMobileViewport,{passive:true});
  }
}
function chatComposerFocused(){return document.activeElement?.id==='messageInput'}
function applyTheme(theme=state.theme){state.theme=theme==='dark'?'dark':'light';document.documentElement.dataset.theme=state.theme;localStorage.setItem('seb_gun_theme',state.theme)}
function toggleTheme(){applyTheme(state.theme==='dark'?'light':'dark');track('theme-toggle',{theme:state.theme});if(state.selectedDialog)renderChatKeepScroll();else render()}
function themeButtonHtml(){return`<button class="icon-btn theme-toggle" data-theme-toggle title="${state.theme==='dark'?'Белая тема':'Чёрная тема'}">${state.theme==='dark'?'☀':'☾'}</button>`}

let routeApplying=false;
function requestedRoute(){
  const hash=decodeURIComponent(String(location.hash||'').replace(/^#\/?/,''));
  if(hash)return hash;
  const u=new URL(location.href);
  if(u.searchParams.get('dialog'))return `dialog/${u.searchParams.get('dialog')}`;
  if(u.searchParams.get('client'))return `client/${u.searchParams.get('client')}`;
  if(u.searchParams.get('tab'))return String(u.searchParams.get('tab'));
  return '';
}
function putTabParams(u,tab=state.tab){
  if(tab==='dialogs'){
    const q=String(state.dialogSearch||'').trim();if(q)u.searchParams.set('q',q);
    if(state.dialogFilter&&state.dialogFilter!=='all')u.searchParams.set('filter',state.dialogFilter);
    if(state.dialogManager)u.searchParams.set('manager',state.dialogManager);
    if(state.dialogStatus)u.searchParams.set('status',state.dialogStatus);
  }else if(tab==='clients'){
    const q=String(state.q||'').trim();if(q)u.searchParams.set('q',q);
    if(state.manager)u.searchParams.set('manager',state.manager);
    if(state.status)u.searchParams.set('status',state.status);
    if(state.clientTag)u.searchParams.set('tag',state.clientTag);
  }else if(tab==='reminders'){
    const q=String(state.reminderSearch||'').trim();if(q)u.searchParams.set('q',q);
    if(state.reminderTab&&state.reminderTab!=='today')u.searchParams.set('bucket',state.reminderTab);
    if(state.reminderManager)u.searchParams.set('manager',state.reminderManager);
    if(state.reminderStatus)u.searchParams.set('status',state.reminderStatus);
    if(state.reminderTag)u.searchParams.set('tag',state.reminderTag);
  }
  return u;
}
function applyTabStateFromUrl(tab=requestedRoute().split('/')[0]||state.tab){
  const u=new URL(location.href),q=String(u.searchParams.get('q')||'');
  if(tab==='dialogs'){
    state.dialogSearch=q;
    const f=String(u.searchParams.get('filter')||'all');state.dialogFilter=['all','unread','unanswered','important','archive'].includes(f)?f:'all';
    state.dialogManager=String(u.searchParams.get('manager')||'');state.dialogStatus=String(u.searchParams.get('status')||'');
  }else if(tab==='clients'){
    state.q=q;state.manager=String(u.searchParams.get('manager')||'');state.status=String(u.searchParams.get('status')||'');state.clientTag=String(u.searchParams.get('tag')||'');
  }else if(tab==='reminders'){
    state.reminderSearch=q;const b=String(u.searchParams.get('bucket')||'today');state.reminderTab=['today','tomorrow','future','overdue'].includes(b)?b:'today';
    state.reminderManager=String(u.searchParams.get('manager')||'');state.reminderStatus=String(u.searchParams.get('status')||'');state.reminderTag=String(u.searchParams.get('tag')||'');
  }
}
function routeUrl(hash=''){
  const raw=decodeURIComponent(String(hash||location.hash||'#/dialogs').replace(/^#\/?/,''));
  const [kind,id]=raw.split('/');
  const loopback=/^(localhost|127\.0\.0\.1|\[::1\]|::1)$/i.test(location.hostname);
  let base=location.origin;
  if(loopback&&state.session?.shareBaseUrl){try{base=new URL(state.session.shareBaseUrl).origin}catch{}}
  const u=new URL(location.pathname,base);
  if(kind==='dialog'&&id)u.searchParams.set('dialog',id);
  else if(kind==='client'&&id)u.searchParams.set('client',id);
  else {u.searchParams.set('tab',kind||'dialogs');putTabParams(u,kind||'dialogs')}
  u.hash=`#/${raw}`;
  return u.toString();
}
function applyDialogStateFromUrl(){applyTabStateFromUrl('dialogs')}
function syncListAddress({replace=true}={}){
  if(state.selectedDialog||!['dialogs','clients','reminders'].includes(state.tab))return;
  const u=putTabParams(new URL(location.origin+location.pathname),state.tab);u.searchParams.set('tab',state.tab);u.hash=`#/${state.tab}`;
  history[replace?'replaceState':'pushState']({...history.state,sebGun:true,route:state.tab},'',u.toString());
}
function syncDialogAddress(opts={}){syncListAddress(opts)}
function setRoute(hash,{replace=false}={}){
  if(!hash)return;
  const raw=decodeURIComponent(String(hash).replace(/^#\/?/,''));
  const from=requestedRoute()||state.tab||'dialogs';
  const u=new URL(location.origin+location.pathname);
  const [kind]=raw.split('/');
  if(['dialogs','clients','reminders'].includes(kind)){u.searchParams.set('tab',kind);putTabParams(u,kind)}
  u.hash=hash;
  history[replace?'replaceState':'pushState']({sebGun:true,route:raw,from},'',u.toString());
}
function ensureRouteHistoryState(){
  const raw=requestedRoute()||state.tab||'dialogs';
  if(!history.state?.sebGun)history.replaceState({sebGun:true,route:raw,from:''},'',location.href);
}
function resetChatTransientState(){
  releaseChatBottomLock();
  state.selectedDialog=null;state.messages=[];state.chatCrm=null;state.messageDraft='';state.messageAttachments=[];state.replyTarget=null;state.forwardTarget=null;state.phraseSuggestOpen=false;state.leftDrawer=false;state.rightDrawer=false;
}
function currentChatRoute(){return state.selectedDialog?`dialog/${state.selectedDialog.peerId}`:''}
function openChatDrawer(side,{pushHistory=true}={}){
  if(!state.selectedDialog)return;
  const overlay=side==='phrases'?'phrases':'crm';
  if(overlay==='phrases'){state.rightDrawer=false;state.leftDrawer=true}
  else{state.leftDrawer=false;state.rightDrawer=true}
  if(!workspaceDesktop()&&pushHistory){
    const base={...(history.state||{}),sebGun:true,route:currentChatRoute(),overlay};
    if(history.state?.overlay)history.replaceState(base,'',location.href);
    else history.pushState(base,'',location.href);
  }
  renderChatKeepScroll();
  if(overlay==='phrases')restorePhraseDrawerPosition();
}
function closeChatDrawer(side='',{preferHistory=true}={}){
  if(side==='phrases'||state.leftDrawer)capturePhraseDrawerState();
  if(!workspaceDesktop()&&preferHistory&&history.state?.overlay){
    history.back();return;
  }
  state.leftDrawer=false;state.rightDrawer=false;
  if(state.selectedDialog)renderChatKeepScroll();
}
function chatBack(){
  if(!workspaceDesktop()&&(state.leftDrawer||state.rightDrawer)){closeChatDrawer('',{preferHistory:true});return}
  const from=String(history.state?.from||'');
  const safe=/^(?:dialogs|clients|reminders|admin|more)$/.test(from)||/^(?:dialog|client)\//.test(from);
  if(safe&&history.length>1){history.back();return}
  resetChatTransientState();state.tab='dialogs';setRoute('#/dialogs',{replace:true});render();
}
function chatScrollKey(){return String(state.selectedDialog?.peerId||'')}
function captureChatScroll(){
  const b=document.getElementById('messages'),key=chatScrollKey();
  if(!b||!key)return null;
  const bottomGap=Math.max(0,b.scrollHeight-b.scrollTop-b.clientHeight),atBottom=bottomGap<80;
  let anchorId='',anchorOffset=0;
  if(!atBottom){
    const rows=[...b.querySelectorAll('.msg-row[data-message-id]')];
    const first=rows.find(r=>r.offsetTop+r.offsetHeight>=b.scrollTop+2)||rows[0];
    if(first){anchorId=first.dataset.messageId||'';anchorOffset=first.offsetTop-b.scrollTop}
  }
  const snap={top:b.scrollTop,bottomGap,atBottom,anchorId,anchorOffset};
  state.chatScroll[key]=snap;
  return snap
}
function restoreChatScroll(snap,{bottom=false}={}){
  const key=chatScrollKey(),saved=snap||state.chatScroll[key]||null,b=document.getElementById('messages');
  if(!b)return;
  let cancelled=false,ro=null;
  const cancel=()=>{cancelled=true;releaseChatBottomLock();if(ro)ro.disconnect()};
  ['wheel','touchstart','pointerdown'].forEach(ev=>b.addEventListener(ev,cancel,{once:true,passive:true}));
  const apply=()=>{
    const box=document.getElementById('messages');
    if(!box||cancelled)return;
    const forceBottom=bottom||chatBottomLockActive()||saved?.atBottom;
    if(forceBottom){
      const anchor=document.getElementById('chatBottomAnchor');
      if(anchor?.scrollIntoView)anchor.scrollIntoView({block:'end',inline:'nearest'});
      box.scrollTop=box.scrollHeight;
    }else if(saved?.anchorId){
      const row=[...box.querySelectorAll('.msg-row[data-message-id]')].find(r=>r.dataset.messageId===String(saved.anchorId));
      if(row)box.scrollTop=Math.max(0,row.offsetTop-Number(saved.anchorOffset||0));
      else box.scrollTop=Math.min(Number(saved.top||0),Math.max(0,box.scrollHeight-box.clientHeight));
    }else if(saved){
      box.scrollTop=Math.min(Number(saved.top||0),Math.max(0,box.scrollHeight-box.clientHeight));
    }
    captureChatScroll()
  };
  if(bottom||chatBottomLockActive())b.scrollTop=b.scrollHeight;
  requestAnimationFrame(()=>requestAnimationFrame(apply));
  [40,100,220,450,900,1600,2800,4200].forEach(ms=>setTimeout(apply,ms));
  document.querySelectorAll('#messages img,#messages video,#messages audio').forEach(el=>{
    if(el.tagName==='IMG'&&!el.complete)el.addEventListener('load',apply,{once:true});
    if(el.tagName==='VIDEO'||el.tagName==='AUDIO')el.addEventListener('loadedmetadata',apply,{once:true});
  });
  if((bottom||chatBottomLockActive())&&'ResizeObserver' in window){
    ro=new ResizeObserver(()=>apply());
    ro.observe(document.getElementById('chatMessageFlow')||b);
    setTimeout(()=>{if(ro)ro.disconnect()},5200);
  }
}

function chatBottomLockActive(){return String(state.chatBottomLockPeer||'')===chatScrollKey()&&Date.now()<Number(state.chatBottomLockUntil||0)}
function lockChatToBottom(peerId,ms=5000){state.chatBottomLockPeer=String(peerId||'');state.chatBottomLockUntil=Date.now()+ms}
function releaseChatBottomLock(){state.chatBottomLockPeer='';state.chatBottomLockUntil=0}
function renderChatKeepScroll(){if(chatComposerFocused()){state._chatRenderDeferred=true;return}state._chatRenderDeferred=false;if(chatBottomLockActive())return renderChat(true);const snap=captureChatScroll();renderChat(false,snap)}
function meaningfulClientValue(v){return Array.isArray(v)?v.length>0:(v!==undefined&&v!==null&&String(v)!=='')}
function mergeClientForEdit(base={},fresh={}){
  const out={...base};
  for(const [k,v] of Object.entries(fresh||{})){
    if(k==='social'){const old=out.social||{},next={...old};for(const [sk,sv] of Object.entries(v||{}))if(meaningfulClientValue(sv)||!meaningfulClientValue(next[sk]))next[sk]=sv;out.social=next;continue}
    if(k==='tags'){if(Array.isArray(v)&&v.length)out.tags=v;else if(!Array.isArray(out.tags))out.tags=[];continue}
    if(k==='raw'){if(v)out.raw=v;continue}
    if(meaningfulClientValue(v)||!meaningfulClientValue(out[k]))out[k]=v;
  }
  return out;
}
async function copyText(text,message='Ссылка скопирована'){try{await navigator.clipboard.writeText(String(text||''));toast(message,'ok')}catch{prompt('Скопируйте:',String(text||''))}}
async function applyHashRoute(){
  if(routeApplying||!state.session?.authenticated)return;
  const raw=requestedRoute();
  if(!raw)return;
  const [kind,id]=raw.split('/');
  routeApplying=true;
  try{
    if(['dialogs','clients','reminders','admin','more'].includes(kind)){
      if(['dialogs','clients','reminders'].includes(kind))applyTabStateFromUrl(kind);
      if(state.selectedDialog)resetChatTransientState();
      state.tab=kind;
      if(kind==='clients'){state.clientsLoaded=false;await ensureClients(true)}
      if(kind==='reminders'){state.remindersLoaded=false;await ensureReminders(true)}
      if(kind==='admin')await ensureAdmin();
      if(kind==='dialogs')await loadDialogs(true);
      render();
      return;
    }
    if(kind==='dialog'&&id){
      if(state.selectedDialog&&String(state.selectedDialog.peerId)===String(id))return;
      await openDialog(id,null,{updateRoute:false});
      return;
    }
    if(kind==='client'&&id){
      let c=state.clients.find(x=>String(x.id)===String(id));
      if(!c)c=(await BSAPI.client(id)).client;
      await openClientDialog(id,c?.social?.vkId||c?.vkId||'',{updateRoute:false});
    }
  }catch(e){toast(e.message,'error')}finally{routeApplying=false}
}
function statusClass(s=''){if(/оплат/i.test(s))return'green';if(/отказ|черн/i.test(s))return'red';if(/цена|решен|рассказ/i.test(s))return'orange';if(/диаг/i.test(s))return'pink';return'blue'}
const fallbackStatusColors={'Не учитывать в лидах':'#848B8C','Вступил в группу':'#3B3B3B','Запустил воронку':'#3B3B3B','Заявка':'#0165B0','Диагностика':'#FF99CC','Отправлен урок':'#008000','Рассказ про курс':'#FF9900','Цена озвучена':'#FF9900','Принимает решение':'#FF9900','Оплатил':'#0165B0','Допродажа':'#008000','Отказ':'#FF003A','Черный список':'#000000','Работа с игнором':'#848B8C','Отложил покупку':'#FF99CC'};
const fallbackManagerColors={'0.0 Даша Алексеева':'#737373','Даша Алексеева':'#737373','0.1 Расиль М.':'#86BA67','Расиль М.':'#86BA67','0.1 Гульназ У':'#FF9BA9','Гульназ У':'#FF9BA9','0.2 Юлия':'#B80206','Юлия':'#B80206','0.1 Ильгиз Ш.':'#00FF00','Ильгиз Ш.':'#00FF00','0.1 Сергей К.':'#5319e7','Сергей К.':'#5319e7'};
function cssColor(v=''){const x=String(v||'').trim();return /^#[0-9a-f]{3,8}$/i.test(x)||/^rgba?\(/i.test(x)||/^hsla?\(/i.test(x)?x:''}
function statusColor(name='',explicit=''){return cssColor(explicit)||cssColor(state.meta?.statusColors?.[name])||fallbackStatusColors[name]||'#2B638C'}
function managerColor(name='',explicit=''){return cssColor(explicit)||cssColor(state.meta?.managerColors?.[name])||fallbackManagerColors[name]||'#BFC7CC'}
function textOnColor(color=''){
  const x=String(color||'').trim();let r=0,g=0,b=0,ok=false,m=x.match(/^#([0-9a-f]{3})$/i);
  if(m){r=parseInt(m[1][0]+m[1][0],16);g=parseInt(m[1][1]+m[1][1],16);b=parseInt(m[1][2]+m[1][2],16);ok=true}
  m=x.match(/^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i);
  if(m){const n=parseInt(m[1],16);r=(n>>16)&255;g=(n>>8)&255;b=n&255;ok=true}
  m=x.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if(m){r=Number(m[1]);g=Number(m[2]);b=Number(m[3]);ok=true}
  if(!ok)return state.theme==='dark'?'#fff':'#111';
  return(.299*r+.587*g+.114*b)>155?'#111':'#fff'
}
function statusHtml(name='',explicit=''){const c=statusColor(name,explicit);return`<span class="status ${statusClass(name)}" style="--status-color:${c};--status-text:${textOnColor(c)}">${esc(name||'Без статуса')}</span>`}
function managerHtml(name='',explicit=''){if(!name)return'';const c=managerColor(name,explicit);return`<span class="manager-chip" style="--manager:${c};--manager-text:${textOnColor(c)}">${esc(name)}</span>`}
function tagHtml(tags=[]){return(tags||[]).slice(0,8).map(t=>{const n=t?.name||t,c=cssColor(t?.color||state.meta?.tagColors?.[n]||''),tc=String(t?.textColor||state.meta?.tagTextColors?.[n]||'').toLowerCase();const fg=tc==='white'?'#fff':tc==='black'?'#111':textOnColor(c);return`<span class="tag"${c?` style="--tag-bg:${c};--tag-text:${fg};background:var(--tag-bg);color:var(--tag-text)"`:''}>${esc(n)}</span>`}).join('')}
function mediaSrc(v=''){const raw=String(v||'').trim();if(!raw)return'';try{const u=new URL(raw,location.href);if(u.origin===location.origin)return u.href;if(u.protocol!=='https:')return'';const h=u.hostname.toLowerCase(),ok=h==='vk.com'||h==='www.vk.com'||h==='vk.ru'||h==='www.vk.ru'||h==='userapi.com'||h.endsWith('.userapi.com')||h==='vkuserphoto.ru'||h.endsWith('.vkuserphoto.ru')||h==='vkuseraudio.net'||h.endsWith('.vkuseraudio.net')||h==='vkcdn.ru'||h.endsWith('.vkcdn.ru')||h==='vk-cdn.net'||h.endsWith('.vk-cdn.net');return ok?`/api/media?url=${encodeURIComponent(u.href)}`:u.href}catch{return raw}}
function voiceAudioSrc(v=''){const raw=String(v||'').trim();if(!raw)return'';try{const u=new URL(raw,location.href);if(u.origin===location.origin)return u.href;if(u.protocol!=='https:')return'';return`/api/voice/audio?url=${encodeURIComponent(u.href)}`}catch{return''}}
function voiceTranscriptLocalKey(peerId,cmid){return`seb_gun_voice_transcript_v1:${Number(peerId)||0}:${Number(cmid)||0}`}
function getLocalVoiceTranscript(peerId,cmid){try{return String(localStorage.getItem(voiceTranscriptLocalKey(peerId,cmid))||'').trim()}catch{return''}}
function saveLocalVoiceTranscript(peerId,cmid,text){const clean=String(text||'').trim();if(!clean)return;try{localStorage.setItem(voiceTranscriptLocalKey(peerId,cmid),clean)}catch{}}
function applyClientTranscriptCache(peerId,messages=[]){for(const m of messages||[]){const v=messageVoice(m),cmid=Number(m?.conversationMessageId||0);if(v&&!String(v.transcript||'').trim()&&cmid){const t=getLocalVoiceTranscript(peerId,cmid);if(t){v.transcript=t;v.transcriptState='done';v.transcriptSource='browser-cache'}}}return messages}
async function prepareSW(){try{if('serviceWorker'in navigator){const regs=await navigator.serviceWorker.getRegistrations();for(const r of regs)await r.unregister()}if('caches'in window){for(const k of await caches.keys())if(k.startsWith('bluesales-')||k.startsWith('seb-gun-'))await caches.delete(k)}}catch(e){console.warn('[SW cleanup]',e)}}
async function init(){try{loadPhraseDrawerState();applyTheme(state.theme);installMobileViewportFix();await prepareSW();state.session=await BSAPI.session();if(state.session.authenticated){loadPhraseDrawerState();const reqRoute=requestedRoute(),deep=/^(?:dialog|client)\//.test(reqRoute);applyTabStateFromUrl((reqRoute||'dialogs').split('/')[0]);if(!reqRoute)setRoute('#/dialogs',{replace:true});ensureRouteHistoryState();state.dialogsLoading=!deep&&!state.dialogs.length;render();track('page-load',{route:reqRoute||'dialogs'});ensureMeta().then(()=>{if(!state.selectedDialog)render()}).catch(()=>{});if(!deep){try{await loadDialogs(true)}finally{state.dialogsLoading=false}render()}await applyHashRoute()}else render();setInterval(poll,60000)}catch(e){fatal(e)}}
function mergeDialogCrm(rows=[]){
  if(!Array.isArray(rows)||!rows.length)return;
  const byPeer=new Map(rows.map(d=>[String(d.peerId),d]));
  state.dialogs=state.dialogs.map(d=>{
    const fresh=byPeer.get(String(d.peerId));
    return fresh?.crm?{...d,crm:fresh.crm}:d;
  });
}
async function hydrateDialogCrmSlice({count=50,offset=0,filter=state.dialogFilter}={}){
  if(state.dialogSearch||state.dialogManager||state.dialogStatus||state.selectedDialog||state.tab!=='dialogs')return;
  const token=state._dialogCrmHydrateToken=(state._dialogCrmHydrateToken||0)+1;
  try{
    const d=await BSAPI.vkDialogs({count:Math.min(Math.max(Number(count)||50,1),200),offset:Math.max(Number(offset)||0,0),filter,q:'',includeCrm:true});
    if(token!==state._dialogCrmHydrateToken||state.selectedDialog||state.tab!=='dialogs')return;
    mergeDialogCrm(d.dialogs||[]);
    refreshDialogListOnly();
  }catch(e){
    // CRM labels are secondary: VK dialogs remain fully usable even while BlueSales is busy.
    console.warn('Background CRM dialog link:',e?.message||e);
  }
}
let dialogCrmHydrateTimer=0;
function scheduleDialogCrmHydration(opts={}){
  clearTimeout(dialogCrmHydrateTimer);
  dialogCrmHydrateTimer=setTimeout(()=>{
    if(state.loading||state.selectedDialog||state.tab!=='dialogs'||state.dialogSearch||state.dialogManager||state.dialogStatus)return;
    hydrateDialogCrmSlice(opts).catch(()=>{});
  },2400);
}
async function loadDialogs(reset=false){
  if(reset){state.dialogsOffset=0;state.dialogs=[];state.dialogsTotal=0}
  const needsCrm=Boolean(String(state.dialogSearch||'').trim()||state.dialogManager||state.dialogStatus);
  const exhaustive=reset&&!String(state.dialogSearch||'').trim()&&['unread','unanswered'].includes(state.dialogFilter);
  if(exhaustive){
    const all=[],seen=new Set();let offset=0,total=0,guard=0;
    while(guard++<30){
      const d=await BSAPI.vkDialogs({count:200,offset,filter:state.dialogFilter,q:'',includeCrm:needsCrm});
      total=Math.max(total,Number(d.count||0));
      const page=d.dialogs||[];
      for(const row of page){const k=String(row.peerId);if(!seen.has(k)){seen.add(k);all.push(row)}}
      offset+=page.length;
      if(!d.hasMore||!page.length)break;
    }
    state.dialogs=all;state.dialogsOffset=offset;state.dialogsTotal=Math.max(total,all.length);state.dialogsHasMore=all.length<total;track('dialogs-filter-complete',{filter:state.dialogFilter,loaded:all.length,total:state.dialogsTotal,pages:guard});
    if(!needsCrm&&all.length)scheduleDialogCrmHydration({count:Math.min(all.length,200),offset:0,filter:state.dialogFilter});
    return;
  }
  const startOffset=state.dialogsOffset;
  const d=await BSAPI.vkDialogs({count:50,offset:startOffset,filter:state.dialogFilter,q:state.dialogSearch,includeCrm:needsCrm});
  state.dialogs=reset?(d.dialogs||[]):[...state.dialogs,...(d.dialogs||[])];
  state.dialogsOffset+=Number((d.dialogs||[]).length);
  state.dialogsTotal=Number(d.count||state.dialogs.length);
  state.dialogsHasMore=!!d.hasMore;
  if(!needsCrm&&(d.dialogs||[]).length)scheduleDialogCrmHydration({count:(d.dialogs||[]).length,offset:startOffset,filter:state.dialogFilter});
}
async function ensureMeta(force=false){
  if(state.metaLoaded&&!force)return state.meta;
  if(state.metaPromise&&!force)return state.metaPromise;
  const p=BSAPI.meta().then(d=>{state.meta=d;state.metaLoaded=true;return state.meta}).finally(()=>{if(state.metaPromise===p)state.metaPromise=null});
  state.metaPromise=p;
  return p;
}
async function ensureClients(reset=false){await ensureMeta();if(reset){state.offset=0;state.clients=[]}if(state.clientsLoaded&&!reset&&state.clients.length)return;const d=await BSAPI.clients({limit:100,offset:state.offset,q:state.q,status:state.status,manager:state.manager,tag:state.clientTag});state.clients=reset?d.clients:[...state.clients,...d.clients];state.offset+=d.clients.length;state.hasMore=!!d.hasMore;state.clientsLoaded=true}
async function ensureReminders(force=false){if(state.remindersLoaded&&!force)return;await ensureMeta();const d=await BSAPI.reminders({manager:state.reminderManager,status:state.reminderStatus,tag:state.reminderTag});state.reminders=d.reminders||state.reminders;state.remindersLoaded=true}
async function ensureServices(force=false){
  if(state.serviceLoaded&&!force)return state.serviceCatalog;
  if(state.servicePromise&&!force)return state.servicePromise;
  const p=BSAPI.services({}).then(d=>{state.serviceCatalog=d.services||[];state.serviceLoaded=true;return state.serviceCatalog}).finally(()=>{if(state.servicePromise===p)state.servicePromise=null});
  state.servicePromise=p;
  return p;
}
async function ensurePhrases(force=false){
  if(state.phraseLoaded&&!force && state.phraseSource!=='bluesales-account-only')return;
  const d=await BSAPI.quickPhrases();
  state.phraseGroups=d.groups||[];
  state.phraseSource=d.source||'';
  state.phraseSync=d.uiSync||null;
  state.phraseManager=d.manager||null;
  state.phraseDiscovered=d.discovered||{};
  state.phraseMessage=d.message||'';
  state.phraseEditUrl=d.editUrl||d.discovered?.phraseUrl||'';
  state.phraseCapabilities=d.capabilities||{};
  state.phraseLoaded=true;
  if(/^bluesales-web/.test(state.phraseSource)){
    state.metaLoaded=false;
    try{await ensureMeta()}catch{}
  }
}
async function poll(){
  if(!state.session?.authenticated||state.loading||state.pollBusy||document.hidden||state.leftDrawer||state.rightDrawer||state.newOrderDraft||state.drawerEdit)return;
  state.pollBusy=true;
  try{
    if(state.selectedDialog){
      const last=state.messages.at(-1)?.id,d=await BSAPI.vkMessages(state.selectedDialog.peerId,{count:50,offset:0,includeCrm:false});
      const next=d.messages||[];
      state.chatCrm=d.crm?mergeClientForEdit(state.chatCrm||{},d.crm):state.chatCrm;
      state.chatTotal=d.total||next.length;
      if(last!==next.at(-1)?.id){state.messages=next;renderChatKeepScroll()}
    }else if(state.tab==='dialogs'&&state.dialogFilter==='all'&&!state.dialogSearch&&document.activeElement?.id!=='dialogSearch'){
      const d=await BSAPI.vkDialogs({count:50,offset:0,filter:state.dialogFilter,q:'',includeCrm:false});
      const next=d.dialogs||[];
      const sig=x=>JSON.stringify((x||[]).map(v=>[v.peerId,v.unreadCount,v.lastMessageAt,v.lastMessage,v.crm?.crmStatus,v.crm?.manager]));
      if(sig(next)!==sig(state.dialogs)){state.dialogs=next;state.dialogsOffset=next.length;state.dialogsHasMore=!!d.hasMore;render()}
    }
  }catch{}finally{state.pollBusy=false}
}
function header(){const who=state.meta?.currentUser?.name||state.session?.account?.name||state.session.login;return`<header class="topbar"><div class="brand">${logo()}<div><strong>seb_gun</strong><small>${esc(who)}</small></div></div><span class="api-pill"><i></i> LIVE</span>${themeButtonHtml()}<button class="icon-btn" data-action="refresh">${I.refresh}</button></header>`}
function isAdmin(){return Boolean(state.session?.isAdmin||state.meta?.isAdmin)}
function bottomNav(){const items=[['dialogs',I.chat,'Диалоги'],['clients',I.people,'Клиенты'],['reminders',I.bell,'Напоминания']];if(isAdmin())items.push(['admin',I.admin,'Админ']);items.push(['more',I.menu,'Ещё']);return`<nav class="bottom-nav" style="--nav-count:${items.length}">${items.map(([id,ic,l])=>`<button class="nav-item ${state.tab===id?'active':''}" data-tab="${id}"><b>${ic}</b><span>${l}</span></button>`).join('')}</nav>`}
function render(){if(!state.session?.authenticated)return loginView();if(state.selectedDialog)return renderChat(false);let body=state.tab==='dialogs'?dialogsView():state.tab==='clients'?clientsView():state.tab==='reminders'?remindersView():state.tab==='admin'?adminView():moreView();app.innerHTML=`<main class="shell">${header()}<section class="content">${body}</section>${bottomNav()}</main>`;bindCommon()}
function loginView(){app.innerHTML=`<main class="login-page"><section class="login-card"><div class="login-brand">${logo()}<div><h1>seb_gun CRM</h1><p>BlueSales + VK • v25.5</p></div></div><div class="notice"><b>VK уже настроен:</b> vk.ru/yogaxdasha</div><form id="loginForm" class="form-stack"><label>Логин BlueSales<input name="login" type="email" required></label><label>Пароль BlueSales<input name="password" type="password" required></label><button class="primary">Войти</button></form></section></main>`;document.getElementById('loginForm').onsubmit=async e=>{e.preventDefault();setLoading(true);const f=new FormData(e.currentTarget);try{state.session=await BSAPI.login(f.get('login'),f.get('password'));applyDialogStateFromUrl();const reqRoute=requestedRoute(),deep=/^(?:dialog|client)\//.test(reqRoute);if(!reqRoute)setRoute('#/dialogs',{replace:true});ensureRouteHistoryState();state.dialogsLoading=!deep;setLoading(false);render();track('login-success',{route:reqRoute||'dialogs'});ensureMeta().then(()=>{if(!state.selectedDialog)render()}).catch(()=>{});if(!deep){try{await loadDialogs(true)}finally{state.dialogsLoading=false}render()}await applyHashRoute();toast(deep?'Ссылка открыта':'Диалоги загружены','ok')}catch(x){toast(x.message,'error')}finally{setLoading(false)}}}
function uniq(a){return[...new Set((a||[]).map(x=>String(x||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'))}
function shareButton(hash,title='Скопировать ссылку'){return`<button type="button" class="bs-share-link" data-copy-route="${esc(hash)}" title="${esc(title)}">🔗</button>`}
function filteredDialogs(){return state.dialogs.filter(d=>(!state.dialogManager||d.crm?.manager===state.dialogManager)&&(!state.dialogStatus||d.crm?.crmStatus===state.dialogStatus))}
function dialogIntegrityText(){if(state.dialogSearch||!['unread','unanswered'].includes(state.dialogFilter))return'';const label=state.dialogFilter==='unanswered'?'Неотвеченные':'Непрочитанные';const total=Math.max(Number(state.dialogsTotal||0),state.dialogs.length);return`${label}: загружено ${state.dialogs.length} из ${total} диалогов VK`}
function bindDialogRows(root=document){root.querySelectorAll('[data-dialog]').forEach(r=>{r.onclick=e=>{if(e.target.closest('[data-copy-route],[data-route-link]'))return;openDialog(r.dataset.dialog)};r.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openDialog(r.dataset.dialog)}}});root.querySelectorAll('[data-route-link]').forEach(a=>a.onclick=e=>{e.stopPropagation();track('open-link',{url:a.href})});root.querySelectorAll('[data-copy-route]').forEach(b=>b.onclick=e=>{e.stopPropagation();const url=routeUrl(b.dataset.copyRoute);track('copy-link',{route:b.dataset.copyRoute,url});copyText(url)})}
function bindClientRows(root=document){root.querySelectorAll('[data-client-dialog]').forEach(r=>{const o=()=>openClientDialog(r.dataset.clientDialog,r.dataset.vkId);r.onclick=o;r.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();o()}}});root.querySelectorAll('[data-copy-route]').forEach(b=>b.onclick=e=>{e.stopPropagation();copyText(routeUrl(b.dataset.copyRoute))})}
function refreshDialogListOnly(){const list=document.querySelector('.dialog-list');if(!list)return;const rows=filteredDialogs();list.innerHTML=rows.length?rows.map(dialogRow).join(''):'<div class="empty">Диалоги не найдены</div>';const info=document.getElementById('dialogSearchState');if(info)info.textContent=state.dialogSearch?`Поиск: «${state.dialogSearch}» • найдено ${rows.length}`:'';const sh=document.querySelector('.section-head .bs-share-link');if(sh){sh.dataset.copyRoute=rows.length===1?`#/dialog/${rows[0].peerId}`:'#/dialogs';sh.title=rows.length===1?'Скопировать ссылку на найденный диалог':'Скопировать ссылку на раздел'}bindDialogRows(list)}
function refreshClientListOnly(){const list=document.querySelector('.bs-compact-list');if(!list)return;list.innerHTML=state.clients.length?state.clients.map(clientRow).join(''):'<div class="empty">Клиенты не найдены</div>';const info=document.getElementById('clientSearchState');if(info)info.textContent=state.q?`Поиск: «${state.q}» • найдено ${state.clients.length}`:'';bindClientRows(list)}

function dialogsView(){const managers=uniq((state.meta.users||[]).map(u=>u.name||u.login)),statuses=uniq((state.meta.statuses||[]).map(x=>x?.name||x)),rows=filteredDialogs(),shareHash=rows.length===1?`#/dialog/${rows[0].peerId}`:'#/dialogs';return`<div class="section-head"><div><h2>Диалоги</h2><p>VK + BlueSales</p></div>${shareButton(shareHash,rows.length===1?'Скопировать ссылку на найденный диалог':'Скопировать ссылку на раздел')}</div><div class="search-row"><span>${I.search}</span><input id="dialogSearch" value="${esc(state.dialogSearch)}" placeholder="Имя, телефон, e-mail, VK ID"></div><div class="search-query-indicator" id="dialogSearchState">${state.dialogSearch?`Поиск: «${esc(state.dialogSearch)}» • найдено ${filteredDialogs().length}`:esc(dialogIntegrityText())}</div>${activeFilterSummary('dialogs')}<div class="dialog-filter-tabs">${[['all','Все'],['unread','Непрочитанные'],['unanswered','Неотвеченные']].map(([id,l])=>`<button data-dialog-filter="${id}" class="${state.dialogFilter===id?'active':''}">${l}</button>`).join('')}</div><div class="message-type-tabs"><button class="active">Сообщения</button><button disabled>Комментарии</button></div><div class="crm-filter-stack two"><select id="dialogManagerFilter"><option value="">Менеджеры</option>${managers.map(v=>`<option ${state.dialogManager===v?'selected':''}>${esc(v)}</option>`).join('')}</select><select id="dialogStatusFilter"><option value="">Статусы CRM</option>${statuses.map(v=>`<option ${state.dialogStatus===v?'selected':''}>${esc(v)}</option>`).join('')}</select></div><div class="list dialog-list">${state.dialogsLoading?'<div class="empty loading-empty">Загружаем диалоги…</div>':rows.length?rows.map(dialogRow).join(''):'<div class="empty">Диалоги не найдены</div>'}</div>${state.dialogsHasMore&&!state.dialogSearch?'<button class="load-more" data-action="more-dialogs">Загрузить ещё</button>':''}`}
function dialogRow(d){const av=d.avatar?`<img class="avatar-img" src="${esc(mediaSrc(d.avatar))}" alt="">`:`<div class="avatar">${esc(initials(d.name))}</div>`,crm=d.crm?statusHtml(d.crm.crmStatus,d.crm.crmStatusColor):'<span class="status muted-status">CRM не создана</span>',mgr=d.crm?.manager?managerHtml(d.crm.manager,d.crm.managerColor):'',href=routeUrl(`#/dialog/${d.peerId}`);return`<div class="client-row dialog-row" data-dialog="${esc(d.peerId)}" role="button" tabindex="0">${av}<div class="client-main"><div class="client-title">${esc(d.name)}${d.unreadCount?` <span class="unread-badge">${d.unreadCount}</span>`:''}</div><div class="dialog-meta">${crm}${mgr}</div><div class="client-sub">${d.lastMessageOut?'Вы: ':''}${esc(d.lastMessage||'Открыть переписку')}</div></div><div class="client-side"><b>${esc(fmtTime(d.lastMessageAt))}</b><a class="row-link-btn route-link" data-route-link href="${esc(href)}" target="_blank" rel="noopener" title="Открыть этот диалог в новой вкладке">↗</a></div></div>`}
async function hydrateChatClient(force=false){
  const id=state.chatCrm?.id||state.selectedDialog?.crm?.clientId;
  if(!id)return state.chatCrm;
  try{const d=await BSAPI.client(id,{fresh:force});if(d?.client){state.chatCrm=mergeClientForEdit(state.chatCrm||{},d.client)}}catch(e){console.warn('[client hydrate]',e?.message||e)}
  return state.chatCrm;
}
async function openDialog(peerId,fallbackClient=null,{updateRoute=true}={}){
  clearTimeout(dialogCrmHydrateTimer);
  peerId=Number(peerId);if(!Number.isFinite(peerId))return toast('Некорректный VK ID','error');
  let d=state.dialogs.find(x=>Number(x.peerId)===peerId);
  setLoading(true);
  try{
    // Open the conversation from VK first. BlueSales linking is loaded after the
    // chat is already visible so a slow CRM request cannot freeze the messenger.
    const x=await BSAPI.vkMessages(peerId,{count:100,offset:0,includeCrm:false});
    const crm=fallbackClient||(d?.crm?.clientId?{id:d.crm.clientId,crmStatus:d.crm.crmStatus||'',crmStatusColor:d.crm.crmStatusColor||'',manager:d.crm.manager||'',managerColor:d.crm.managerColor||'',tags:d.crm.tags||[]}:null);
    if(!d){const peer=x.peer||{};d={peerId,peerType:peer.peerType||'user',name:peer.name||crm?.fullName||`VK ${peerId}`,avatar:peer.avatar||'',crm:crm?{clientId:crm.id,crmStatus:crm.crmStatus,crmStatusColor:crm.crmStatusColor,manager:crm.manager,managerColor:crm.managerColor,tags:crm.tags}:null}}
    state.selectedDialog=d;state.messages=x.messages||[];applyClientTranscriptCache(peerId,state.messages);state.chatCrm=crm;state.chatTotal=x.total||state.messages.length;state.chatScroll[String(peerId)]={top:0,bottomGap:0,atBottom:true};lockChatToBottom(peerId,5200);state.composerExpanded=false;state.leftDrawer=false;state.rightDrawer=false;state.rightTab='client';state.clientDraft=null;state.drawerOrders=[];state.drawerOrdersLoaded=false;state.drawerOrdersLoading=false;state.drawerOrdersPromise=null;state.drawerEdit=false;state.newOrderDraft=null;state.serviceQuery='';state.messageDraft='';state.messageAttachments=[];state.replyTarget=null;state.forwardTarget=null;state.phraseSuggestOpen=false;
    if(updateRoute)setRoute(`#/dialog/${encodeURIComponent(peerId)}`);
    track('open-dialog',{peerId});
    renderChat(true);
    // Resolve the BlueSales card in the background. This is intentionally not
    // awaited: the message editor remains usable even while BlueSales is busy.
    const hydrateAfterOpen=async()=>{
      try{
        if(state.selectedDialog?.peerId!==peerId)return;
        if(state.chatCrm?.id)await hydrateChatClient(false);
        else{
          const linked=await BSAPI.vkMessages(peerId,{count:1,offset:0,includeCrm:true});
          if(state.selectedDialog?.peerId===peerId&&linked?.crm){
            state.chatCrm=linked.crm;
            state.selectedDialog.crm={clientId:linked.crm.id,crmStatus:linked.crm.crmStatus,crmStatusColor:linked.crm.crmStatusColor,manager:linked.crm.manager,managerColor:linked.crm.managerColor,tags:linked.crm.tags};
          }
        }
        if(state.selectedDialog?.peerId===peerId){
          if(workspaceDesktop()&&state.chatCrm?.id&&!state.drawerOrdersLoaded)loadDrawerOrders();
          if(!chatComposerFocused())renderChatKeepScroll();
        }
      }catch(e){console.warn('[chat CRM background]',e?.message||e)}
    };
    hydrateAfterOpen();
    if(workspaceDesktop()&&!state.phraseLoaded)ensurePhrases().then(()=>{if(state.selectedDialog?.peerId===peerId&&!chatComposerFocused())renderChatKeepScroll()}).catch(e=>console.warn('[phrases]',e?.message||e));
  }catch(e){toast(e.message,'error');state.selectedDialog=null;state.messages=[];state.chatCrm=null;state.tab='dialogs';try{if(!state.dialogs.length)await loadDialogs(true)}catch{}render();return false}finally{setLoading(false)}
  return true
}
async function openClientDialog(clientId,vkId='',{updateRoute=true}={}){
  setLoading(true);
  try{
    let c=state.clients.find(x=>String(x.id)===String(clientId))||null;
    if(!c)c=(await BSAPI.client(clientId)).client;
    const peer=Number(vkId||c?.social?.vkId||c?.vkId||0);
    if(updateRoute)setRoute(`#/client/${encodeURIComponent(clientId)}`);
    track('open-client',{clientId,peerId:peer||null});
    if(!peer){toast('У клиента нет VK ID — открыть переписку нельзя','error');state.tab='clients';state.selectedDialog=null;render();return false}
    return await openDialog(peer,c,{updateRoute:false});
  }catch(e){toast(e.message,'error');return false}finally{setLoading(false)}
}

function renderChat(scroll=true,preserved=null){state._renderedLayoutMode=currentResponsiveMode();const snap=scroll?null:(preserved||captureChatScroll());const d=state.selectedDialog;if(!d)return render();const crm=state.chatCrm;const desktop=workspaceDesktop();const shellClass=`shell chat-shell${desktop?' workspace-desktop':''}${workspaceTablet()?' workspace-tablet':''}`;const scrimShow=!desktop&&(state.leftDrawer||state.rightDrawer);app.innerHTML=`<main class="${shellClass}"><header class="topbar chat-top"><button class="icon-btn" data-chat-back>${I.back}</button>${d.avatar?`<img class="chat-avatar" src="${esc(mediaSrc(d.avatar))}">`:`<div class="chat-avatar fallback">${esc(initials(d.name))}</div>`}<div class="chat-title"><strong>${esc(d.name)}</strong><small>${crm?esc(crm.crmStatus||'BlueSales'):'VK • карточки CRM нет'}</small></div><button class="header-tool chat-share" data-copy-route="#/dialog/${esc(d.peerId)}" title="Скопировать ссылку на диалог">🔗</button><button class="header-tool chat-export" data-copy-dialog title="Скопировать весь текст диалога">⧉</button><button class="header-tool" data-open-phrases title="Быстрые фразы">${I.bolt}</button>${themeButtonHtml()}<button class="header-tool" data-open-crm title="CRM">CRM</button></header><button type="button" class="mobile-edge-handle edge-left" data-open-phrases aria-label="Открыть быстрые фразы">⚡</button><button type="button" class="mobile-edge-handle edge-right" data-open-crm aria-label="Открыть карточку клиента">CRM</button><section class="chat-messages" id="messages"><div id="chatMessageFlow" class="chat-message-flow">${messageList()}<div id="chatBottomAnchor" class="chat-bottom-anchor" aria-hidden="true"></div></div></section><div class="attach-menu hidden" id="attachMenu"><button data-file-kind="photo">🖼 Фото</button><button data-file-kind="video">🎬 Видео</button><button data-file-kind="audio_message">🎤 Голосовое</button><button data-file-kind="doc">📎 Файл</button></div>${replyPreviewHtml()}${pendingAttachmentsHtml()}<div id="phraseAutocompleteMount">${phraseAutocompleteHtml()}</div><form id="messageForm" class="composer composer-rich ${state.composerExpanded?'composer-expanded':''}"><button type="button" class="composer-tool" data-attach>${I.clip}</button><button type="button" class="composer-tool phrase-small" data-open-phrases>${I.bolt}</button><textarea id="messageInput" rows="2" placeholder="Напишите сообщение...">${esc(state.messageDraft)}</textarea><button type="button" class="composer-tool composer-expand" data-expand-composer title="${state.composerExpanded?'Свернуть поле':'Развернуть поле'}">${state.composerExpanded?'↙':'⤢'}</button><button type="submit" class="send-btn">${I.send}</button><input hidden id="filePhoto" type="file" accept="image/*"><input hidden id="fileVideo" type="file" accept="video/*"><input hidden id="fileAudio" type="file" accept="audio/*" capture><input hidden id="fileDoc" type="file"></form>${leftDrawerHtml()}${rightDrawerHtml()}${forwardPickerHtml()}<div class="drawer-scrim ${scrimShow?'show':''}" data-close-drawers></div></main>`;bindChat();const b=document.getElementById('messages');if(b){const forceBottom=scroll||chatBottomLockActive();if(forceBottom)b.scrollTop=b.scrollHeight;b.addEventListener('scroll',captureChatScroll,{passive:true});restoreChatScroll(snap,{bottom:forceBottom})}restorePhraseDrawerPosition();if(workspaceDesktop()&&!state.phraseLoaded&&!state._phraseBoot){state._phraseBoot=true;setTimeout(()=>ensurePhrases().then(()=>renderChatKeepScroll()).catch(e=>toast(`Быстрые фразы: ${e.message}`,'error')).finally(()=>state._phraseBoot=false),0)}autoSizeComposer()}
function allPhrases(){return(state.phraseGroups||[]).flatMap(g=>(g.phrases||[]).map(p=>({...p,groupName:g.name||''})))}
function phraseMatches(query){const q=normSearch(String(query||'').replace(/\r/g,'').split(/\n/).pop()||query);if(!q)return[];const tokens=searchTokens(q);return allPhrases().map(p=>{const n=normSearch(p.name),t=normSearch(p.text),g=normSearch(p.groupName),hay=`${g} ${n} ${t}`;if(!tokens.every(x=>hay.includes(x)))return null;let score=0;if(n===q)score+=100;if(n.startsWith(q))score+=70;else if(n.includes(q))score+=45;if(g.includes(q))score+=25;if(t.startsWith(q))score+=24;else if(t.includes(q))score+=16;return{p,score}}).filter(Boolean).sort((a,b)=>b.score-a.score||String(a.p.name).localeCompare(String(b.p.name),'ru')).slice(0,8).map(x=>x.p)}
function phraseAutocompleteHtml(){if(!state.phraseSuggestOpen)return'';const list=phraseMatches(state.messageDraft);if(!list.length)return'';return`<div class="phrase-autocomplete" id="phraseAutocomplete"><div class="phrase-auto-head">Подсказки BlueSales <small>по названию и тексту</small></div>${list.map((p,i)=>`<button type="button" class="phrase-auto-item ${i===state.phraseSuggestIndex?'active':''}" data-auto-phrase="${esc(p.id)}"><b>${esc(p.name)}</b><span>${esc(p.groupName)}</span><small>${esc(String(p.text||'').replace(/\s+/g,' ').slice(0,110))}</small>${(p.attachments||[]).length?`<em>📎 ${(p.attachments||[]).length}</em>`:''}</button>`).join('')}</div>`}
function refreshPhraseAutocomplete(){const m=document.getElementById('phraseAutocompleteMount');if(m)m.innerHTML=phraseAutocompleteHtml()}
function applyPhrase(p,{append=false}={}){if(!p)return;const text=expandPhrase(p.text||'');if(!append)state.messageAttachments=[];state.messageDraft=append&&state.messageDraft?`${state.messageDraft}\n${text}`:text;if(text.length>140||text.split('\n').length>4)state.composerExpanded=true;for(const a of (p.attachments||[]))if(a&&!state.messageAttachments.includes(a))state.messageAttachments.push(a);state.phraseSuggestOpen=false;state.phraseSuggestIndex=0;track('phrase-select',{id:p.id||'',name:p.name||'',length:text.length,attachments:state.messageAttachments.length,mode:append?'append':'replace'})}
function findMessage(id){return state.messages.find(m=>String(m.id||m.conversationMessageId)===String(id))||null}
function messageVoice(m){return(m?.attachments||[]).find(a=>a?.type==='audio_message')||null}
function messageAttachmentText(m){return(m.attachments||[]).map(a=>{if(a.type==='audio_message')return a.transcript?`Голосовое сообщение: ${a.transcript}`:'Голосовое сообщение';if(a.type==='photo')return'Фото';if(a.type==='video')return`Видео${a.title?`: ${a.title}`:''}`;if(a.type==='doc')return`Файл${a.title?`: ${a.title}`:''}`;if(a.type==='sticker')return'Стикер';return a.title||a.type||'Вложение'}).filter(Boolean).join('; ')}
function messageAuthorLabel(m){if(!m)return'';return String(m.displayAuthor||m.author||(m.out?(state.meta?.currentUser?.name||state.session?.account?.name||'VK Дарья А.'):(state.selectedDialog?.name||'Собеседник')))}
function messagePlainText(m){if(!m)return'';const body=[String(m.text||'').trim(),messageAttachmentText(m)].filter(Boolean).join(' ');return`[${fmtDateTime(m.date)}] ${messageAuthorLabel(m)}: ${body||'[Пустое сообщение]'}`}
function messageActions(m){const id=String(m.id||m.conversationMessageId||''),safe=esc(id),voice=messageVoice(m),open=String(state.messageMenuId||'')===id,canTranscribe=Boolean(voice&&Number(m.conversationMessageId||0)>0);return`<div class="msg-action-wrap"><button type="button" class="msg-menu-trigger" data-msg-menu="${safe}" title="Действия" aria-label="Действия с сообщением" aria-expanded="${open?'true':'false'}">•••</button>${open?`<div class="msg-action-menu" role="menu"><button type="button" data-msg-reply="${safe}" role="menuitem">↩ <span>Ответить</span></button><button type="button" data-msg-forward="${safe}" role="menuitem">↪ <span>Переслать</span></button><button type="button" data-msg-copy="${safe}" role="menuitem">⧉ <span>Скопировать сообщение</span></button>${voice?.transcript?`<button type="button" data-msg-copy-transcript="${safe}" role="menuitem">📝 <span>Скопировать расшифровку</span></button>`:canTranscribe?`<button type="button" data-msg-transcribe="${safe}" role="menuitem">📝 <span>Расшифровать голосовое</span></button>`:''}</div>`:''}</div>`}
function messageList(){if(!state.messages.length)return'<div class="empty">Сообщений нет</div>';return state.messages.map((m,i)=>{const author=messageAuthorLabel(m);return`<div class="msg-row ${m.out?'out':'in'}" data-message-id="${esc(m.id||m.conversationMessageId||`row-${i}`)}"><div class="msg-bubble ${m.attachments?.some(a=>a.type==='sticker')&&!m.text?'sticker-bubble':''}">${m.author&&!m.out?`<div class="msg-author">${esc(m.author)}</div>`:''}${m.reply?`<div class="reply-mini">${esc(m.reply.text||messageAttachmentText(m.reply)||'Вложение')}</div>`:''}${m.text?`<div class="msg-text">${esc(m.text).replace(/\n/g,'<br>')}</div>`:''}${attachments(m.attachments,m)}<div class="msg-meta"><time>${esc(fmtTime(m.date))}<span>${esc(author)}</span></time>${messageActions(m)}</div></div></div>`}).join('')}
function renderPhotoGallery(photos=[]){const count=photos.length;if(!count)return'';if(count===1){const a=photos[0];return`<a class="msg-photo" href="${esc(mediaSrc(a.url))}" target="_blank"><img src="${esc(mediaSrc(a.preview||a.url))}" alt="Фото"></a>`}const cls=`count-${Math.min(count,6)} cols-2`;return`<div class="msg-photo-grid ${cls}">${photos.map((a,i)=>`<a class="msg-photo" href="${esc(mediaSrc(a.url))}" target="_blank"><img src="${esc(mediaSrc(a.preview||a.url))}" alt="Фото ${i+1}"></a>`).join('')}</div>`}
function renderAttachment(a,m=null){if(a.type==='sticker'){const u=a.url||(Number(a.stickerId)>0?`https://vk.com/sticker/1-${Number(a.stickerId)}-512`:'');if(u)return`<img class="msg-sticker" src="${esc(mediaSrc(u))}" alt="Стикер" loading="eager">`;}if(a.type==='audio_message'&&a.url){const id=esc(m?.id||m?.conversationMessageId||''),canTranscribe=Boolean(a.url&&Number(m?.conversationMessageId||0)>0),source=a.transcriptSource==='browser-cache'?'сохранено на устройстве':a.transcriptSource==='local-whisper'?'Whisper':(a.transcriptSource||''),audio=voiceAudioSrc(a.url),duration=Number(a.duration||0);return`<div class="voice-message"><div class="voice-head"><span>🎤 Голосовое${duration?` · ${Math.floor(duration/60)}:${String(duration%60).padStart(2,'0')}`:''}</span><a href="${esc(audio)}" target="_blank" rel="noopener" title="Открыть аудио отдельно">↗</a></div><audio class="voice-player" controls preload="metadata" playsinline src="${esc(audio)}">Ваш браузер не поддерживает аудио.</audio>${a.transcript?`<div class="voice-transcript"><div class="voice-transcript-head"><b>Расшифровка${source?` · ${esc(source)}`:''}</b><button type="button" data-msg-copy-transcript="${id}">Скопировать</button></div><p>${esc(a.transcript)}</p></div>`:`<div class="voice-transcript-empty"><small>Аудио можно слушать сразу. Расшифровка запускается отдельно.</small>${canTranscribe?`<button type="button" data-msg-transcribe="${id}">Расшифровать</button>`:''}</div>`}</div>`}if(a.type==='video')return`<a class="msg-video" href="${esc(a.url||'#')}" ${a.url?'target="_blank"':''}>${a.preview?`<img class="msg-preview" src="${esc(mediaSrc(a.preview))}">`:''}<span>▶ ${esc(a.title||'Видео')}</span></a>`;if(a.url)return`<a class="msg-file" href="${esc(a.url)}" target="_blank">${esc(a.title||'Вложение')}</a>`;if(a.preview)return`<img class="msg-preview" src="${esc(mediaSrc(a.preview))}">`;return`<span class="attachment-label">${esc(a.title||a.type)}</span>`}
function attachments(list=[],m=null){let out='',photos=[];const flush=()=>{if(photos.length){out+=renderPhotoGallery(photos);photos=[]}};for(const a of (list||[])){if(a?.type==='photo'&&a.url){photos.push(a);continue}flush();out+=renderAttachment(a,m)}flush();return out}

function hasSyncedCapability(name){
  const sync=state.phraseSync||state.meta?.uiSync||state.session?.uiSync||{};
  const caps=(state.phraseCapabilities&&Object.keys(state.phraseCapabilities).length?state.phraseCapabilities:state.meta?.capabilities)||{};
  if(!['ready','cached'].includes(String(sync.state||'')))return true;
  return caps[name]!==false
}
function attachmentTypeLabel(id=''){if(id.startsWith('photo'))return'Фото';if(id.startsWith('audio_message'))return'Голосовое';if(id.startsWith('video'))return'Видео';if(id.startsWith('doc'))return'Файл';return'Вложение'}
function pendingAttachmentsHtml(){if(!state.messageAttachments.length)return'';return`<div class="pending-attachments">${state.messageAttachments.map((a,i)=>`<span>📎 ${esc(attachmentTypeLabel(a))}<button type="button" data-remove-pending="${i}" aria-label="Удалить">×</button></span>`).join('')}<button type="button" class="pending-clear" data-clear-pending>Очистить</button></div>`}

function replyPreviewHtml(){if(!state.replyTarget)return'';const t=state.replyTarget,body=String(t.text||messageAttachmentText(t)||'Вложение').replace(/\s+/g,' ').slice(0,180);return`<div class="composer-context reply-context"><div><b>Ответ на сообщение</b><span>${esc(body)}</span></div><button type="button" data-cancel-reply>×</button></div>`}
function forwardPickerHtml(){if(!state.forwardTarget)return'';const m=state.forwardTarget,rows=(state.dialogs||[]).filter(d=>String(d.peerId)!==String(state.selectedDialog?.peerId)).slice(0,24);return`<div class="forward-modal"><div class="forward-card"><div class="forward-head"><div><b>Переслать сообщение</b><small>${esc(String(m.text||messageAttachmentText(m)||'Вложение').replace(/\s+/g,' ').slice(0,120))}</small></div><button type="button" data-cancel-forward>×</button></div><form id="forwardPeerForm" class="forward-peer-form"><input name="peerId" inputmode="numeric" placeholder="VK ID получателя"><button class="primary">Переслать</button></form><div class="forward-list">${rows.length?rows.map(d=>`<button type="button" data-forward-peer="${esc(d.peerId)}"><span>${d.avatar?`<img src="${esc(mediaSrc(d.avatar))}" alt="">`:`<i>${esc(initials(d.name))}</i>`}</span><b>${esc(d.name)}</b></button>`).join(''):'<div class="empty small">Недавние диалоги не загружены — введите VK ID выше.</div>'}</div></div></div>`}
function phraseSourceLabel(){const count=allPhrases().length;return `База скриптов • ${count||143} фраз • доступ по менеджеру`}
function phraseGroupsBodyHtml(){
  const q=state.phraseQuery;
  const groups=state.phraseGroups.map(g=>({...g,phrases:(g.phrases||[]).filter(p=>textMatchesQuery(`${g.name} ${p.name} ${p.text}`,q))})).filter(g=>g.phrases.length);
  const denied=state.phraseLoaded&&!state.phraseGroups.length&&!hasSyncedCapability('quickPhrases');
  if(denied)return '<div class="bs-phrases-empty">Для этого пользователя BlueSales раздел «Быстрые фразы» недоступен.</div>';
  if(!state.phraseLoaded)return '<div class="bs-phrases-empty">Загрузка...</div>';
  if(!groups.length)return '<div class="bs-phrases-empty">Ничего не найдено.</div>';
  return groups.map(g=>`<details class="bs-phrase-group" open><summary>${esc(g.name)}</summary>${g.phrases.map(p=>`<button type="button" class="bs-phrase-row ${String(state.phraseLastId)===String(p.id)?'phrase-current':''}" data-phrase-id="${esc(p.id)}"><span>${esc(p.name)}</span>${(p.attachments||[]).length?`<small class="phrase-attach-count">📎 ${(p.attachments||[]).length}</small>`:''}</button>`).join('')}</details>`).join('');
}
function bindPendingButtons(root=document){root.querySelectorAll('[data-remove-pending]').forEach(b=>b.onclick=()=>{state.messageAttachments.splice(Number(b.dataset.removePending),1);refreshComposerOnly(false)});const clear=root.querySelector('[data-clear-pending]');if(clear)clear.onclick=()=>{state.messageAttachments=[];refreshComposerOnly(false)}}
function autoSizeComposer(){const inp=document.getElementById('messageInput'),form=document.getElementById('messageForm');if(!inp||!form)return;form.classList.toggle('composer-expanded',!!state.composerExpanded);const btn=form.querySelector('[data-expand-composer]');if(btn){btn.textContent=state.composerExpanded?'↙':'⤢';btn.title=state.composerExpanded?'Свернуть поле':'Развернуть поле'}inp.style.height='auto';const min=state.composerExpanded?150:52,max=state.composerExpanded?Math.min(360,Math.round(innerHeight*.42)):160;inp.style.height=`${Math.min(max,Math.max(min,inp.scrollHeight))}px`}
function refreshComposerOnly(focus=true){const inp=document.getElementById('messageInput');if(inp)inp.value=state.messageDraft;const form=document.getElementById('messageForm');if(form){document.querySelector('.pending-attachments')?.remove();const html=pendingAttachmentsHtml();if(html)form.insertAdjacentHTML('beforebegin',html);bindPendingButtons(document)}const auto=document.getElementById('phraseAutocompleteMount');if(auto)auto.innerHTML=phraseAutocompleteHtml();if(!workspaceDesktop()){document.querySelector('.drawer-left')?.classList.remove('open');document.querySelector('.drawer-scrim')?.classList.remove('show')}autoSizeComposer();if(focus&&inp){inp.focus();inp.setSelectionRange(inp.value.length,inp.value.length)}}
function phraseResumeHtml(){
  const all=allPhrases(),last=all.find(x=>String(x.id)===String(state.phraseLastId));
  const recent=(state.phraseRecentIds||[]).map(id=>all.find(x=>String(x.id)===String(id))).filter(Boolean).slice(0,4);
  if(!last&&!recent.length)return'';
  return`<div class="phrase-resume-panel">
    ${last?`<button type="button" class="phrase-resume-main" data-resume-phrase="${esc(last.id)}"><small>Продолжить с последнего места</small><b>${esc(last.name)}</b><span>${esc(last.groupName||'')}</span></button>`:''}
    ${recent.length>1?`<div class="phrase-recent-row">${recent.slice(1).map(p=>`<button type="button" data-resume-phrase="${esc(p.id)}" title="${esc(p.groupName||'')}">${esc(p.name)}</button>`).join('')}</div>`:''}
  </div>`;
}
function bindPhraseButtons(root=document){
  root.querySelectorAll('[data-phrase-id]').forEach(b=>b.onclick=()=>{
    const d=document.querySelector('.drawer-left');
    if(d)state.phraseScrollTop=Math.max(0,d.scrollTop||0);
    rememberPhraseUse(b.dataset.phraseId);
    savePhraseDrawerState();
    const p=allPhrases().find(x=>String(x.id)===String(b.dataset.phraseId));
    applyPhrase(p);
    closeChatDrawer('phrases',{preferHistory:true});
    refreshComposerOnly(true);
  });
  root.querySelectorAll('[data-resume-phrase]').forEach(b=>b.onclick=e=>{
    e.preventDefault();e.stopPropagation();
    const id=String(b.dataset.resumePhrase||'');
    rememberPhraseUse(id);savePhraseDrawerState();
    if(!scrollPhraseIntoView(id,{center:true})){
      state.phraseQuery='';
      savePhraseDrawerState();
      refreshPhraseListOnly();
      requestAnimationFrame(()=>scrollPhraseIntoView(id,{center:true}));
    }
  });
}
function refreshPhraseListOnly(){
  const list=document.querySelector('.bs-phrase-list');if(!list)return;
  list.innerHTML=phraseGroupsBodyHtml();
  const resume=document.querySelector('.phrase-resume-mount');if(resume)resume.innerHTML=phraseResumeHtml();
  bindPhraseButtons(document.querySelector('.drawer-left')||list);
  restorePhraseDrawerPosition();
}
function leftDrawerHtml(){
  const mgr=state.phraseManager?.name||state.session?.account?.name||state.session?.login||'';
  const fallback=state.phraseSource==='bluesales-snapshot-fallback';
  return`<aside class="drawer drawer-left bs-classic-drawer ${(state.leftDrawer||workspaceDesktop())?'open':''}">
    <div class="bs-drawer-title"><div><b>БЫСТРЫЕ ФРАЗЫ</b><small>${esc(mgr)}</small></div><button data-close-drawers>${I.close}</button></div>
    <div class="bs-source-line ${fallback?'snapshot':''}">${esc(phraseSourceLabel())}</div>
    <div class="phrase-resume-mount">${phraseResumeHtml()}</div>
    <div class="bs-phrase-search"><span>${I.search}</span><input id="phraseSearch" value="${esc(state.phraseQuery)}" placeholder="Найти по названию или тексту" dir="ltr"><button type="button" class="phrase-search-clear ${state.phraseQuery?'':'hidden'}" data-clear-phrase-search aria-label="Очистить поиск">×</button></div>
    <div class="bs-phrase-list">${phraseGroupsBodyHtml()}</div>
    <div class="phrase-db-note">Позиция, последний скрипт и поиск запоминаются на этом устройстве.</div>
  </aside>`;
}

function draftDefaults(){const d=state.selectedDialog;return{vkId:d?.peerId||'',fullName:d?.name||'',city:'',crmStatus:'',nextContactDate:'',phone:'',email:'',managerLogin:'',shortNotes:'',comments:''}}
function rightDrawerHtml(){const crm=state.chatCrm;return`<aside class="drawer drawer-right blue-workspace-panel ${(state.rightDrawer||workspaceDesktop())?'open':''}"><div class="drawer-head blue-panel-head"><div><b>CRM</b><small>${esc(state.selectedDialog?.name||'')}</small></div><button data-close-drawers>${I.close}</button></div><div class="drawer-scroll">${crm?rightExisting(crm):rightMissing()}</div></aside>`}
function rightMissing(){if(!state.clientDraft)return`<section class="crm-empty-panel"><div class="blue-title"><b>КЛИЕНТ</b>${hasSyncedCapability('customers')?'<button type="button" data-new-draft>Новый</button>':'<span>нет доступа</span>'}</div><div class="crm-placeholder"><b>Карточка клиента не найдена</b><p>Нажмите «Новый» — появится карточка с данными из VK. Сохранение в BlueSales выполняется кнопкой «Сохранить» внутри карточки.</p><small>VK ID ${esc(state.selectedDialog?.peerId||'')}</small></div></section>`;const d=state.clientDraft;return`<section class="crm-draft"><div class="blue-title"><b>КЛИЕНТ</b><span>новая карточка</span></div><form id="draftClientForm" class="client-form drawer-form"><input type="hidden" name="vkId" value="${esc(d.vkId)}"><label>ФИО<input name="fullName" value="${esc(d.fullName)}" required></label><label>Город<input name="city" value="${esc(d.city)}"></label><label>CRM-статус<select name="crmStatus"><option value="">Без статуса</option>${state.meta.statuses.map(x=>`<option style="color:${statusColor(x)}">${esc(x)}</option>`).join('')}</select></label><label>След. контакт<input type="date" name="nextContactDate" value="${esc(d.nextContactDate)}"></label><label>Моб. тел.<input name="phone" value="${esc(d.phone)}"></label><label>E-mail<input type="email" name="email" value="${esc(d.email)}"></label><label>Менеджер<select name="managerLogin"><option value="">Не назначать</option>${state.meta.users.map(u=>`<option value="${esc(u.login)}" style="color:${managerColor(u.name||u.login,u.color)}">${esc(u.name||u.login)}</option>`).join('')}</select></label><label>Краткая заметка<textarea name="shortNotes" rows="2">${esc(d.shortNotes)}</textarea></label><label>Примечание<textarea name="comments" rows="3">${esc(d.comments)}</textarea></label><div class="drawer-actions"><button type="button" class="secondary" data-cancel-draft>Отмена</button><button class="primary">Сохранить</button></div></form></section>`}
function rightExisting(c){
  return`<div class="bs-crm-stack">
    ${clientDrawer(c)}
    ${hasSyncedCapability('reminders')?reminderDrawer(c):''}
    ${hasSyncedCapability('orders')?orderDrawer(c):''}
    ${hasSyncedCapability('services')?serviceDrawer():''}
  </div>`;
}
function clientRows(c){
  const phoneHref=c.phone?`tel:${String(c.phone).replace(/[^+\d]/g,'')}`:'';
  const emailHref=c.email?`mailto:${c.email}`:'';
  const vkId=c.social?.vkId||c.vkId||state.selectedDialog?.peerId||'';
  const vkHref=vkId?`https://vk.com/id${vkId}`:'';
  return`<div class="bs-client-view bs-exact-card">
  <div class="bs-field"><span>ФИО</span><strong>${esc(c.fullName||'—')}</strong></div>
  <div class="bs-field"><span>Город</span><strong>${esc(c.city||'—')}</strong></div>
  <div class="bs-field"><span>CRM-статус</span><strong class="bs-status-cell">${statusHtml(c.crmStatus,c.crmStatusColor)}</strong></div>
  <div class="bs-field"><span>Дата после...</span><strong>${esc(fmtDate(c.lastContactDate||''))}</strong></div>
  <div class="bs-field"><span>След. конт.</span><strong>${esc(fmtDate(c.nextContactDate))}</strong></div>
  <div class="bs-field"><span>Моб. тел.</span><strong>${phoneHref?`<a href="${esc(phoneHref)}">${esc(c.phone)}</a>`:'—'}</strong></div>
  <div class="bs-field"><span>E-mail</span><strong>${emailHref?`<a href="${esc(emailHref)}">${esc(c.email)}</a>`:'—'}</strong></div>
  <div class="bs-field"><span>VK ID</span><strong>${vkHref?`<a href="${esc(vkHref)}" target="_blank" rel="noopener">${esc(vkId)}</a>`:'—'}</strong></div>
  <div class="bs-field"><span>Менеджер</span><strong>${c.manager?managerHtml(c.manager,c.managerColor):'—'}</strong></div>
  <div class="bs-field bs-field-tags"><span>Тэги</span><div class="tags">${tagHtml(c.tags)||'<em>—</em>'}</div></div>
  <div class="bs-client-linkbar"><button type="button" data-copy-route="#/client/${esc(c.id)}">🔗 Ссылка клиента</button><button type="button" data-copy-api="/api/clients/${esc(c.id)}">JSON</button></div>
  <div class="bs-note"><span>Примечание</span><p>${esc(c.comments||c.shortNotes||'—').replace(/\n/g,'<br>')}</p></div>
</div>`}

function editForm(c){const v=mergeClientForEdit(state.clientEditSnapshot||{},c||{}),vkId=v.social?.vkId||v.vkId||state.selectedDialog?.peerId||'';return`<form id="drawerClientEdit" class="client-form drawer-form bs-compact-form">
  <label>ФИО<input name="fullName" value="${esc(v.fullName||'')}"></label>
  <label>Город<input name="city" value="${esc(v.city||'')}"></label>
  <label>CRM-статус<select name="crmStatus"><option value="">Без статуса</option>${state.meta.statuses.map(x=>`<option style="color:${statusColor(x)}" ${v.crmStatus===x?'selected':''}>${esc(x)}</option>`).join('')}</select></label>
  <label>Дата послед.<input value="${esc(fmtDate(v.lastContactDate||''))}" readonly class="readonly-field"></label>
  <label>След. конт.<input name="nextContactDate" type="date" value="${esc(dateInput(v.nextContactDate))}"></label>
  <label>Моб. тел.<input name="phone" value="${esc(v.phone||'')}"></label>
  <label>E-mail<input name="email" type="email" value="${esc(v.email||'')}"></label>
  <label>VK ID<input value="${esc(vkId)}" readonly class="readonly-field"></label>
  <label>Менеджер<select name="managerLogin"><option value="">Не менять</option>${state.meta.users.map(u=>`<option value="${esc(u.login)}" style="color:${managerColor(u.name||u.login,u.color)}" ${(v.managerLogin===u.login||(!v.managerLogin&&v.manager===u.name))?'selected':''}>${esc(u.name||u.login)}</option>`).join('')}</select></label>
  <label>Тэги<div class="tags edit-tags">${tagHtml(v.tags)||'<em>—</em>'}</div></label>
  <label>Краткая заметка<textarea name="shortNotes" rows="2">${esc(v.shortNotes||'')}</textarea></label>
  <label>Примечание<textarea name="comments" rows="3">${esc(v.comments||'')}</textarea></label>
  <div class="drawer-actions"><button type="button" class="secondary" data-cancel-edit>Отмена</button><button class="primary">Сохранить</button></div>
</form>`}
function clientDrawer(c){return`<section class="bs-sidebar-section">
  <div class="blue-title"><b>КЛИЕНТ</b><button data-toggle-drawer-edit>${state.drawerEdit?'просмотр':'редактировать'}</button></div>
  ${state.drawerEdit?editForm(c):clientRows(c)}
</section>`}
function reminderDrawer(c){return`<section class="bs-sidebar-section bs-reminder-inline">
  <div class="blue-subtitle">Следующий контакт</div>
  <form id="drawerReminderForm" class="drawer-reminder bs-reminder-form">
    <input type="date" name="nextContactDate" value="${esc(dateInput(c.nextContactDate))}">
    <div class="quick-dates"><button type="button" data-date="0">Сегодня</button><button type="button" data-date="1">Завтра</button><button type="button" data-date="7">+7 дней</button></div>
    <button class="bs-link-button">Сохранить дату</button>
  </form>
</section>`}

function money(v){return Number(v||0).toLocaleString('ru-RU',{maximumFractionDigits:2})}
function orderCard(o){const subtotal=(o.positions||[]).reduce((n,p)=>n+Number(p.price||0)*Number(p.quantity||1),0),total=Number(o.sum||subtotal||0),rem=Math.max(0,total-(o.prepay||0));return`<div class="order-card bs-order-exact">
  <div class="order-top"><strong>${esc(o.internalNumber?`№ ${o.internalNumber}`:`Заказ ${o.id}`)}</strong><span>${esc(o.status||'')}</span></div>
  <div class="order-mini-meta"><span>Менеджер</span><b>${esc(o.manager||'—')}</b><span>Дата</span><b>${esc(fmtDate(o.date))}</b></div>
  ${(o.positions||[]).length?`<div class="order-cart-title">Корзина</div>${(o.positions||[]).map(p=>`<div class="position"><span><b>${esc(p.marking||'')}</b> ${esc(p.name)}</span><b>${p.quantity} × ${money(p.price)} ₽</b></div>`).join('')}`:'<div class="empty small">Позиции не указаны</div>'}
  <div class="order-sums"><div><span>Итого</span><b>${money(total)} ₽</b></div><div><span>Предоплата</span><b>${money(o.prepay)} ₽</b></div><div><span>Осталось оплатить</span><b>${money(rem)} ₽</b></div></div>
</div>`}
function newOrderTotal(){const d=state.newOrderDraft;if(!d)return 0;const subtotal=(d.positions||[]).reduce((n,p)=>n+Number(p.price||0)*Number(p.quantity||1),0);return Math.max(0,subtotal*(1-Math.max(0,Math.min(100,Number(d.discount||0)))/100))}
function newOrderForm(){const d=state.newOrderDraft,users=state.meta.users||[],me=state.meta.currentUser?.login||state.session?.login||'';if(!d)return'';return`<section class="bs-sidebar-section order-draft-section">
  <div class="blue-title"><b>ЗАКАЗ</b><button type="button" data-cancel-new-order>Отмена</button></div>
  <form id="newOrderForm" class="bs-order-draft">
    <div class="bs-order-grid"><span>Статус</span><input name="orderStatus" value="${esc(d.orderStatus||'Новый')}" required><span>Менеджер</span><select name="managerLogin"><option value="">Не назначать</option>${users.map(u=>`<option value="${esc(u.login)}" ${(d.managerLogin||me)===u.login?'selected':''}>${esc(u.name||u.login)}</option>`).join('')}</select><span>Дата</span><input name="date" type="date" value="${esc(d.date||todayPlus(0))}"></div>
    <div class="order-cart-title">Корзина</div>
    <div class="draft-positions">${(d.positions||[]).length?(d.positions||[]).map((p,i)=>`<div class="draft-position"><div class="draft-position-name"><span><b>${esc(p.marking||'')}</b> ${esc(p.name)}</span><button type="button" data-remove-service="${i}">×</button></div><label>Цена<input type="number" min="0" step="0.01" value="${esc(p.price)}" data-position-price="${i}"></label><label>Кол-во<input type="number" min="1" step="1" value="${esc(p.quantity||1)}" data-position-qty="${i}"></label></div>`).join(''):'<div class="service-placeholder compact">Сначала выберите услугу ниже.</div>'}</div>
    <div class="bs-order-grid totals-edit"><span>Скидка %</span><input name="discount" type="number" min="0" max="100" step="0.1" value="${esc(d.discount||0)}" data-order-discount><span>Предоплата</span><input name="prepay" type="number" min="0" step="0.01" value="${esc(d.prepay||0)}"><span>Итого</span><strong data-order-total>${money(newOrderTotal())} ₽</strong><span>Осталось</span><strong data-order-remain>${money(Math.max(0,newOrderTotal()-Number(d.prepay||0)))} ₽</strong></div>
    <label class="order-comment-label">Прим. (внут.)<textarea name="internalComments" rows="2">${esc(d.internalComments||'')}</textarea></label>
    <div class="drawer-actions"><button type="button" class="secondary" data-cancel-new-order>Отмена</button><button class="primary" type="submit" ${!(d.positions||[]).length?'disabled':''}>Сохранить</button></div>
  </form></section>`}
function orderDrawer(){
  if(state.newOrderDraft)return newOrderForm();
  const body=state.drawerOrdersLoaded
    ?(state.drawerOrders.length?state.drawerOrders.map(orderCard).join(''):'<div class="empty small">Нет заказа</div>')
    :(state.drawerOrdersError?`<div class="empty small order-error">${esc(state.drawerOrdersError)}<button type="button" class="bs-refresh-link inline-retry" data-retry-orders>Повторить</button></div>`:'<div class="empty small">Загрузка...</div>');
  return`<section class="bs-sidebar-section"><div class="blue-title"><b>ЗАКАЗ</b><div class="order-title-actions">${state.drawerOrdersLoading?'<small class="order-loading">обновляю…</small>':''}<button type="button" data-new-order>Новый</button></div></div>${body}</section>`
}
function serviceRows(){
  const q=state.serviceQuery;
  return(state.serviceCatalog||[]).filter(v=>textMatchesQuery(`${v.marking||''} ${v.name||''}`,q));
}
function serviceResultsHtml(){
  if(!state.serviceLoaded)return'<div class="empty small">Загрузка услуг…</div>';
  const rows=serviceRows();
  return rows.length?rows.map(v=>`<button type="button" data-add-service="${esc(v.id)}"><b>${esc(v.marking||'')}</b><span>${esc(v.name)}</span><em>${v.defaultPrice?money(v.defaultPrice)+' ₽':''}</em></button>`).join(''):'<div class="empty small">Услуга не найдена</div>';
}
function serviceDrawer(){if(!state.newOrderDraft)return`<section class="bs-sidebar-section"><div class="blue-title"><b>УСЛУГА</b></div><div class="service-placeholder">Нажмите «Новый» в блоке ЗАКАЗ, затем выберите услугу.</div></section>`;return`<section class="bs-sidebar-section service-picker"><div class="blue-title"><b>УСЛУГА</b></div><div class="bs-service-search"><label>Артикул / Название<input id="serviceSearch" type="text" value="${esc(state.serviceQuery)}" placeholder="A-001 или название"></label></div><div class="service-results">${serviceResultsHtml()}</div><div class="service-custom"><button type="button" data-custom-service>＋ Другая услуга</button></div></section>`}
function bindServicePickerButtons(root=document){
  root.querySelectorAll('[data-add-service]').forEach(b=>b.onclick=()=>{const svc=state.serviceCatalog.find(v=>String(v.id)===String(b.dataset.addService));if(!svc||!state.newOrderDraft)return;state.newOrderDraft.positions.push({id:svc.id,marking:svc.marking,name:svc.name,price:svc.defaultPrice||0,quantity:1});renderChat(false)});
  const cs=root.querySelector('[data-custom-service]');if(cs)cs.onclick=()=>{if(!state.newOrderDraft)return;const name=prompt('Название услуги');if(!name)return;const marking=prompt('Артикул (можно оставить пустым)')||'';state.newOrderDraft.positions.push({marking,name,price:0,quantity:1});renderChat(false)};
}
function refreshServiceResultsOnly(){
  const list=document.querySelector('.service-results');if(!list)return;
  list.innerHTML=serviceResultsHtml();
  bindServicePickerButtons(document.querySelector('.service-picker')||document);
}
function firstName(){const full=state.chatCrm?.fullName||state.selectedDialog?.name||'';return String(full).trim().split(/\s+/)[0]||''}
function expandPhrase(text=''){const c=state.chatCrm||{},o=state.drawerOrders?.[0]||{},left=Math.max(0,Number(o.sum||0)-Number(o.prepay||0));const values={'Имя':firstName(),'ФИО':c.fullName||state.selectedDialog?.name||'','Телефон':c.phone||'','E-mail':c.email||'','Email':c.email||'','Город':c.city||'','CRM-статус':c.crmStatus||'','Менеджер':c.manager||'','Номер заказа':o.internalNumber||o.id||'','Сумма заказа':o.sum?`${Number(o.sum).toLocaleString('ru-RU')} ₽`:'','Осталось оплатить':o.sum?`${left.toLocaleString('ru-RU')} ₽`:''};let out=String(text||'');for(const[k,v]of Object.entries(values)){for(const re of [new RegExp(`\\[${k}\\]`,'gi'),new RegExp(`\\{${k}\\}`,'gi')])out=out.replace(re,String(v||''))}return out}
async function syncAccountUi(){
  setLoading(true);
  try{
    const r=await BSAPI.syncAccountUi();
    state.phraseLoaded=false;state.metaLoaded=false;
    await ensureMeta().catch(()=>{});await ensurePhrases().catch(()=>{});
    toast(r.ok?`BlueSales синхронизирован: фраз ${r.quickPhrases?.count||0}`:(r.message||'BlueSales не дал синхронизировать интерфейс'),r.ok?'ok':'error');
    if(state.selectedDialog)renderChat(false);else render();
  }catch(e){toast(e.message,'error')}finally{setLoading(false)}
}
async function importBlueSalesHtml(file){
  if(!file)return;
  if(file.size>6*1024*1024)return toast('HTML больше 6 МБ','error');
  setLoading(true);
  try{
    const html=await file.text();
    const r=await BSAPI.importAccountUi(html);
    state.phraseLoaded=false;state.metaLoaded=false;
    await ensureMeta().catch(()=>{});await ensurePhrases(true).catch(()=>{});
    toast(`BlueSales импортирован: фраз ${r.phrases?.count||0}, статусов ${r.dictionaries?.statuses||0}, тегов ${r.dictionaries?.tags||0}`,'ok');
    if(state.selectedDialog)renderChat(false);else render();
  }catch(e){toast(e.message,'error')}finally{setLoading(false)}
}
async function saveNewOrder(e){
  e.preventDefault();if(!state.chatCrm?.id)return toast('Сначала создайте карточку клиента','error');
  const fd=new FormData(e.currentTarget),d=state.newOrderDraft||{};
  if(!(d.positions||[]).length)return toast('Добавьте услугу в заказ','error');
  const payload={customerId:state.chatCrm.id,orderStatus:fd.get('orderStatus')||'Новый',date:fd.get('date')||todayPlus(0),managerLogin:fd.get('managerLogin')||'',discount:Number(fd.get('discount')||0),prepay:Number(fd.get('prepay')||0),internalComments:String(fd.get('internalComments')||''),goodsPositions:(d.positions||[]).map(p=>({goods:Number.isFinite(Number(p.id))&&Number(p.id)>0?{id:Number(p.id)}:{marking:p.marking,name:p.name},price:Number(p.price||0),quantity:Math.max(1,Number(p.quantity||1))}))};
  setLoading(true);
  try{
    const r=await BSAPI.createOrder(payload);
    state.newOrderDraft=null;state.serviceQuery='';
    if(r?.order){state.drawerOrders=[r.order,...state.drawerOrders.filter(x=>String(x.id)!==String(r.order.id))];state.drawerOrdersLoaded=true}
    renderChatKeepScroll();
    toast('Заказ сохранён в BlueSales','ok');
    // Re-read in background to get BlueSales' final internal number/status without
    // making the Save button wait for another organization API call.
    loadDrawerOrders(true).catch(()=>{});
  }catch(e){toast(e.message,'error')}finally{setLoading(false)}
}
async function copyWholeDialog(){
  if(!state.selectedDialog||state.messageExportLoading)return;
  state.messageExportLoading=true;
  const b=document.querySelector('[data-copy-dialog]');
  if(b){b.disabled=true;b.textContent='…'}
  try{
    const r=await BSAPI.dialogText(state.selectedDialog.peerId);
    await copyText(r.text||'','Весь диалог скопирован');
    const voice=Number(r.voiceTranscribed||0),missing=Number(r.voiceMissing||0);
    const suffix=voice?` • расшифровано голосовых: ${voice}`:missing?` • без расшифровки: ${missing}`:'';
    toast(`Скопировано сообщений: ${r.count||0}${suffix}`,'ok');
  }catch(e){
    const fallback=state.messages.map(messagePlainText).join('\n');
    if(fallback){await copyText(fallback,'Скопированы загруженные сообщения');toast(`Полный экспорт недоступен: ${e.message}`,'error')}
    else toast(`Копирование диалога: ${e.message}`,'error')
  }finally{
    state.messageExportLoading=false;
    if(b){b.disabled=false;b.textContent='⧉'}
  }
}
async function forwardMessageTo(peerId){const m=state.forwardTarget,id=Number(m?.id||0),target=Number(peerId||0);if(!id||!target)return toast('Не удалось определить сообщение или получателя','error');setLoading(true);try{await BSAPI.sendVkMessage(target,{forwardMessageIds:[id]});state.forwardTarget=null;state.messageMenuId='';toast('Сообщение переслано','ok');renderChatKeepScroll()}catch(e){toast(`Пересылка: ${e.message}`,'error')}finally{setLoading(false)}}

async function refreshVoiceTranscript(messageId){
  const m=findMessage(messageId),voice=messageVoice(m),cmid=Number(m?.conversationMessageId||0),peerId=Number(state.selectedDialog?.peerId||0);
  if(!m||!voice?.url||!cmid||!peerId)return toast('Не удалось определить голосовое сообщение','error');
  const button=document.querySelector(`[data-msg-transcribe="${String(messageId).replace(/"/g,'\"')}"]`);
  if(button){button.disabled=true;button.dataset.oldText=button.textContent;button.textContent='Расшифровываю…'}
  toast('Расшифровываю голосовое. Аудио при этом можно продолжать слушать.');
  try{
    const r=await BSAPI.transcribeVoice(peerId,cmid,voice.url);
    voice.transcript=String(r.transcript||'').trim();voice.transcriptState=voice.transcript?'done':'';voice.transcriptError=0;voice.transcriptSource=String(r.transcriptSource||'local-whisper');saveLocalVoiceTranscript(peerId,cmid,voice.transcript);
    state.messageMenuId='';renderChatKeepScroll();
    if(r.available)toast(r.cached?'Расшифровка уже была сохранена':'Расшифровка готова','ok');
    else toast('Не удалось распознать речь','error');
  }catch(e){toast(`Расшифровка: ${e.message}`,'error')}
  finally{if(button?.isConnected){button.disabled=false;button.textContent=button.dataset.oldText||'Расшифровать'}}
}
function bindChatSwipeGestures(){
  const shell=document.querySelector('.chat-shell');if(!shell||window.innerWidth>=700)return;
  let sx=0,sy=0,mode='',pointerId=null;
  const interactive=t=>Boolean(t?.closest?.('input,textarea,select,button,a,audio,video,.msg-action-menu,.forward-modal,.service-results,.drawer'));
  const begin=(x,y,target,id=null)=>{
    if(interactive(target))return;
    const w=window.innerWidth; sx=x;sy=y;pointerId=id;mode='';
    if(state.leftDrawer)mode='close-left';
    else if(state.rightDrawer)mode='close-right';
    // Keep 22px for Android/iOS system Back gesture, then use the next strip.
    else if(sx>=22&&sx<=104)mode='open-left';
    else if(sx>=w-104&&sx<=w-22)mode='open-right';
  };
  const finish=(x,y,id=null)=>{
    if(!mode||!sx||(pointerId!=null&&id!=null&&pointerId!==id))return;
    const dx=x-sx,dy=y-sy,absX=Math.abs(dx),absY=Math.abs(dy);
    const current=mode;mode='';sx=sy=0;pointerId=null;
    if(absX<48||absX<absY*1.25)return;
    if(current==='open-left'&&dx>0){
      openChatDrawer('phrases');
      ensurePhrases().then(()=>{if(state.selectedDialog){renderChatKeepScroll();restorePhraseDrawerPosition()}}).catch(()=>{});
    }else if(current==='open-right'&&dx<0){
      openChatDrawer('crm');
      const peer=state.selectedDialog?.peerId;
      Promise.allSettled([ensureMeta(),hydrateChatClient(false),ensureServices()]).then(()=>{
        if(state.selectedDialog?.peerId===peer){if(state.chatCrm&&!state.drawerOrdersLoaded)loadDrawerOrders();renderChatKeepScroll()}
      });
    }else if(current==='close-left'&&dx<0)closeChatDrawer('phrases',{preferHistory:true});
    else if(current==='close-right'&&dx>0)closeChatDrawer('crm',{preferHistory:true});
  };
  if('PointerEvent'in window){
    shell.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch'&&e.pointerType!=='pen')return;begin(e.clientX,e.clientY,e.target,e.pointerId)},{passive:true});
    shell.addEventListener('pointerup',e=>finish(e.clientX,e.clientY,e.pointerId),{passive:true});
    shell.addEventListener('pointercancel',()=>{mode='';sx=sy=0;pointerId=null},{passive:true});
  }else{
    shell.addEventListener('touchstart',e=>{if(e.touches.length!==1)return;const t=e.touches[0];begin(t.clientX,t.clientY,e.target,null)},{passive:true});
    shell.addEventListener('touchend',e=>{const t=e.changedTouches?.[0];if(t)finish(t.clientX,t.clientY,null)},{passive:true});
  }
}
async function bindChat(){document.querySelectorAll('.voice-player').forEach(a=>{a.addEventListener('error',()=>{const box=a.closest('.voice-message');box?.classList.add('voice-playback-error')},{once:true})});bindChatSwipeGestures();document.querySelectorAll('[data-theme-toggle]').forEach(b=>b.onclick=toggleTheme);const chatBackButton=document.querySelector('[data-chat-back]');if(chatBackButton)chatBackButton.onclick=e=>{e.preventDefault();e.stopPropagation();chatBack()};const copyDialogButton=document.querySelector('[data-copy-dialog]');if(copyDialogButton)copyDialogButton.onclick=copyWholeDialog;document.querySelectorAll('[data-msg-menu]').forEach(b=>b.onclick=e=>{e.stopPropagation();const id=String(b.dataset.msgMenu||'');state.messageMenuId=String(state.messageMenuId||'')===id?'':id;renderChatKeepScroll()});document.querySelectorAll('[data-msg-copy]').forEach(b=>b.onclick=e=>{e.stopPropagation();const m=findMessage(b.dataset.msgCopy);state.messageMenuId='';if(m)copyText(messagePlainText(m),'Сообщение скопировано')});document.querySelectorAll('[data-msg-copy-transcript]').forEach(b=>b.onclick=e=>{e.stopPropagation();const m=findMessage(b.dataset.msgCopyTranscript),t=messageVoice(m)?.transcript||'';state.messageMenuId='';if(t)copyText(t,'Расшифровка скопирована');else toast('Расшифровка ещё не готова','error')});document.querySelectorAll('[data-msg-transcribe]').forEach(b=>b.onclick=e=>{e.stopPropagation();refreshVoiceTranscript(b.dataset.msgTranscribe)});document.querySelectorAll('[data-msg-reply]').forEach(b=>b.onclick=e=>{e.stopPropagation();state.replyTarget=findMessage(b.dataset.msgReply);state.forwardTarget=null;state.messageMenuId='';renderChatKeepScroll();requestAnimationFrame(()=>document.getElementById('messageInput')?.focus())});document.querySelectorAll('[data-msg-forward]').forEach(b=>b.onclick=e=>{e.stopPropagation();state.forwardTarget=findMessage(b.dataset.msgForward);state.messageMenuId='';renderChatKeepScroll()});const messageArea=document.getElementById('messages');if(messageArea)messageArea.onclick=e=>{if(state.messageMenuId&&!e.target.closest('.msg-action-wrap')){state.messageMenuId='';renderChatKeepScroll()}};const cancelReply=document.querySelector('[data-cancel-reply]');if(cancelReply)cancelReply.onclick=()=>{state.replyTarget=null;renderChatKeepScroll()};const cancelForward=document.querySelector('[data-cancel-forward]');if(cancelForward)cancelForward.onclick=()=>{state.forwardTarget=null;renderChatKeepScroll()};document.querySelectorAll('[data-forward-peer]').forEach(b=>b.onclick=()=>forwardMessageTo(b.dataset.forwardPeer));const fpf=document.getElementById('forwardPeerForm');if(fpf)fpf.onsubmit=e=>{e.preventDefault();forwardMessageTo(new FormData(fpf).get('peerId'))};document.querySelectorAll('[data-open-phrases]').forEach(b=>b.onclick=async()=>{openChatDrawer('phrases');try{await ensurePhrases();if(state.selectedDialog){renderChatKeepScroll();restorePhraseDrawerPosition()}}catch(e){toast(e.message,'error')}});document.querySelector('[data-open-crm]').onclick=()=>{openChatDrawer('crm');const peer=state.selectedDialog?.peerId;Promise.allSettled([ensureMeta(),hydrateChatClient(false),ensureServices()]).then(()=>{if(state.selectedDialog?.peerId!==peer)return;if(state.chatCrm&&!state.drawerOrdersLoaded)loadDrawerOrders();renderChatKeepScroll()});};document.querySelectorAll('[data-close-drawers]').forEach(b=>b.onclick=()=>closeChatDrawer('',{preferHistory:true}));document.querySelectorAll('[data-copy-route]').forEach(b=>b.onclick=e=>{e.stopPropagation();const url=routeUrl(b.dataset.copyRoute);track('copy-link',{route:b.dataset.copyRoute,url});copyText(url)});document.querySelectorAll('[data-copy-api]').forEach(b=>b.onclick=e=>{e.stopPropagation();copyText(`${location.origin}${b.dataset.copyApi}`,'API-ссылка скопирована')});document.querySelectorAll('[data-sync-ui]').forEach(b=>b.onclick=syncAccountUi);const ib=document.querySelector('[data-import-bs-html]'),ifi=document.getElementById('bsHtmlImportInput');if(ib&&ifi){ib.onclick=()=>ifi.click();ifi.onchange=e=>importBlueSalesHtml(e.target.files?.[0])};const ps=document.getElementById('phraseSearch');if(ps)ps.addEventListener('input',()=>{state.phraseQuery=ps.value;state.phraseScrollTop=0;savePhraseDrawerState();refreshPhraseListOnly()});const pcs=document.querySelector('[data-clear-phrase-search]');if(pcs)pcs.onclick=()=>{state.phraseQuery='';state.phraseScrollTop=0;savePhraseDrawerState();const input=document.getElementById('phraseSearch');if(input)input.value='';refreshPhraseListOnly();input?.focus()};bindPhraseButtons(document);const phraseDrawer=document.querySelector('.drawer-left');if(phraseDrawer){let pst;phraseDrawer.addEventListener('scroll',()=>{clearTimeout(pst);pst=setTimeout(capturePhraseDrawerState,120)},{passive:true})}document.querySelectorAll('[data-remove-pending]').forEach(b=>b.onclick=()=>{state.messageAttachments.splice(Number(b.dataset.removePending),1);renderChat(false)});const pcl=document.querySelector('[data-clear-pending]');if(pcl)pcl.onclick=()=>{state.messageAttachments=[];renderChat(false)};document.querySelectorAll('[data-right-tab]').forEach(b=>b.onclick=()=>{state.rightTab=b.dataset.rightTab;if(state.rightTab==='order'&&!state.drawerOrdersLoaded)loadDrawerOrders();renderChat(false)});const retryOrders=document.querySelector('[data-retry-orders]');if(retryOrders)retryOrders.onclick=()=>loadDrawerOrders(true);const no=document.querySelector('[data-new-order]');if(no)no.onclick=()=>{state.newOrderDraft={orderStatus:'Новый',date:todayPlus(0),managerLogin:state.meta.currentUser?.login||state.session?.login||'',discount:0,prepay:0,internalComments:'',positions:[]};state.serviceQuery='';renderChat(false);Promise.allSettled([ensureServices(),ensureMeta()]).then(()=>{if(state.newOrderDraft&&state.selectedDialog)renderChatKeepScroll()})};document.querySelectorAll('[data-cancel-new-order]').forEach(cno=>cno.onclick=()=>{state.newOrderDraft=null;state.serviceQuery='';renderChat(false)});const nof=document.getElementById('newOrderForm');if(nof)nof.onsubmit=saveNewOrder;const ss=document.getElementById('serviceSearch');if(ss){ss.setAttribute('dir','ltr');ss.oninput=()=>{state.serviceQuery=ss.value;refreshServiceResultsOnly()}};bindServicePickerButtons(document);document.querySelectorAll('[data-remove-service]').forEach(b=>b.onclick=()=>{if(!state.newOrderDraft)return;state.newOrderDraft.positions.splice(Number(b.dataset.removeService),1);renderChat(false)});document.querySelectorAll('[data-position-price]').forEach(i=>i.oninput=()=>{if(!state.newOrderDraft)return;state.newOrderDraft.positions[Number(i.dataset.positionPrice)].price=Number(i.value||0);const total=document.querySelector('[data-order-total]'),remain=document.querySelector('[data-order-remain]'),prepay=Number(document.querySelector('#newOrderForm [name="prepay"]')?.value||0);if(total)total.textContent=money(newOrderTotal())+' ₽';if(remain)remain.textContent=money(Math.max(0,newOrderTotal()-prepay))+' ₽'});document.querySelectorAll('[data-position-qty]').forEach(i=>i.oninput=()=>{if(!state.newOrderDraft)return;state.newOrderDraft.positions[Number(i.dataset.positionQty)].quantity=Math.max(1,Number(i.value||1));const total=document.querySelector('[data-order-total]'),remain=document.querySelector('[data-order-remain]'),prepay=Number(document.querySelector('#newOrderForm [name="prepay"]')?.value||0);if(total)total.textContent=money(newOrderTotal())+' ₽';if(remain)remain.textContent=money(Math.max(0,newOrderTotal()-prepay))+' ₽'});const disc=document.querySelector('[data-order-discount]');if(disc)disc.oninput=()=>{if(!state.newOrderDraft)return;state.newOrderDraft.discount=Number(disc.value||0);const total=document.querySelector('[data-order-total]'),remain=document.querySelector('[data-order-remain]'),prepay=Number(document.querySelector('#newOrderForm [name="prepay"]')?.value||0);if(total)total.textContent=money(newOrderTotal())+' ₽';if(remain)remain.textContent=money(Math.max(0,newOrderTotal()-prepay))+' ₽'};const pp=document.querySelector('#newOrderForm [name="prepay"]');if(pp)pp.oninput=()=>{if(!state.newOrderDraft)return;state.newOrderDraft.prepay=Number(pp.value||0);const remain=document.querySelector('[data-order-remain]');if(remain)remain.textContent=money(Math.max(0,newOrderTotal()-state.newOrderDraft.prepay))+' ₽'};const nd=document.querySelector('[data-new-draft]');if(nd)nd.onclick=async()=>{await ensureMeta().catch(()=>{});state.clientDraft=draftDefaults();renderChat(false)};const cd=document.querySelector('[data-cancel-draft]');if(cd)cd.onclick=()=>{state.clientDraft=null;renderChat(false)};const df=document.getElementById('draftClientForm');if(df)df.onsubmit=saveDraft;document.querySelectorAll('[data-toggle-drawer-edit]').forEach(b=>b.onclick=async()=>{const next=!state.drawerEdit;track('client-edit-toggle',{clientId:state.chatCrm?.id||null,editing:next});if(next){state.clientEditSnapshot=JSON.parse(JSON.stringify(state.chatCrm||{}));setLoading(true);try{await hydrateChatClient(true);state.chatCrm=mergeClientForEdit(state.clientEditSnapshot||{},state.chatCrm||{})}finally{setLoading(false)}}else state.clientEditSnapshot=null;state.drawerEdit=next;renderChatKeepScroll()});const ce=document.querySelector('[data-cancel-edit]');if(ce)ce.onclick=()=>{if(state.clientEditSnapshot)state.chatCrm=state.clientEditSnapshot;state.clientEditSnapshot=null;state.drawerEdit=false;renderChatKeepScroll()};const ef=document.getElementById('drawerClientEdit');if(ef)ef.onsubmit=saveDrawerClient;const rf=document.getElementById('drawerReminderForm');if(rf)rf.onsubmit=saveReminderDate;document.querySelectorAll('[data-date]').forEach(b=>b.onclick=()=>{const i=document.querySelector('#drawerReminderForm input[name="nextContactDate"]');if(i)i.value=todayPlus(Number(b.dataset.date))});const expand=document.querySelector('[data-expand-composer]');if(expand)expand.onclick=()=>{state.composerExpanded=!state.composerExpanded;track('composer-resize',{expanded:state.composerExpanded});autoSizeComposer();document.getElementById('messageInput')?.focus()};document.querySelector('[data-attach]').onclick=()=>document.getElementById('attachMenu').classList.toggle('hidden');document.querySelectorAll('[data-file-kind]').forEach(b=>b.onclick=()=>{const map={photo:'filePhoto',video:'fileVideo',audio_message:'fileAudio',doc:'fileDoc'};document.getElementById(map[b.dataset.fileKind]).click();document.getElementById('attachMenu').classList.add('hidden')});[['filePhoto','photo'],['fileVideo','video'],['fileAudio','audio_message'],['fileDoc','doc']].forEach(([id,k])=>{document.getElementById(id).onchange=e=>uploadFile(e.target.files?.[0],k)});document.getElementById('messageForm').onsubmit=sendMessage;const autoMount=document.getElementById('phraseAutocompleteMount');if(autoMount)autoMount.onclick=e=>{const b=e.target.closest('[data-auto-phrase]');if(!b)return;const p=allPhrases().find(x=>String(x.id)===String(b.dataset.autoPhrase));applyPhrase(p);refreshComposerOnly(true)};const inp=document.getElementById('messageInput');inp.setAttribute('dir','ltr');inp.setAttribute('inputmode','text');inp.setAttribute('autocomplete','off');inp.onfocus=()=>{releaseChatBottomLock();document.documentElement.classList.add('chat-keyboard-open');syncMobileViewport();setTimeout(()=>{syncMobileViewport();const m=document.getElementById('messages');if(m)m.scrollTop=m.scrollHeight},80)};inp.onblur=()=>{document.documentElement.classList.remove('chat-keyboard-open');setTimeout(()=>{syncMobileViewport();if(state._layoutRenderPending){state._layoutRenderPending=false;state._renderedLayoutMode=currentResponsiveMode();renderChatKeepScroll();return}if(state._chatRenderDeferred){state._chatRenderDeferred=false;renderChatKeepScroll()}},120)};inp.oninput=async()=>{state.messageDraft=inp.value;autoSizeComposer();state.phraseSuggestOpen=inp.value.trim().length>=1;state.phraseSuggestIndex=0;if(state.phraseSuggestOpen&&!state.phraseLoaded){try{await ensurePhrases()}catch{}}refreshPhraseAutocomplete()};inp.onkeydown=e=>{const list=phraseMatches(state.messageDraft);if(state.phraseSuggestOpen&&list.length&&(e.key==='ArrowDown'||e.key==='ArrowUp'||e.key==='Tab')){e.preventDefault();state.phraseSuggestIndex=e.key==='ArrowUp'?Math.max(0,state.phraseSuggestIndex-1):Math.min(list.length-1,state.phraseSuggestIndex+1);refreshPhraseAutocomplete();return}if(state.phraseSuggestOpen&&list.length&&e.key==='Enter'&&!e.shiftKey){e.preventDefault();applyPhrase(list[state.phraseSuggestIndex]||list[0]);refreshComposerOnly(true);return}if(e.key==='Escape'&&state.phraseSuggestOpen){state.phraseSuggestOpen=false;refreshPhraseAutocomplete();return}if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();e.currentTarget.form.requestSubmit()}};}
async function loadDrawerOrders(force=false){
  if(!state.chatCrm?.id)return state.drawerOrders;
  if(state.drawerOrdersPromise)return state.drawerOrdersPromise;
  if(state.drawerOrdersLoaded&&!force)return state.drawerOrders;
  state.drawerOrdersLoading=true;state.drawerOrdersError='';
  const orderMount=document.querySelector('[data-orders-loading-state]');if(orderMount)orderMount.textContent='Обновляю заказы…';
  const peer=state.selectedDialog?.peerId,customerId=state.chatCrm.id;
  const p=BSAPI.orders(customerId,{fresh:force,limit:20}).then(d=>{if(state.selectedDialog?.peerId===peer&&String(state.chatCrm?.id)===String(customerId)){state.drawerOrders=d.orders||[];state.drawerOrdersLoaded=true;state.drawerOrdersError=''}return state.drawerOrders}).catch(e=>{state.drawerOrdersError=e.message||'Не удалось загрузить заказы';return state.drawerOrders}).finally(()=>{if(state.drawerOrdersPromise===p)state.drawerOrdersPromise=null;state.drawerOrdersLoading=false;if(state.selectedDialog?.peerId===peer&&!chatComposerFocused())renderChatKeepScroll()});
  state.drawerOrdersPromise=p;return p;
}
async function saveDraft(e){e.preventDefault();const p=Object.fromEntries(new FormData(e.currentTarget).entries());setLoading(true);try{const r=await BSAPI.createClient(p);const c=r.client;if(!c?.id)throw new Error('BlueSales не вернул ID клиента');state.chatCrm=c;state.selectedDialog.crm={clientId:c.id,crmStatus:c.crmStatus,crmStatusColor:c.crmStatusColor,manager:c.manager,managerColor:c.managerColor,tags:c.tags};state.clientDraft=null;state.clientsLoaded=false;state.remindersLoaded=false;state.metaLoaded=false;state.drawerOrdersLoaded=false;toast(r.created===false?'Карточка уже существовала':'Карточка сохранена в BlueSales','ok');renderChat(false)}catch(x){toast(x.message,'error')}finally{setLoading(false)}}
async function saveDrawerClient(e){e.preventDefault();const p=Object.fromEntries(new FormData(e.currentTarget).entries());track('client-save',{clientId:state.chatCrm?.id||null});setLoading(true);try{const before=state.chatCrm||{},r=await BSAPI.updateClient(before.id,p);const optimistic={...before,...p};const mu=(state.meta.users||[]).find(u=>u.login===p.managerLogin);if(mu){optimistic.manager=mu.name||mu.login;optimistic.managerLogin=mu.login;optimistic.managerColor=mu.color||optimistic.managerColor}state.chatCrm=mergeClientForEdit(optimistic,r.client||{});state.clientEditSnapshot=null;state.drawerEdit=false;state.clientsLoaded=false;state.remindersLoaded=false;toast('Сохранено','ok');renderChatKeepScroll()}catch(x){toast(x.message,'error')}finally{setLoading(false)}}
async function saveReminderDate(e){e.preventDefault();const p=Object.fromEntries(new FormData(e.currentTarget).entries());setLoading(true);try{const r=await BSAPI.updateClient(state.chatCrm.id,p);state.chatCrm=r.client;state.remindersLoaded=false;toast('Дата напоминания сохранена','ok');renderChat(false)}catch(x){toast(x.message,'error')}finally{setLoading(false)}}
async function removeReminder(id){setLoading(true);try{await BSAPI.deleteReminder(id);state.remindersLoaded=false;await ensureReminders(true);render();toast('Напоминание убрано','ok')}catch(e){toast(e.message,'error')}finally{setLoading(false)}}
function fileToBase64(file){return new Promise((ok,bad)=>{const r=new FileReader();r.onload=()=>ok(String(r.result||'').split(',').pop()||'');r.onerror=bad;r.readAsDataURL(file)})}
async function uploadFile(file,type){if(!file)return;if(file.size>30*1024*1024)return toast('Файл больше 30 МБ','error');setLoading(true);try{track('upload-start',{type,size:file.size,name:file.name||''});toast('Загружаю вложение в VK…');const dataBase64=await fileToBase64(file),u=await BSAPI.uploadVkMedia({peerId:state.selectedDialog.peerId,type,filename:file.name||`${type}`,mimeType:file.type||'',dataBase64});if(u.attachment&&!state.messageAttachments.includes(u.attachment))state.messageAttachments.push(u.attachment);track('upload-ready',{type,attachment:Boolean(u.attachment)});toast(type==='audio_message'?'Голосовое добавлено к сообщению':'Вложение добавлено к сообщению','ok');refreshComposerOnly(false)}catch(e){track('upload-error',{type,error:e.code||e.message});toast(e.message,'error')}finally{setLoading(false)}}
async function sendMessage(e){e.preventDefault();const i=document.getElementById('messageInput'),text=(i?.value||state.messageDraft).trim(),atts=[...state.messageAttachments],replyTo=Number(state.replyTarget?.id||0);if(!text&&!atts.length)return;track('send-message',{peerId:state.selectedDialog?.peerId||null,textLength:text.length,attachments:atts.length,replyTo:replyTo||null});setLoading(true);try{await BSAPI.sendVkMessage(state.selectedDialog.peerId,{message:text,attachment:atts.join(','),replyTo});state.messageDraft='';state.messageAttachments=[];state.replyTarget=null;state.phraseSuggestOpen=false;if(i)i.value='';const d=await BSAPI.vkMessages(state.selectedDialog.peerId,{count:100,offset:0,includeCrm:false});state.messages=d.messages||[];renderChat(true)}catch(x){toast(x.message,'error')}finally{setLoading(false)}}
function clientFiltersHtml(){const statuses=state.meta.statuses||[],users=state.meta.users||[],tags=state.meta.tags||[];return`<div class="bs-classic-filters"><label>Менеджер<select id="managerFilter"><option value="">Все менеджеры</option>${users.map(u=>`<option value="${esc(u.login||u.name)}" ${state.manager===(u.login||u.name)?'selected':''}>${esc(u.name||u.login)}</option>`).join('')}</select></label><label>CRM-статус<select id="statusFilter"><option value="">Любой</option>${statuses.map(v=>`<option value="${esc(v)}" ${state.status===v?'selected':''}>${esc(v)}</option>`).join('')}</select></label><label>Тэг<select id="clientTagFilter"><option value="">Нет данных / все</option>${tags.map(t=>{const n=t?.name||t;return`<option value="${esc(n)}" ${state.clientTag===n?'selected':''}>${esc(n)}</option>`}).join('')}</select></label></div>`}
function clientsView(){return`<div class="bs-page-title"><b>КЛИЕНТЫ</b><span>${state.clients.length}${state.hasMore?' +':''}</span>${shareButton('#/clients')}</div><div class="bs-search-compact"><span>${I.search}</span><input id="searchInput" value="${esc(state.q)}" placeholder="ФИО, VK ID, телефон, e-mail, тег"></div><div class="search-query-indicator" id="clientSearchState">${state.q?`Поиск: «${esc(state.q)}» • найдено ${state.clients.length}`:''}</div>${activeFilterSummary('clients')}${clientFiltersHtml()}<div class="bs-compact-list">${state.clients.length?state.clients.map(clientRow).join(''):'<div class="empty">Клиенты не найдены</div>'}</div>${state.hasMore?'<button class="bs-refresh-link" data-action="more-clients">Показать ещё</button>':''}`}
function clientRow(c){return`<div class="bs-compact-client" data-client-dialog="${esc(c.id)}" data-vk-id="${esc(c.social?.vkId||'')}" role="button" tabindex="0"><div class="bs-compact-client-main"><b>${esc(c.fullName)}</b><div>${statusHtml(c.crmStatus,c.crmStatusColor)}</div><div class="tags">${tagHtml(c.tags)}</div>${managerHtml(c.manager,c.managerColor)}</div><div class="bs-compact-client-side"><time>${esc(fmtDate(c.nextContactDate))}</time><span>${c.social?.vkId?'Открыть диалог ›':'Нет VK ID'}</span><button type="button" class="row-link-btn" data-copy-route="#/client/${esc(c.id)}">🔗</button></div></div>`}
function filteredReminderItems(items=[]){const q=state.reminderSearch;return(items||[]).filter(r=>textMatchesQuery(`${r.fullName||''} ${r.vkId||''} ${r.crmStatus||''} ${r.manager||''} ${(r.tags||[]).map(t=>t?.name||t).join(' ')}`,q))}
function activeFilterSummary(kind){const a=[];if(kind==='dialogs'){if(state.dialogFilter&&state.dialogFilter!=='all')a.push(state.dialogFilter==='unanswered'?'Неотвеченные':state.dialogFilter==='unread'?'Непрочитанные':state.dialogFilter);if(state.dialogManager)a.push(`Менеджер: ${state.dialogManager}`);if(state.dialogStatus)a.push(`Статус: ${state.dialogStatus}`)}if(kind==='clients'){if(state.manager)a.push(`Менеджер: ${state.manager}`);if(state.status)a.push(`Статус: ${state.status}`);if(state.clientTag)a.push(`Тег: ${state.clientTag}`)}if(kind==='reminders'){const labels={today:'Сегодня',tomorrow:'Завтра',future:'Будущие',overdue:'Просроченные'};a.push(labels[state.reminderTab]||state.reminderTab);if(state.reminderManager)a.push(`Менеджер: ${state.reminderManager}`);if(state.reminderStatus)a.push(`Статус: ${state.reminderStatus}`);if(state.reminderTag)a.push(`Тег: ${state.reminderTag}`)}return a.length?`<div class="active-filter-summary">${a.map(x=>`<span>${esc(x)}</span>`).join('')}</div>`:''}
function remindersView(){const counts=Object.fromEntries(Object.entries(state.reminders).map(([k,v])=>[k,(v||[]).length])),users=state.meta.users||[],statuses=state.meta.statuses||[],tags=state.meta.tags||[],items=filteredReminderItems(state.reminders[state.reminderTab]||[]);return`<div class="bs-page-title"><b>НАПОМИНАНИЯ</b>${shareButton('#/reminders')}</div><div class="bs-search-compact"><span>${I.search}</span><input id="reminderSearchInput" value="${esc(state.reminderSearch)}" placeholder="ФИО, VK ID, статус, менеджер, тег"></div>${activeFilterSummary('reminders')}<div class="bs-reminder-tabs">${[['today','Сегодня'],['tomorrow','Завтра'],['future','Будущие'],['overdue','Просроченные']].map(([id,l])=>`<button data-reminder-tab="${id}" class="${state.reminderTab===id?'active':''}">${l} <b>(${counts[id]||0})</b></button>`).join('')}</div><div class="bs-filter-caption">фильтры</div><div class="bs-classic-filters"><label>Менеджер<select id="reminderManagerFilter"><option value="">Все менеджеры</option>${users.map(u=>`<option value="${esc(u.login||u.name)}" ${(state.reminderManager===(u.login||u.name)||state.reminderManager===u.name)?'selected':''}>${esc(u.name||u.login)}</option>`).join('')}</select></label><label>CRM-статус<select id="reminderStatusFilter"><option value="">Любой</option>${statuses.map(v=>`<option value="${esc(v)}" ${state.reminderStatus===v?'selected':''}>${esc(v)}</option>`).join('')}</select></label><label>Тэг<select id="reminderTagFilter"><option value="">Нет данных / все</option>${tags.map(t=>{const n=t?.name||t;return`<option value="${esc(n)}" ${state.reminderTag===n?'selected':''}>${esc(n)}</option>`}).join('')}</select></label></div><div class="bs-reminder-list">${items.length?items.map(reminderRow).join(''):'<div class="empty">Нет напоминаний по выбранным фильтрам</div>'}</div><button class="bs-refresh-link" data-action="refresh">Обновить</button>`}
function reminderRow(r){return`<div class="bs-reminder-line" role="button" tabindex="0" data-reminder-client="${esc(r.id)}" data-vk-id="${esc(r.vkId||'')}"><div><b>${esc(r.fullName)}</b>${statusHtml(r.crmStatus,r.crmStatusColor)}<div class="tags">${tagHtml(r.tags)}</div>${managerHtml(r.manager,r.managerColor)}</div><div class="bs-reminder-line-side"><time>${esc(fmtDate(r.nextContactDate))}</time><span>${r.vkId?'Открыть диалог ›':'Нет VK ID'}</span><div class="reminder-actions"><button type="button" class="row-link-btn" data-copy-route="#/client/${esc(r.id)}">🔗</button><button type="button" class="reminder-remove" data-remove-reminder="${esc(r.id)}" title="Убрать напоминание">×</button></div></div></div>`}
function roleLabel(role=''){return role==='creator_admin'?'Создатель + администратор':role==='admin'?'Администратор':'Менеджер'}
function statusLabel(st=''){return st==='blocked'?'Заблокирован':'Активен'}
async function ensureAdmin(force=false){if(!isAdmin())return;if(state.adminLoaded&&!force)return;const [o,p]=await Promise.all([BSAPI.adminOverview(),BSAPI.adminPhrases()]);state.adminOverview=o;state.adminUsers=o.users||[];state.adminPhraseGroups=p.groups||[];state.adminLoaded=true}
function adminView(){if(!isAdmin())return'<div class="empty">Раздел доступен только администраторам BlueSales.</div>';const users=state.adminUsers||[],groups=state.adminPhraseGroups||[];return`<div class="section-head"><div><h2>Администрирование</h2><p>Скрипты и пользователи мобильной CRM</p></div><div class="section-tools">${shareButton('#/admin')}<button class="mini-refresh" data-admin-refresh>${I.refresh}</button></div></div><div class="admin-tabs"><button data-admin-section="phrases" class="${state.adminSection==='phrases'?'active':''}">Быстрые фразы</button><button data-admin-section="users" class="${state.adminSection==='users'?'active':''}">Пользователи</button></div>${state.adminSection==='users'?adminUsersView(users):adminPhrasesView(groups)}`}
function adminPhrasesView(groups){
  const q=state.adminQuery,groupNames=(groups||[]).map(g=>g.name);
  const rows=(groups||[]).flatMap(g=>(g.phrases||[]).map((p,index)=>({...p,groupName:g.name,groupIndex:index}))).filter(p=>textMatchesQuery(`${p.groupName} ${p.name} ${p.text}`,q));
  return`<div class="admin-toolbar"><div class="search-row"><span>${I.search}</span><input id="adminPhraseSearch" value="${esc(state.adminQuery)}" placeholder="Название или текст фразы"></div><button class="primary admin-new" data-admin-new-phrase>＋ Добавить</button></div>${state.adminPhraseEdit?adminPhraseEditor(state.adminPhraseEdit,groups):''}<div class="admin-phrase-list">${rows.length?rows.map(p=>`<article class="admin-phrase-card" draggable="true" data-phrase-card="${esc(p.id)}" data-phrase-group="${esc(p.groupName)}"><div class="admin-phrase-top"><button type="button" class="phrase-drag-handle" data-phrase-move-toggle="${esc(p.id)}" title="Переместить скрипт">☰</button><div><small>${esc(p.groupName)}</small><b>${esc(p.name)}</b></div><button data-admin-edit-phrase="${esc(p.id)}">✎</button></div>${state.adminPhraseMove===String(p.id)?`<div class="phrase-move-panel"><select data-move-group="${esc(p.id)}">${groupNames.map(g=>`<option value="${esc(g)}" ${g===p.groupName?'selected':''}>${esc(g)}</option>`).join('')}</select><button type="button" data-move-first="${esc(p.id)}" title="В начало раздела">⇈</button><button type="button" data-move-up="${esc(p.id)}" title="Выше">↑</button><button type="button" data-move-down="${esc(p.id)}" title="Ниже">↓</button><button type="button" data-move-last="${esc(p.id)}" title="В конец раздела">⇊</button></div>`:''}<p>${esc(String(p.text||'').replace(/\s+/g,' ').slice(0,180))}</p><div class="admin-phrase-meta">${p.hotkey?`<span>⌨ ${esc(p.hotkey)}</span>`:''}${(p.attachments||[]).length?`<span>📎 ${(p.attachments||[]).length}</span>`:''}${(p.managers||[]).length?`<span>👤 ${(p.managers||[]).length}</span>`:'<span>👤 Все</span>'}</div></article>`).join(''):'<div class="empty">Фразы не найдены</div>'}</div>`}

function adminPhraseEditor(p,groups){const users=state.adminUsers||[],isNew=!p.id,managerSet=new Set(p.managers||[]);return`<form id="adminPhraseForm" class="admin-editor"><div class="admin-editor-head"><b>${isNew?'Новая быстрая фраза':'Редактирование фразы'}</b><button type="button" data-admin-cancel-phrase>×</button></div>${isNew?`<label>Раздел<input name="groupName" list="phraseGroupsList" value="${esc(p.groupName||'')}" required><datalist id="phraseGroupsList">${(groups||[]).map(g=>`<option value="${esc(g.name)}">`).join('')}</datalist></label>`:`<label>Раздел<div class="admin-group-locked"><b>${esc(p.groupName||'Без раздела')}</b><small>Редактирование не перемещает скрипт. Для переноса используйте ☰ в списке.</small></div><input type="hidden" name="groupName" value="${esc(p.groupName||'')}"></label>`}<label>Название<input name="name" value="${esc(p.name||'')}" required></label><label class="admin-text-label">Текст<textarea name="text" rows="16" placeholder="Текст скрипта…">${esc(p.text||'')}</textarea></label><label>Горячая клавиша<input name="hotkey" value="${esc(p.hotkey||'')}"></label><fieldset><legend>Менеджеры <small>пусто = доступ всем</small></legend><div class="admin-manager-grid">${users.map(u=>`<label class="admin-check"><input type="checkbox" name="managers" value="${esc(u.name||u.login)}" ${managerSet.has(u.name)||managerSet.has(u.login)?'checked':''}><i style="--uc:${managerColor(u.name||u.login,u.color)}"></i><span>${esc(u.name||u.login)}</span></label>`).join('')}</div></fieldset><label>Вложения <small>VK attachment ID по одному на строку; можно также вставить [photo...], [video...], [audio_message...], [doc...] прямо в текст — они будут извлечены автоматически</small><textarea name="attachments" rows="3">${esc((p.attachments||[]).join('\n'))}</textarea></label><div class="admin-editor-actions"><button type="button" class="secondary" data-admin-cancel-phrase>Отмена</button>${!isNew?'<button type="button" class="danger admin-delete" data-admin-delete-phrase>Удалить</button>':''}<button class="primary">Сохранить</button></div></form>`}
function adminUsersView(users){return`<div class="admin-users-list">${users.map(u=>`<article class="admin-user-card" data-admin-user="${esc(u.login||u.id||u.name)}"><div class="admin-user-head"><i style="--uc:${managerColor(u.name||u.login,u.color)}"></i><div><b>${esc(u.name||u.login)}</b><small>${esc(u.login||u.email||'')}</small></div><span class="user-status ${u.status==='blocked'?'blocked':'active'}">${statusLabel(u.status)}</span></div><div class="admin-user-info"><span>${roleLabel(u.role)}</span><span>${(u.sections||[]).length} разделов</span><span>${esc(u.color||'цвет не задан')}</span></div><div class="admin-user-actions"><button data-admin-edit-user="${esc(u.login||u.id||u.name)}">Настроить</button>${u.blueSalesEditUrl?`<a href="${esc(u.blueSalesEditUrl)}" target="_blank" rel="noopener">BlueSales ↗</a>`:''}</div>${state.adminUserEdit&&(String(state.adminUserEdit.login||state.adminUserEdit.id||state.adminUserEdit.name)===String(u.login||u.id||u.name))?adminUserEditor(u):''}</article>`).join('')}</div>`}
function adminUserEditor(u){const sections=state.adminOverview?.sections||[];return`<form class="admin-user-editor" id="adminUserForm"><label>Роль<select name="role"><option value="manager" ${u.role==='manager'?'selected':''}>Менеджер</option><option value="admin" ${u.role==='admin'?'selected':''}>Администратор</option><option value="creator_admin" ${u.role==='creator_admin'?'selected':''}>Создатель + администратор</option></select></label><label>Статус<select name="status"><option value="active" ${u.status!=='blocked'?'selected':''}>Активен</option><option value="blocked" ${u.status==='blocked'?'selected':''}>Заблокирован</option></select></label><label>Цвет менеджера<div class="color-row"><input type="color" name="colorPicker" value="${esc(managerColor(u.name||u.login,u.color))}"><input name="color" value="${esc(u.color||managerColor(u.name||u.login,u.color))}" pattern="#[0-9A-Fa-f]{6}"></div></label><fieldset><legend>Доступ к разделам</legend><div class="admin-sections">${sections.map(x=>`<label><input type="checkbox" name="sections" value="${esc(x)}" ${(u.sections||[]).includes(x)?'checked':''}>${esc(x)}</label>`).join('')}</div></fieldset><p class="admin-local-note">Публичный BlueSales API умеет только читать users.get. Эти поля управляют мобильной копией прав/цветов; реальные права BlueSales меняются по ссылке BlueSales выше.</p><div class="admin-editor-actions"><button type="button" class="secondary" data-admin-cancel-user>Отмена</button><button class="primary">Сохранить</button></div></form>`}
async function bindAdmin(){
  document.querySelectorAll('[data-admin-section]').forEach(b=>b.onclick=()=>{state.adminSection=b.dataset.adminSection;state.adminPhraseEdit=null;state.adminUserEdit=null;state.adminPhraseMove=null;render()});
  const rr=document.querySelector('[data-admin-refresh]');if(rr)rr.onclick=async()=>{setLoading(true);try{await ensureAdmin(true);render();toast('Админ-данные обновлены','ok')}catch(e){toast(e.message,'error')}finally{setLoading(false)}};
  const q=document.getElementById('adminPhraseSearch');if(q){let qt;q.setAttribute('dir','ltr');q.oninput=()=>{state.adminQuery=q.value;clearTimeout(qt);qt=setTimeout(()=>{render();requestAnimationFrame(()=>{const n=document.getElementById('adminPhraseSearch');if(n){n.focus();n.setSelectionRange(n.value.length,n.value.length)}})},250)}};
  const np=document.querySelector('[data-admin-new-phrase]');if(np)np.onclick=()=>{state.adminPhraseMove=null;state.adminPhraseEdit={id:'',groupName:'',name:'',text:'',hotkey:'',managers:[],attachments:[]};render()};
  document.querySelectorAll('[data-admin-edit-phrase]').forEach(b=>b.onclick=()=>{const id=b.dataset.adminEditPhrase;for(const g of state.adminPhraseGroups){const p=(g.phrases||[]).find(x=>String(x.id)===String(id));if(p){state.adminPhraseEdit={...p,groupName:g.name};state.adminPhraseMove=null;break}}render()});
  document.querySelectorAll('[data-admin-cancel-phrase]').forEach(b=>b.onclick=()=>{state.adminPhraseEdit=null;render()});
  const pf=document.getElementById('adminPhraseForm');
  if(pf)pf.onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.currentTarget),payload={groupName:fd.get('groupName'),name:fd.get('name'),text:fd.get('text'),hotkey:fd.get('hotkey'),managers:fd.getAll('managers'),attachments:String(fd.get('attachments')||'').split(/[\n,]+/).map(x=>x.trim()).filter(Boolean)};setLoading(true);try{if(state.adminPhraseEdit?.id)await BSAPI.updateAdminPhrase(state.adminPhraseEdit.id,payload);else await BSAPI.createAdminPhrase(payload);state.adminPhraseEdit=null;state.phraseLoaded=false;await ensureAdmin(true);render();toast('Фраза сохранена на прежнем месте','ok')}catch(x){toast(x.message,'error')}finally{setLoading(false)}};
  const dp=document.querySelector('[data-admin-delete-phrase]');if(dp)dp.onclick=async()=>{if(!state.adminPhraseEdit?.id||!confirm('Удалить быструю фразу?'))return;setLoading(true);try{await BSAPI.deleteAdminPhrase(state.adminPhraseEdit.id);state.adminPhraseEdit=null;state.phraseLoaded=false;await ensureAdmin(true);render();toast('Фраза удалена','ok')}catch(x){toast(x.message,'error')}finally{setLoading(false)}};

  const movePhrase=async(id,payload)=>{setLoading(true);try{await BSAPI.moveAdminPhrase(id,payload);state.phraseLoaded=false;state.adminPhraseMove=null;await ensureAdmin(true);render();toast('Скрипт перемещён','ok')}catch(x){toast(x.message,'error')}finally{setLoading(false)}};
  document.querySelectorAll('[data-phrase-move-toggle]').forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();const id=String(b.dataset.phraseMoveToggle);state.adminPhraseMove=state.adminPhraseMove===id?null:id;render()});
  document.querySelectorAll('[data-move-group]').forEach(sel=>sel.onchange=()=>movePhrase(sel.dataset.moveGroup,{groupName:sel.value,position:'end'}));
  const locate=id=>{for(const g of state.adminPhraseGroups){const index=(g.phrases||[]).findIndex(p=>String(p.id)===String(id));if(index>=0)return{g,index}}return null};
  document.querySelectorAll('[data-move-first]').forEach(b=>b.onclick=()=>{const x=locate(b.dataset.moveFirst);if(x)movePhrase(b.dataset.moveFirst,{groupName:x.g.name,index:0})});
  document.querySelectorAll('[data-move-last]').forEach(b=>b.onclick=()=>{const x=locate(b.dataset.moveLast);if(x)movePhrase(b.dataset.moveLast,{groupName:x.g.name,position:'end'})});
  document.querySelectorAll('[data-move-up]').forEach(b=>b.onclick=()=>{const x=locate(b.dataset.moveUp);if(x)movePhrase(b.dataset.moveUp,{groupName:x.g.name,index:Math.max(0,x.index-1)})});
  document.querySelectorAll('[data-move-down]').forEach(b=>b.onclick=()=>{const x=locate(b.dataset.moveDown);if(x)movePhrase(b.dataset.moveDown,{groupName:x.g.name,index:x.index+1})});

  let dragged='';
  document.querySelectorAll('[data-phrase-card]').forEach(card=>{
    card.addEventListener('dragstart',e=>{dragged=String(card.dataset.phraseCard||'');card.classList.add('dragging');if(e.dataTransfer){e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',dragged)}});
    card.addEventListener('dragend',()=>{card.classList.remove('dragging');document.querySelectorAll('.admin-phrase-card.drag-over').forEach(x=>x.classList.remove('drag-over'));dragged=''});
    card.addEventListener('dragover',e=>{if(!dragged||dragged===String(card.dataset.phraseCard))return;e.preventDefault();card.classList.add('drag-over');if(e.dataTransfer)e.dataTransfer.dropEffect='move'});
    card.addEventListener('dragleave',()=>card.classList.remove('drag-over'));
    card.addEventListener('drop',e=>{e.preventDefault();card.classList.remove('drag-over');const id=dragged||e.dataTransfer?.getData('text/plain');if(!id||id===String(card.dataset.phraseCard))return;movePhrase(id,{groupName:String(card.dataset.phraseGroup||''),beforeId:String(card.dataset.phraseCard||'')})});
  });

  document.querySelectorAll('[data-admin-edit-user]').forEach(b=>b.onclick=()=>{state.adminUserEdit=state.adminUsers.find(u=>String(u.login||u.id||u.name)===String(b.dataset.adminEditUser))||null;render()});
  const cu=document.querySelector('[data-admin-cancel-user]');if(cu)cu.onclick=()=>{state.adminUserEdit=null;render()};
  const uf=document.getElementById('adminUserForm');if(uf){const cp=uf.elements.colorPicker,ct=uf.elements.color;if(cp&&ct)cp.oninput=()=>ct.value=cp.value;uf.onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.currentTarget),key=state.adminUserEdit?.login||state.adminUserEdit?.id||state.adminUserEdit?.name,payload={role:fd.get('role'),status:fd.get('status'),color:fd.get('color'),sections:fd.getAll('sections')};setLoading(true);try{await BSAPI.updateAdminUser(key,payload);state.adminUserEdit=null;state.metaLoaded=false;await ensureAdmin(true);await ensureMeta();render();toast('Настройки пользователя сохранены','ok')}catch(x){toast(x.message,'error')}finally{setLoading(false)}}}
}
function moreView(){
  const account=esc(state.meta?.currentUser?.name||state.session?.account?.name||state.session?.login||'—');
  return`<div class="more-page">
    <div class="section-head more-page-head">
      <div><h2>Ещё</h2><p>Настройки seb_gun CRM</p></div>
    </div>

    <section class="more-settings-card" aria-label="Настройки интерфейса">
      <div class="more-theme-grid">
        <button class="more-theme-card ${state.theme==='light'?'theme-active':''}" data-set-theme="light" aria-pressed="${state.theme==='light'}">
          <span class="more-theme-icon">☀</span>
          <span class="more-theme-copy"><b>Белая тема</b><small>Светлый интерфейс</small></span>
          <span class="more-theme-check">✓</span>
        </button>
        <button class="more-theme-card ${state.theme==='dark'?'theme-active':''}" data-set-theme="dark" aria-pressed="${state.theme==='dark'}">
          <span class="more-theme-icon">☾</span>
          <span class="more-theme-copy"><b>Чёрная тема</b><small>Комфортно вечером</small></span>
          <span class="more-theme-check">✓</span>
        </button>
      </div>

      <button class="more-refresh-btn" data-action="refresh">
        <span class="more-action-icon">${I.refresh}</span>
        <span><b>Обновить данные</b><small>Перезагрузить данные CRM</small></span>
      </button>

      <div class="more-settings-footer">
        <button class="more-logout-btn" data-action="logout"><span>↪</span><b>Выйти</b></button>
      </div>
    </section>

    <section class="more-about-card" aria-label="Информация о CRM">
      <div class="more-about-icon">⚙</div>
      <div class="more-about-content">
        <div class="more-about-heading">
          <div><h3>seb_gun CRM <span>• v25.5</span></h3><p>Рабочее пространство BlueSales + VK</p></div>
          <span class="more-local-pill"><i></i> LOCAL</span>
        </div>

        <div class="more-info-row">
          <span class="more-info-symbol">S</span>
          <div><small>Аккаунт BlueSales</small><b>${account}</b></div>
        </div>

        <div class="more-info-row">
          <span class="more-info-symbol">⚡</span>
          <div><small>Быстрые фразы</small><p>Используется локальная база, импортированная из BlueSales-таблицы. Редактирование — «Админ → Быстрые фразы».</p></div>
        </div>

        <div class="more-color-row">
          <span class="more-color-swatch"></span>
          <span>Основной цвет интерфейса</span>
          <code>#046307</code>
        </div>
      </div>
    </section>
  </div>`
}
async function switchTab(id){
  const next=String(id||'dialogs');
  if(!['dialogs','clients','reminders','admin','more'].includes(next))return;
  if(next==='admin'&&!isAdmin())return toast('Нет доступа к разделу Админ','error');
  captureChatScroll();
  state.selectedDialog=null;state.messages=[];state.chatCrm=null;state.leftDrawer=false;state.rightDrawer=false;
  state.tab=next;setRoute(`#/${next}`);track('tab-switch',{tab:next});
  setLoading(true);
  try{
    if(next==='dialogs'&&!state.dialogs.length)await loadDialogs(true);
    if(next==='clients')await ensureClients(false);
    if(next==='reminders')await ensureReminders();
    if(next==='admin')await ensureAdmin();
    render()
  }catch(e){toast(e.message,'error');render()}finally{setLoading(false)}
}
function bindCommon(){document.querySelectorAll('[data-theme-toggle]').forEach(b=>b.onclick=toggleTheme);if(state.tab==='admin')bindAdmin();document.querySelectorAll('[data-set-theme]').forEach(b=>b.onclick=()=>{applyTheme(b.dataset.setTheme);render()});document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));bindDialogRows(document);bindClientRows(document);document.querySelectorAll('[data-reminder-client]').forEach(r=>{const o=()=>openClientDialog(r.dataset.reminderClient,r.dataset.vkId);r.onclick=o;r.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();o()}}});document.querySelectorAll('[data-remove-reminder]').forEach(b=>b.onclick=e=>{e.stopPropagation();removeReminder(b.dataset.removeReminder)});document.querySelectorAll('[data-route-link]').forEach(a=>a.onclick=e=>{e.stopPropagation();track('open-link',{url:a.href})});document.querySelectorAll('[data-copy-route]').forEach(b=>b.onclick=e=>{e.stopPropagation();const url=routeUrl(b.dataset.copyRoute);track('copy-link',{route:b.dataset.copyRoute,url});copyText(url)});document.querySelectorAll('[data-copy-api]').forEach(b=>b.onclick=e=>{e.stopPropagation();copyText(`${location.origin}${b.dataset.copyApi}`,'API-ссылка скопирована')});document.querySelectorAll('[data-dialog-filter]').forEach(b=>b.onclick=async()=>{state.dialogFilter=b.dataset.dialogFilter;syncListAddress();setLoading(true);try{await loadDialogs(true);render()}catch(e){toast(e.message,'error')}finally{setLoading(false)}});const reloadDialogCrmFilters=async()=>{state.dialogsLoading=true;setLoading(true);render();try{await loadDialogs(true);render()}catch(e){toast(e.message,'error')}finally{state.dialogsLoading=false;setLoading(false);render()}};const dm=document.getElementById('dialogManagerFilter');if(dm)dm.onchange=()=>{state.dialogManager=dm.value;syncListAddress();reloadDialogCrmFilters()};const ds=document.getElementById('dialogStatusFilter');if(ds)ds.onchange=()=>{state.dialogStatus=ds.value;syncListAddress();reloadDialogCrmFilters()};document.querySelectorAll('[data-reminder-tab]').forEach(b=>b.onclick=()=>{state.reminderTab=b.dataset.reminderTab;syncListAddress();render()});const rsearch=document.getElementById('reminderSearchInput');if(rsearch){rsearch.setAttribute('dir','ltr');rsearch.oninput=()=>{state.reminderSearch=rsearch.value;syncListAddress();const list=document.querySelector('.bs-reminder-list');if(list){const items=filteredReminderItems(state.reminders[state.reminderTab]||[]);list.innerHTML=items.length?items.map(reminderRow).join(''):'<div class="empty">Нет напоминаний по поиску</div>';document.querySelectorAll('[data-reminder-client]').forEach(r=>{const o=()=>openClientDialog(r.dataset.reminderClient,r.dataset.vkId);r.onclick=o});document.querySelectorAll('[data-remove-reminder]').forEach(b=>b.onclick=e=>{e.stopPropagation();removeReminder(b.dataset.removeReminder)})}}};const reloadReminderFilters=async()=>{state.remindersLoaded=false;setLoading(true);try{await ensureReminders(true);render()}catch(e){toast(e.message,'error')}finally{setLoading(false)}};const rm=document.getElementById('reminderManagerFilter');if(rm)rm.onchange=()=>{state.reminderManager=rm.value;syncListAddress();reloadReminderFilters()};const rs=document.getElementById('reminderStatusFilter');if(rs)rs.onchange=()=>{state.reminderStatus=rs.value;syncListAddress();reloadReminderFilters()};const rt=document.getElementById('reminderTagFilter');if(rt)rt.onchange=()=>{state.reminderTag=rt.value;syncListAddress();reloadReminderFilters()};const dsearch=document.getElementById('dialogSearch');if(dsearch){let t;dsearch.setAttribute('dir','ltr');dsearch.oninput=()=>{const qv=dsearch.value;state.dialogSearch=qv;syncListAddress();const info=document.getElementById('dialogSearchState');if(info)info.textContent=qv?`Ищем: «${qv}»…`:'';const seq=state._dialogSearchSeq=(state._dialogSearchSeq||0)+1;clearTimeout(t);t=setTimeout(async()=>{try{const d=await BSAPI.vkDialogs({count:50,offset:0,filter:state.dialogFilter,q:qv.trim(),includeCrm:true});if(seq!==state._dialogSearchSeq)return;state.dialogs=d.dialogs||[];state.dialogsOffset=state.dialogs.length;state.dialogsTotal=Number(d.count||state.dialogs.length);state.dialogsHasMore=!!d.hasMore;refreshDialogListOnly()}catch(e){toast(e.message,'error')}},260)}}const s=document.getElementById('searchInput');if(s){let t;s.setAttribute('dir','ltr');s.oninput=()=>{const qv=s.value;state.q=qv;syncListAddress();const info=document.getElementById('clientSearchState');if(info)info.textContent=qv?`Ищем: «${qv}»…`:'';const seq=state._clientSearchSeq=(state._clientSearchSeq||0)+1;clearTimeout(t);t=setTimeout(async()=>{try{const d=await BSAPI.clients({limit:100,offset:0,q:qv.trim(),status:state.status,manager:state.manager,tag:state.clientTag});if(seq!==state._clientSearchSeq)return;state.clients=d.clients||[];state.offset=state.clients.length;state.hasMore=!!d.hasMore;state.clientsLoaded=true;refreshClientListOnly()}catch(e){toast(e.message,'error')}},260)}}const reloadClientFilters=async()=>{state.clientsLoaded=false;setLoading(true);try{await ensureClients(true);render()}catch(e){toast(e.message,'error')}finally{setLoading(false)}};const sf=document.getElementById('statusFilter');if(sf)sf.onchange=()=>{state.status=sf.value;syncListAddress();reloadClientFilters()};const mf=document.getElementById('managerFilter');if(mf)mf.onchange=()=>{state.manager=mf.value;syncListAddress();reloadClientFilters()};const ctf=document.getElementById('clientTagFilter');if(ctf)ctf.onchange=()=>{state.clientTag=ctf.value;syncListAddress();reloadClientFilters()};document.querySelectorAll('[data-action="more-dialogs"]').forEach(b=>b.onclick=async()=>{setLoading(true);try{await loadDialogs(false);render()}finally{setLoading(false)}});document.querySelectorAll('[data-action="more-clients"]').forEach(b=>b.onclick=async()=>{state.clientsLoaded=false;await ensureClients(false);render()});document.querySelectorAll('[data-action="sync-ui"]').forEach(b=>b.onclick=syncAccountUi);const mib=document.querySelector('[data-action="import-ui"]'),mif=document.getElementById('moreBsHtmlImportInput');if(mib&&mif){mib.onclick=()=>mif.click();mif.onchange=e=>importBlueSalesHtml(e.target.files?.[0])};document.querySelectorAll('[data-action="refresh"]').forEach(b=>b.onclick=async()=>{track('refresh',{tab:state.tab});setLoading(true);try{if(state.tab==='dialogs')await loadDialogs(true);if(state.tab==='clients'){state.clientsLoaded=false;state.metaLoaded=false;await ensureClients(true)}if(state.tab==='reminders'){state.remindersLoaded=false;await ensureReminders()}render();toast('Обновлено','ok')}catch(e){toast(e.message,'error')}finally{setLoading(false)}});document.querySelectorAll('[data-action="logout"]').forEach(b=>b.onclick=async()=>{try{await BSAPI.logout()}catch{}location.reload()})}
function fatal(e){app.innerHTML=`<main class="login-page"><section class="login-card"><h1>Ошибка запуска</h1><p>${esc(e.message)}</p><button class="primary" onclick="location.reload()">Повторить</button></section></main>`}
function currentResponsiveMode(){return workspaceDesktop()?'desktop':workspaceTablet()?'tablet':'mobile'}
state._renderedLayoutMode=currentResponsiveMode();
let resizeRenderTimer=0,routeApplyTimer=0,lastHistoryHref='',lastHistoryAt=0;
function handleWindowResize(){
  syncMobileViewport();
  const next=currentResponsiveMode();
  if(!state.selectedDialog){state._renderedLayoutMode=next;return}
  if(next===state._renderedLayoutMode)return;
  if(chatComposerFocused()){state._layoutRenderPending=true;return}
  clearTimeout(resizeRenderTimer);
  resizeRenderTimer=setTimeout(()=>{if(!state.selectedDialog||chatComposerFocused())return;state._renderedLayoutMode=currentResponsiveMode();renderChatKeepScroll()},90);
}
function handleHistoryRoute(){
  const href=location.href,ts=Date.now();if(href===lastHistoryHref&&ts-lastHistoryAt<80)return;lastHistoryHref=href;lastHistoryAt=ts;
  clearTimeout(routeApplyTimer);
  routeApplyTimer=setTimeout(()=>{
    const raw=requestedRoute();
    const chatRoute=currentChatRoute();
    if(state.selectedDialog&&raw===chatRoute){
      const overlay=String(history.state?.overlay||'');
      state.leftDrawer=overlay==='phrases';
      state.rightDrawer=overlay==='crm';
      renderChatKeepScroll();
      if(state.leftDrawer)restorePhraseDrawerPosition();
      return;
    }
    applyHashRoute();
  },0);
}
window.addEventListener('resize',handleWindowResize,{passive:true});
window.addEventListener('popstate',handleHistoryRoute);
window.addEventListener('hashchange',handleHistoryRoute);
window.addEventListener('pageshow',()=>{syncMobileViewport();ensureRouteHistoryState()});
init();
})();