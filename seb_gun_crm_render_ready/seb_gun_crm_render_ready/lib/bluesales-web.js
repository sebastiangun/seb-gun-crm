'use strict';

const http = require('http');
const https = require('https');
const { URL, URLSearchParams } = require('url');

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

function decodeHtml(s=''){
  return String(s)
    .replace(/&nbsp;/gi,' ')
    .replace(/&quot;/gi,'"')
    .replace(/&#39;|&#x27;/gi,"'")
    .replace(/&lt;/gi,'<')
    .replace(/&gt;/gi,'>')
    .replace(/&amp;/gi,'&')
    .replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCharCode(parseInt(n,16)));
}

function stripHtml(html=''){
  return decodeHtml(String(html)
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<br\s*\/?\s*>/gi,'\n')
    .replace(/<[^>]+>/g,' '))
    .replace(/[ \t\r]+/g,' ')
    .replace(/\n\s+/g,'\n')
    .replace(/\s+\n/g,'\n')
    .replace(/\n{3,}/g,'\n\n')
    .trim();
}

function attrs(tag=''){
  const out={};
  const re=/([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let m;
  while((m=re.exec(tag))){
    const key=String(m[1]||'').toLowerCase();
    if(!key || key==='input' || key==='form' || key==='a' || key==='link' || key==='button') continue;
    out[key]=decodeHtml(m[2]??m[3]??m[4]??'');
  }
  return out;
}

function normalizeColor(v){
  const s=String(v||'').trim();
  if(!s) return '';
  const hex=s.match(/#([0-9a-f]{3,8})\b/i);
  if(hex) return '#'+hex[1].toUpperCase();
  const rgb=s.match(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
  if(rgb){
    const h=[rgb[1],rgb[2],rgb[3]].map(n=>Math.max(0,Math.min(255,Number(n))).toString(16).padStart(2,'0')).join('');
    return '#'+h.toUpperCase();
  }
  return '';
}

class CookieJar{
  constructor(){ this.map=new Map(); }
  add(setCookie){
    const arr=Array.isArray(setCookie)?setCookie:(setCookie?[setCookie]:[]);
    for(const line of arr){
      const first=String(line).split(';',1)[0];
      const i=first.indexOf('=');
      if(i<=0) continue;
      const k=first.slice(0,i).trim(),v=first.slice(i+1).trim();
      if(!v || /expires=thu, 01 jan 1970/i.test(String(line))) this.map.delete(k); else this.map.set(k,v);
    }
  }
  header(){ return [...this.map.entries()].map(([k,v])=>`${k}=${v}`).join('; '); }
  toJSON(){ return Object.fromEntries(this.map); }
}

function requestRaw(url, {method='GET',headers={},body=null,jar=null,timeoutMs=12000,maxRedirects=5}={}){
  return new Promise((resolve,reject)=>{
    const target=new URL(url);
    const transport=target.protocol==='https:'?https:http;
    const h={
      'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36',
      'Accept':'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
      'Accept-Encoding':'identity',
      'Connection':'close',
      ...headers
    };
    if(jar?.header()) h.Cookie=jar.header();
    let buf=null;
    if(body!=null){ buf=Buffer.isBuffer(body)?body:Buffer.from(String(body),'utf8'); h['Content-Length']=String(buf.length); }
    const req=transport.request(target,{method,headers:h},res=>{
      const chunks=[];
      res.on('data',c=>chunks.push(Buffer.from(c)));
      res.on('end',async()=>{
        jar?.add(res.headers['set-cookie']);
        const status=Number(res.statusCode||0), text=Buffer.concat(chunks).toString('utf8');
        const loc=res.headers.location;
        if(loc && [301,302,303,307,308].includes(status) && maxRedirects>0){
          const next=new URL(loc,target).href;
          const nextMethod=(status===307||status===308)?method:'GET';
          try{return resolve(await requestRaw(next,{method:nextMethod,headers: nextMethod==='GET'?{}:headers,body:nextMethod==='GET'?null:body,jar,timeoutMs,maxRedirects:maxRedirects-1}));}
          catch(e){return reject(e);}
        }
        resolve({status,headers:res.headers||{},text,url:target.href});
      });
    });
    req.setTimeout(timeoutMs,()=>req.destroy(Object.assign(new Error('timeout'),{code:'ETIMEDOUT'})));
    req.on('error',reject);
    if(buf) req.end(buf); else req.end();
  });
}

function formInfo(html, baseUrl){
  const fm=String(html).match(/<form\b([^>]*)>([\s\S]*?)<\/form>/i);
  if(!fm) return null;
  const fa=attrs('<form '+fm[1]+'>');
  const body=fm[2];
  const inputs=[];
  for(const m of body.matchAll(/<input\b([^>]*)>/gi)){
    const a=attrs('<input '+m[1]+'>');
    if(!a.name) continue;
    inputs.push({name:a.name,type:String(a.type||'text').toLowerCase(),value:a.value||'',id:a.id||'',autocomplete:a.autocomplete||''});
  }
  for(const m of body.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)){
    const a=attrs('<button '+m[1]+'>');
    if(a.name) inputs.push({name:a.name,type:'submit',value:a.value||stripHtml(m[2])||'Войти',id:a.id||''});
  }
  return {action:new URL(fa.action||baseUrl,baseUrl).href,method:String(fa.method||'post').toUpperCase(),inputs};
}

function loginFields(form){
  const visible=form.inputs.filter(x=>!['hidden','submit','button','checkbox','radio','image'].includes(x.type));
  const pass=form.inputs.find(x=>x.type==='password'||/pass|парол/i.test(`${x.name} ${x.id} ${x.autocomplete}`));
  let user=form.inputs.find(x=>x.type==='email'||/email|e-mail|login|user|логин/i.test(`${x.name} ${x.id} ${x.autocomplete}`));
  if(!user) user=visible.find(x=>x!==pass);
  return {user,pass};
}

function busySeconds(html){
  const txt=stripHtml(html);
  if(!/другой пользователь находится онлайн/i.test(txt)) return null;
  const m=txt.match(/через\s+(\d+)\s+сек/i);
  return m?Number(m[1]):15;
}

async function loginWeb({base='https://bluesales.ru',login,password,timeoutMs=12000,busyRetries=3,busyWaitMinMs=5000,busyWaitMaxMs=10000}){
  const jar=new CookieJar();
  let page=await requestRaw(new URL('/app/Login.aspx',base).href,{jar,timeoutMs});
  for(let attempt=0;attempt<=busyRetries;attempt++){
    const form=formInfo(page.text,page.url);
    if(!form) return {ok:false,code:'LOGIN_FORM_NOT_FOUND',message:'Не удалось распознать форму входа BlueSales',jar,page};
    const fields=loginFields(form);
    if(!fields.user||!fields.pass) return {ok:false,code:'LOGIN_FIELDS_NOT_FOUND',message:'Не удалось определить поля логина/пароля BlueSales',jar,page};
    const data=new URLSearchParams();
    for(const x of form.inputs){
      if(x.type==='submit') continue;
      data.set(x.name,x.value||'');
    }
    data.set(fields.user.name,login);
    data.set(fields.pass.name,password);
    const submit=form.inputs.find(x=>x.type==='submit');
    if(submit?.name) data.set(submit.name,submit.value||'Войти');
    page=await requestRaw(form.action,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Origin':new URL(base).origin,'Referer':page.url},body:data.toString(),jar,timeoutMs});
    const sec=busySeconds(page.text);
    if(sec!=null && attempt<busyRetries){ const requested=(Math.min(Math.max(sec,1),30)+1)*1000; const wait=Math.max(Number(busyWaitMinMs)||0,Math.min(requested,Number(busyWaitMaxMs)||requested)); await sleep(wait); page=await requestRaw(new URL('/app/Login.aspx',base).href,{jar,timeoutMs}); continue; }
    break;
  }
  const txt=stripHtml(page.text);
  if(/неправильн.*логин|неверн.*парол|wrong.*password/i.test(txt)) return {ok:false,code:'AUTH',message:'BlueSales web: неверный логин или пароль',jar,page};
  const sec=busySeconds(page.text);
  if(sec!=null) return {ok:false,code:'BUSY',message:`BlueSales web: аккаунт занят, повторите через ${sec} сек.`,busySeconds:sec,jar,page};
  const stillLogin=/\/app\/Login\.aspx/i.test(page.url) || /E-mail\s*\/\s*логин/i.test(txt)&&/Пароль/i.test(txt);
  if(stillLogin) return {ok:false,code:'AUTH_UNKNOWN',message:'BlueSales web не подтвердил вход',jar,page};
  return {ok:true,jar,page,base};
}

function linksFrom(html,baseUrl){
  const out=[];
  for(const m of String(html).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)){
    const a=attrs('<a '+m[1]+'>');
    if(!a.href) continue;
    try{ out.push({href:new URL(a.href,baseUrl).href,text:stripHtml(m[2])}); }catch{}
  }
  return out;
}

function pageLooksLoggedOut(page){
  const t=stripHtml(page?.text||'');
  return /\/app\/Login\.aspx/i.test(page?.url||'') || (/E-mail\s*\/\s*логин/i.test(t)&&/Пароль/i.test(t));
}

async function fetchCandidate(web,candidates){
  for(const p of candidates){
    try{
      const url=/^https?:/i.test(p)?p:new URL(p,web.base).href;
      const r=await requestRaw(url,{jar:web.jar,timeoutMs:12000});
      if(r.status>=200&&r.status<400&&!pageLooksLoggedOut(r)&&!/возникла непредвиденная ситуация/i.test(stripHtml(r.text))) return r;
    }catch{}
  }
  return null;
}

function tableRows(html){
  return [...String(html).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>{
    const row=m[1], cells=[];
    for(const c of row.matchAll(/<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi)) cells.push({html:c[2],text:stripHtml(c[2]),attrs:attrs('<td '+c[1]+'>')});
    return cells;
  }).filter(r=>r.length);
}

function splitManagers(cellHtml=''){
  const names=[];
  for(const m of String(cellHtml).matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)){
    const t=stripHtml(m[1]); if(t) names.push(t);
  }
  if(!names.length){
    const t=stripHtml(String(cellHtml).replace(/<br\s*\/?\s*>/gi,'\n'));
    for(const s of t.split(/[\n,;]+/)){ const v=s.trim(); if(v) names.push(v); }
  }
  return [...new Set(names)];
}

function phraseHeaderIndex(text=''){
  const t=String(text||'').toLowerCase().replace(/ё/g,'е');
  if(/назван.*фраз/.test(t)) return 'name';
  if(/текст.*фраз/.test(t)) return 'text';
  if(/горяч/.test(t)) return 'hotkey';
  if(/менедж/.test(t)) return 'managers';
  return '';
}

function parseQuickPhrases(html){
  const rows=tableRows(html);
  let headerMap=null, headerIdx=-1;
  // BlueSales can have leading action/drag columns and multi-level headers.
  // Search the first row that actually contains BOTH phrase name and phrase text.
  for(let i=0;i<rows.length;i++){
    const map={};
    rows[i].forEach((c,idx)=>{const k=phraseHeaderIndex(c.text);if(k)map[k]=idx;});
    if(Number.isInteger(map.name)&&Number.isInteger(map.text)){headerMap=map;headerIdx=i;break;}
  }

  const groups=[]; let current=null, seq=0;
  const dataRows=headerIdx>=0?rows.slice(headerIdx+1):rows;
  const nameI=headerMap?.name ?? -1, textI=headerMap?.text ?? -1;
  const hotI=headerMap?.hotkey ?? -1, mgrI=headerMap?.managers ?? -1;

  function meaningful(cells){
    return cells.map((c,i)=>({i,text:String(c.text||'').trim(),html:c.html})).filter(x=>x.text && !/^[-–—\s]+$/.test(x.text));
  }
  function ensureGroup(name='Быстрые фразы'){
    if(!current){ current={id:`bs-group-${++seq}`,name,phrases:[]}; groups.push(current); }
    return current;
  }

  for(const cells of dataRows){
    if(!cells.length) continue;
    const vals=cells.map(c=>String(c.text||'').trim());
    let name=nameI>=0?vals[nameI]||'':'';
    let text=textI>=0?vals[textI]||'':'';
    const hotkey=hotI>=0?vals[hotI]||'':'';
    const managers=mgrI>=0&&cells[mgrI]?splitManagers(cells[mgrI].html):[];

    // If header detection failed for an exotic layout, use text-heavy cells,
    // skipping checkbox/edit/drag columns which are normally empty/icons.
    if(nameI<0||textI<0){
      const m=meaningful(cells);
      if(m.length>=2){name=m[0].text;text=m[1].text;}
      else if(m.length===1){name=m[0].text;text='';}
    }
    name=String(name||'').trim(); text=String(text||'').trim();
    if(!name && !text) continue;
    if(/назван.*фраз|текст.*фраз|горяч.*клав|менеджер/i.test(`${name} ${text}`)) continue;

    // Group rows in BlueSales are commonly a title with an empty phrase-text cell.
    // Ignore rows such as "Не отображено еще 14 фразы".
    if(/не отображено еще\s+\d+\s+фраз/i.test(name)) continue;
    const cellCountWithText=meaningful(cells).length;
    const looksGroup = Boolean(name) && !text && cellCountWithText<=2;
    if(looksGroup){
      current={id:`bs-group-${++seq}`,name,phrases:[]}; groups.push(current); continue;
    }
    if(!name && text) name=text.slice(0,80);
    if(!text) continue;
    ensureGroup();
    current.phrases.push({id:`bs-${++seq}`,name,text,hotkey,managers});
  }
  return groups.filter(g=>g.phrases.length);
}

function cssLinks(html,baseUrl){
  const out=[];
  for(const m of String(html).matchAll(/<link\b([^>]*)>/gi)){
    const a=attrs('<link '+m[1]+'>');
    if(!a.href || !/stylesheet/i.test(a.rel||'')) continue;
    try{out.push(new URL(a.href,baseUrl).href)}catch{}
  }
  return out;
}

function inlineRules(html){
  return [...String(html).matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(m=>m[1]).join('\n');
}

function cssColorForClasses(css,classes=[]){
  for(const cls of classes){
    const esc=String(cls).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const re=new RegExp(`\\.${esc}(?:[^,{]*)\\{([^}]*)\\}`,'ig');
    let m;
    while((m=re.exec(css))){
      const body=m[1];
      const bg=body.match(/(?:background-color|background)\s*:\s*([^;]+)/i);
      const fg=body.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
      const c=normalizeColor(bg?.[1]||fg?.[1]); if(c) return c;
    }
  }
  return '';
}

function elementsWithText(html,names=[]){
  const out=[];
  for(const name of names){
    const escaped=String(name).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const re=new RegExp(`<([a-z0-9]+)\\b([^>]*)>([\\s\\S]{0,800}?${escaped}[\\s\\S]{0,800}?)<\\/\\1>`,'ig');
    const m=re.exec(html);
    if(!m) continue;
    const a=attrs('<'+m[1]+' '+m[2]+'>');
    const style=a.style||'';
    const direct=normalizeColor((style.match(/(?:background-color|background|color)\s*:\s*([^;]+)/i)||[])[1]);
    const classes=String(a.class||'').split(/\s+/).filter(Boolean);
    out.push({name,direct,classes});
  }
  return out;
}

async function extractColorsFromPage(web,page,names=[]){
  let css=inlineRules(page.text);
  for(const link of cssLinks(page.text,page.url).slice(0,10)){
    try{ const r=await requestRaw(link,{jar:web.jar,timeoutMs:8000}); if(r.status===200) css+='\n'+r.text; }catch{}
  }
  const map={};
  for(const el of elementsWithText(page.text,names)){
    const c=el.direct||cssColorForClasses(css,el.classes); if(c) map[el.name]=c;
  }
  return map;
}



function balancedJsonAfter(text,startAt,openChar='{',closeChar='}'){
  const src=String(text||'');
  const begin=src.indexOf(openChar,startAt);
  if(begin<0)return '';
  let depth=0,quote='',escape=false;
  for(let i=begin;i<src.length;i++){
    const ch=src[i];
    if(quote){
      if(escape){escape=false;continue;}
      if(ch==='\\'){escape=true;continue;}
      if(ch===quote)quote='';
      continue;
    }
    if(ch==='"'||ch==="'"){quote=ch;continue;}
    if(ch===openChar)depth++;
    else if(ch===closeChar){depth--;if(depth===0)return src.slice(begin,i+1);}
  }
  return '';
}

function parseJsonish(raw){
  const s=String(raw||'').trim();
  if(!s)return null;
  try{return JSON.parse(s);}catch{}
  try{
    const jsonish=s
      .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g,'$1"$2":')
      .replace(/\bundefined\b/g,'null')
      .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g,(_,x)=>JSON.stringify(x.replace(/\\'/g,"'")));
    return JSON.parse(jsonish);
  }catch{}
  return null;
}

function parseJqueryPluginConfig(html,selectorId,pluginName){
  const src=String(html||'');
  const sid=String(selectorId||'').replace(/^#/,'');
  const escId=sid.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const escPlugin=String(pluginName||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const patterns=[
    new RegExp(`\\$\\(\\s*['"]#${escId}['"]\\s*\\)\\s*\\.${escPlugin}\\s*\\(`,'i'),
    new RegExp(`jQuery\\(\\s*['"]#${escId}['"]\\s*\\)\\s*\\.${escPlugin}\\s*\\(`,'i')
  ];
  for(const re of patterns){
    const m=re.exec(src);if(!m)continue;
    const raw=balancedJsonAfter(src,m.index+m[0].length,'{','}');
    const parsed=parseJsonish(raw);
    if(parsed&&typeof parsed==='object')return parsed;
  }
  return null;
}

function parseLoggedManager(html){
  const src=String(html||'');
  const m=/(?:var|let|const)\s+loggedManager\s*=\s*/i.exec(src);
  if(!m)return null;
  return parseJsonish(balancedJsonAfter(src,m.index+m[0].length,'{','}'));
}

function cleanOption(x){
  if(!x||typeof x!=='object')return null;
  const o={...x};
  if(o.id!=null)o.id=Number(o.id)||o.id;
  if(o.name!=null)o.name=String(o.name);
  if(o.color)o.color=normalizeColor(o.color)||String(o.color);
  if(o.textColor)o.textColor=String(o.textColor);
  return o;
}

function mapColors(options=[]){
  const out={};
  for(const x of options||[]){
    const name=String(x?.name||'').trim(),color=normalizeColor(x?.color||'');
    if(name&&color)out[name]=color;
  }
  return out;
}
function mapTextColors(options=[]){
  const out={};
  for(const x of options||[]){
    const name=String(x?.name||'').trim(),color=String(x?.textColor||'').trim();
    if(name&&color)out[name]=color;
  }
  return out;
}

function extractMessengerBootstrap(html){
  const managerCfg=parseJqueryPluginConfig(html,'selectizeManagers','tagsSelectize')||{};
  const selectedManagerCfg=parseJqueryPluginConfig(html,'selectizeDisabledLoggedManager','tagsSelectize')||{};
  const statusCfg=parseJqueryPluginConfig(html,'selectizeCrmStatuses','statusesSelectize')||{};
  const tagCfg=parseJqueryPluginConfig(html,'selectizeTags','tagsSelectize')||{};
  const managers=(managerCfg.options||selectedManagerCfg.options||[]).map(cleanOption).filter(Boolean);
  const statuses=(statusCfg.options||[]).map(cleanOption).filter(Boolean);
  const tags=(tagCfg.options||[]).map(cleanOption).filter(Boolean);
  const loggedManager=parseLoggedManager(html);
  return {
    loggedManager,
    selectedManagerId:Array.isArray(selectedManagerCfg.items)&&selectedManagerCfg.items.length?String(selectedManagerCfg.items[0]):'',
    managers,statuses,tags,
    statusColors:mapColors(statuses),
    tagColors:mapColors(tags),
    tagTextColors:mapTextColors(tags)
  };
}

function mergeMessengerBootstraps(list=[]){
  const result={loggedManager:null,selectedManagerId:'',managers:[],statuses:[],tags:[],statusColors:{},tagColors:{},tagTextColors:{}};
  const mergeOptions=(key,arr)=>{
    const map=new Map((result[key]||[]).map(x=>[String(x.id??x.name),x]));
    for(const x of arr||[])map.set(String(x.id??x.name),{...(map.get(String(x.id??x.name))||{}),...x});
    result[key]=[...map.values()];
  };
  for(const b of list||[]){
    if(!b)continue;
    if(b.loggedManager)result.loggedManager=b.loggedManager;
    if(b.selectedManagerId)result.selectedManagerId=b.selectedManagerId;
    mergeOptions('managers',b.managers);
    mergeOptions('statuses',b.statuses);
    mergeOptions('tags',b.tags);
    Object.assign(result.statusColors,b.statusColors||{});
    Object.assign(result.tagColors,b.tagColors||{});
    Object.assign(result.tagTextColors,b.tagTextColors||{});
  }
  return result;
}

function normalizeIdentity(s=''){
  return String(s||'').toLowerCase()
    .replace(/^\s*\d+(?:\.\d+)?\s+/,'')
    .replace(/[^a-zа-яё0-9@.]+/gi,' ')
    .replace(/\s+/g,' ')
    .trim();
}

function phraseAllowed(p,currentUser,login,{allowWildcard=true}={}){
  const mgrs=Array.isArray(p.managers)?p.managers:[];
  if(!mgrs.length)return true; // empty Managers in BlueSales means not restricted
  const candidates=[login,currentUser?.login,currentUser?.name,currentUser?.fullName,currentUser?.id]
    .map(normalizeIdentity).filter(Boolean);
  return mgrs.some(m=>{
    const raw=String(m||'').trim();
    if(raw==='*')return allowWildcard;
    const x=normalizeIdentity(raw);if(!x)return false;
    return candidates.some(c=>x===c||x.includes(c)||c.includes(x));
  });
}

function filterPhraseGroups(groups,currentUser,login,opts={}){
  return (groups||[])
    .map(g=>({...g,phrases:(g.phrases||[]).filter(p=>phraseAllowed(p,currentUser,login,opts))}))
    .filter(g=>g.phrases.length);
}

function parseImportedHtml(html,{currentUser=null,login=''}={}){
  const messenger=extractMessengerBootstrap(html);
  const phraseGroups=parseQuickPhrases(html);
  return {
    messenger,
    phrases:filterPhraseGroups(phraseGroups,currentUser,login),
    phraseCount:filterPhraseGroups(phraseGroups,currentUser,login).reduce((n,g)=>n+(g.phrases||[]).length,0)
  };
}

async function bootstrap({
  base='https://bluesales.ru',login,password,currentUser=null,statusNames=[],managerNames=[],
  busyRetries=3,busyWaitMinMs=5000,busyWaitMaxMs=10000
}){
  const web=await loginWeb({
    base,login,password,timeoutMs:20000,busyRetries,busyWaitMinMs,busyWaitMaxMs
  });
  if(!web.ok)return {ok:false,code:web.code,message:web.message,source:'bluesales-web'};

  // Messenger is the best bootstrap page: real BlueSales injects current
  // manager, managers, CRM status dictionary and tags into jQuery selectize
  // configs. Fetch it explicitly before generic page discovery.
  const messengerPage=await fetchCandidate(web,['/app/Messenger/','/app/Messenger.aspx']);
  const homeCandidates=[web.page.url,'/app/','/app/Customers/','/app/Customers.aspx'];
  const pages=[];
  if(messengerPage)pages.push(messengerPage);
  for(const c of homeCandidates){
    const pg=await fetchCandidate(web,[c]);
    if(pg&&!pages.some(x=>x.url===pg.url))pages.push(pg);
  }

  const links=pages.flatMap(pg=>linksFrom(pg.text,pg.url));
  const phraseLinks=links
    .filter(x=>/быстр.*фраз|шаблон.*сообщ/i.test(x.text)||/quick.*phrase|phrase/i.test(x.href))
    .map(x=>x.href);
  const statusLinks=links.filter(x=>/статус.*crm|crm.*статус/i.test(x.text)||/crm.*status/i.test(x.href)).map(x=>x.href);
  const userLinks=links.filter(x=>/пользовател.*систем|менеджер/i.test(x.text)||/system.*user|users?/i.test(x.href)).map(x=>x.href);

  // This is an observed BlueSales UI route, not a documented public API.
  const phrasePage=await fetchCandidate(web,[
    ...phraseLinks,
    '/app/References/PhrasesList.aspx',
    '/app/References/Phrases.aspx',
    '/app/QuickPhrases.aspx',
    '/app/Phrases.aspx',
    '/app/Settings/QuickPhrases.aspx'
  ]);
  const statusPage=await fetchCandidate(web,[...statusLinks,'/app/CrmStatuses.aspx','/app/CRMStatuses.aspx','/app/Dictionaries/CrmStatuses.aspx','/app/Settings/CrmStatuses.aspx']);
  const userPage=await fetchCandidate(web,[...userLinks,'/app/Users.aspx','/app/SystemUsers.aspx','/app/Settings/Users.aspx']);

  const phraseGroups=phrasePage?parseQuickPhrases(phrasePage.text):[];
  const phrases=filterPhraseGroups(phraseGroups,currentUser,login);

  const bootstrapData=mergeMessengerBootstraps(
    [...pages,statusPage,userPage].filter(Boolean).map(pg=>extractMessengerBootstrap(pg.text))
  );

  // Manager background colors are not present in the Messenger bootstrap config.
  // If they appear as CSS/inline styles on a reachable page, capture them.
  const managerColors={};
  const colorPages=[...pages,statusPage,userPage,phrasePage].filter(Boolean);
  const effectiveManagerNames=[
    ...managerNames,
    ...(bootstrapData.managers||[]).map(x=>x.name).filter(Boolean)
  ];
  for(const pg of colorPages){
    try{Object.assign(managerColors,await extractColorsFromPage(web,pg,effectiveManagerNames));}catch{}
  }

  const textAll=[...pages,phrasePage,statusPage,userPage].filter(Boolean).map(pg=>stripHtml(pg.text)).join('\n');
  const linkText=links.map(x=>`${x.text} ${x.href}`).join('\n');
  const visible=`${textAll}\n${linkText}`;
  const capabilities={
    source:'bluesales-visible-navigation',
    quickPhrases:Boolean(phrasePage),
    customers:/клиент|customer/i.test(visible),
    orders:/заказ|order/i.test(visible),
    reminders:/напомин|reminder/i.test(visible),
    reports:/отч[её]т|report/i.test(visible),
    mailings:/рассыл|mailing/i.test(visible),
    bots:/бот|bot/i.test(visible),
    services:/услуг|service|goods/i.test(visible),
    settings:/настрой|setting/i.test(visible),
    users:/пользовател.*систем|users?/i.test(visible)
  };

  return {
    ok:true,
    source:'bluesales-web',
    phrases,
    phraseCount:phrases.reduce((n,g)=>n+(g.phrases||[]).length,0),
    statusColors:bootstrapData.statusColors,
    tagColors:bootstrapData.tagColors,
    tagTextColors:bootstrapData.tagTextColors,
    managerColors,
    managers:bootstrapData.managers,
    statuses:bootstrapData.statuses,
    tags:bootstrapData.tags,
    loggedManager:bootstrapData.loggedManager,
    selectedManagerId:bootstrapData.selectedManagerId,
    capabilities,
    discovered:{
      messengerUrl:messengerPage?.url||null,
      phraseUrl:phrasePage?.url||null,
      statusUrl:statusPage?.url||null,
      userUrl:userPage?.url||null
    },
    cookieCount:Object.keys(web.jar.toJSON()).length
  };
}

module.exports={
  bootstrap,normalizeColor,filterPhraseGroups,parseQuickPhrases,loginWeb,stripHtml,
  parseJqueryPluginConfig,extractMessengerBootstrap,parseImportedHtml
};
