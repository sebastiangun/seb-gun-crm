'use strict';
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {isDeepStrictEqual:equal}=require('util');
const clone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
const arr=x=>Array.isArray(x)?x:[];
const obj=x=>x&&typeof x==='object'&&!Array.isArray(x);
const text=x=>String(x??'');
const num=x=>Number.isFinite(Number(x))?Number(x):0;
function safeJsonParse(v,fallback=null){try{return JSON.parse(String(v||''))}catch{return fallback}}
function json(v){return JSON.stringify(v??null)}
function mergeJournalLoose(current,next){
  if(!current)return clone(next);
  const newer=num(next.updatedAt)>=num(current.updatedAt)?next:current,out={...current,...next};
  const uniq=(a,b)=>[...arr(a),...arr(b).filter(x=>!arr(a).some(y=>equal(x,y)))];
  out.managerHistory=uniq(current.managerHistory,next.managerHistory);out.statusHistory=uniq(current.statusHistory,next.statusHistory);out.incomingTexts=uniq(current.incomingTexts,next.incomingTexts);
  out.recordedAt=Math.min(...[num(current.recordedAt),num(next.recordedAt)].filter(Boolean))||Date.now();out.updatedAt=Math.max(num(current.updatedAt),num(next.updatedAt),Date.now());
  out.answeredAt=Math.min(...[num(current.answeredAt),num(next.answeredAt)].filter(Boolean))||0;if(out.answeredAt)out.status='answered';
  out.currentManager=text(newer.currentManager||newer.manager||out.currentManager||out.manager);out.manager=out.currentManager||text(out.manager);
  out.currentCrmStatus=text(newer.currentCrmStatus||newer.crmStatus||out.currentCrmStatus||out.crmStatus);out.crmStatus=out.currentCrmStatus||text(out.crmStatus);
  out.responseText=text(next.responseText||current.responseText);out.responseAuthor=text(next.responseAuthor||current.responseAuthor);out.responseMessageId=text(next.responseMessageId||current.responseMessageId);return out;
}

const SHEETS={
  Leads:['lead_id','peer_id','client_name','manager','crm_status','received_at','answered_at','waiting','sla_warning','sla_violation','working_minutes','response_minutes','responsible_manager','manager_history','status_history','snippet','work_days','work_start','work_end','sla_minutes','violation_minutes','timezone','deleted','updated_at','payload_json'],
  LeadEvents:['event_id','event_type','lead_id','peer_id','client_name','manager','crm_status','event_at','details_json','dedupe_key','created_at'],
  Notifications:['notification_id','event_type','peer_id','client_name','lead_manager','crm_status','recipient_manager','telegram_status','telegram_error','browser_status','browser_error','overall_status','historical','filter_snapshot','created_at','updated_at','payload_json'],
  Outbox:['request_id','peer_id','peer_name','manager','snippet','status','attempts','error','created_at','updated_at','stuck_at','alerted','alerted_at','payload_json'],
  SLASettings:['setting_id','manager','manager_filters','statuses','work_days','work_start','work_end','sla_minutes','violation_minutes','timezone','enabled','updated_at','payload_json'],
  NotificationRules:['rule_id','recipient_manager','manager_filters','statuses','work_days','work_start','work_end','dialog_filter','sla_minutes','violation_minutes','warning_alerts','violation_alerts','outbox_alerts','telegram_chat_id','browser_enabled','enabled','updated_at','payload_json'],
  Managers:['manager_id','login','name','active','color','updated_at','payload_json'],
  Statuses:['status_id','name','active','color','updated_at','payload_json'],
  Users:['login','name','role','is_admin','active','telegram_chat_id','browser_notifications','updated_at','payload_json'],
  Bootstrap:['key','status','offset','processed','total','errors','retry_at','last_peer_id','updated_at','completed_at','payload_json'],
  Runtime:['key','value','updated_at','description']
};

function leadToRow(x){return {lead_id:text(x.id),peer_id:num(x.peerId),client_name:text(x.name),manager:text(x.currentManager||x.manager),crm_status:text(x.currentCrmStatus||x.crmStatus),received_at:num(x.receivedAt),answered_at:num(x.answeredAt),waiting:!num(x.answeredAt),sla_warning:Boolean(x.notified),sla_violation:Boolean(x.violated),working_minutes:num(x.workingResponseMinutes),response_minutes:num(x.responseMinutes),responsible_manager:text(x.responsibleManager||x.currentManager||x.manager),manager_history:json(arr(x.managerHistory)),status_history:json(arr(x.statusHistory)),snippet:text(x.snippet),work_days:json(arr(x.workDays)),work_start:text(x.workStart),work_end:text(x.workEnd),sla_minutes:num(x.slaMinutes),violation_minutes:num(x.violationMinutes),timezone:text(x.timezone),deleted:Boolean(x.deleted),updated_at:num(x.updatedAt)||Date.now(),payload_json:json(x)}}
function rowToLead(r){const p=safeJsonParse(r.payload_json,{})||{};return {...p,id:text(r.lead_id||p.id),peerId:num(r.peer_id||p.peerId),name:text(r.client_name||p.name),manager:text(r.manager||p.manager),currentManager:text(r.manager||p.currentManager||p.manager),crmStatus:text(r.crm_status||p.crmStatus),currentCrmStatus:text(r.crm_status||p.currentCrmStatus||p.crmStatus),receivedAt:num(r.received_at||p.receivedAt),answeredAt:num(r.answered_at||p.answeredAt),managerHistory:safeJsonParse(r.manager_history,p.managerHistory)||[],statusHistory:safeJsonParse(r.status_history,p.statusHistory)||[],workDays:safeJsonParse(r.work_days,p.workDays)||[],snippet:text(r.snippet||p.snippet),workStart:text(r.work_start||p.workStart),workEnd:text(r.work_end||p.workEnd),slaMinutes:num(r.sla_minutes||p.slaMinutes),violationMinutes:num(r.violation_minutes||p.violationMinutes),timezone:text(r.timezone||p.timezone),updatedAt:num(r.updated_at||p.updatedAt)}}
function notificationToRow(x){const c=x.channels||{};return {notification_id:text(x.id),event_type:text(x.eventType),peer_id:num(x.peerId),client_name:text(x.clientName),lead_manager:text(x.leadManager),crm_status:text(x.crmStatus),recipient_manager:text(x.recipientManager),telegram_status:text(c.telegram?.status),telegram_error:text(c.telegram?.error),browser_status:text(c.browser?.status),browser_error:text(c.browser?.error),overall_status:text(x.overallStatus),historical:Boolean(x.historical),filter_snapshot:json(x.filterSnapshot||null),created_at:num(x.createdAt),updated_at:num(x.updatedAt)||Date.now(),payload_json:json(x)}}
function rowToNotification(r){const p=safeJsonParse(r.payload_json,{})||{};return {...p,id:text(r.notification_id||p.id),eventType:text(r.event_type||p.eventType),peerId:num(r.peer_id||p.peerId),clientName:text(r.client_name||p.clientName),leadManager:text(r.lead_manager||p.leadManager),crmStatus:text(r.crm_status||p.crmStatus),recipientManager:text(r.recipient_manager||p.recipientManager),overallStatus:text(r.overall_status||p.overallStatus),historical:String(r.historical)==='true'||r.historical===true,createdAt:num(r.created_at||p.createdAt),updatedAt:num(r.updated_at||p.updatedAt),channels:p.channels||{telegram:{status:text(r.telegram_status),error:text(r.telegram_error)},browser:{status:text(r.browser_status),error:text(r.browser_error)}},filterSnapshot:safeJsonParse(r.filter_snapshot,p.filterSnapshot)}}
function outboxToRow(x){return {request_id:text(x.requestId),peer_id:num(x.peerId),peer_name:text(x.peerName),manager:text(x.manager),snippet:text(x.snippet),status:text(x.status),attempts:num(x.attempts),error:text(x.error),created_at:num(x.createdAt),updated_at:num(x.updatedAt)||Date.now(),stuck_at:num(x.stuckAt),alerted:Boolean(x.alerted),alerted_at:num(x.alertedAt),payload_json:json(x)}}
function rowToOutbox(r){const p=safeJsonParse(r.payload_json,{})||{};return {...p,requestId:text(r.request_id||p.requestId),peerId:num(r.peer_id||p.peerId),peerName:text(r.peer_name||p.peerName),manager:text(r.manager||p.manager),snippet:text(r.snippet||p.snippet),status:text(r.status||p.status),attempts:num(r.attempts||p.attempts),error:text(r.error||p.error),createdAt:num(r.created_at||p.createdAt),updatedAt:num(r.updated_at||p.updatedAt),stuckAt:num(r.stuck_at||p.stuckAt),alerted:String(r.alerted)==='true'||r.alerted===true,alertedAt:num(r.alerted_at||p.alertedAt)}}
function ruleToRow(x){return {rule_id:text(x.id||x.manager),recipient_manager:text(x.manager),manager_filters:json(arr(x.managerFilters)),statuses:json(arr(x.statuses)),work_days:json(arr(x.workDays)),work_start:text(x.workStart),work_end:text(x.workEnd),dialog_filter:text(x.dialogFilter),sla_minutes:num(x.slaMinutes),violation_minutes:num(x.violationMinutes),warning_alerts:Boolean(x.warningAlerts),violation_alerts:Boolean(x.violationAlerts),outbox_alerts:Boolean(x.outboxAlerts),telegram_chat_id:text(x.telegramChatId),browser_enabled:Boolean(x.browserEnabled!==false),enabled:Boolean(x.enabled!==false),updated_at:Date.now(),payload_json:json(x)}}
function rowToRule(r){const p=safeJsonParse(r.payload_json,{})||{};return {...p,id:text(r.rule_id||p.id),manager:text(r.recipient_manager||p.manager),managerFilters:safeJsonParse(r.manager_filters,p.managerFilters)||[],statuses:safeJsonParse(r.statuses,p.statuses)||[],workDays:safeJsonParse(r.work_days,p.workDays)||[],workStart:text(r.work_start||p.workStart),workEnd:text(r.work_end||p.workEnd),dialogFilter:text(r.dialog_filter||p.dialogFilter),slaMinutes:num(r.sla_minutes||p.slaMinutes),violationMinutes:num(r.violation_minutes||p.violationMinutes),warningAlerts:String(r.warning_alerts)==='true'||r.warning_alerts===true,violationAlerts:String(r.violation_alerts)==='true'||r.violation_alerts===true,outboxAlerts:String(r.outbox_alerts)==='true'||r.outbox_alerts===true,telegramChatId:text(r.telegram_chat_id||p.telegramChatId),enabled:String(r.enabled)!=='false'}}

class Storage{
  constructor(root){
    this.root=root;
    this.webappUrl=String(process.env.GOOGLE_SHEETS_WEBAPP_URL||'').trim();
    this.apiSecret=String(process.env.GOOGLE_SHEETS_API_SECRET||'').trim();
    this.sheetId=String(process.env.GOOGLE_SPREADSHEET_ID||'').trim();
    this.enabled=Boolean(this.webappUrl&&this.apiSecret&&this.sheetId);
    this.rows=new Map();this.documents=new Map();this.bases=new WeakMap();this.loadedSections=new WeakMap();this.createClaims=new Set();this.lastSyncAt=0;this.refreshPromise=null;
  }
  async init(){
    if(!this.enabled){if(process.env.REQUIRE_GOOGLE_STORAGE==='1')throw new Error('Google Apps Script storage is not configured: set GOOGLE_SHEETS_WEBAPP_URL, GOOGLE_SHEETS_API_SECRET and GOOGLE_SPREADSHEET_ID');return;}
    const h=await this.call('health',{});if(!h?.ok)throw new Error(h?.error||'Google Apps Script health failed');
    await this.call('setup',{schema:SHEETS});
    await this.refreshAll();
  }
  async call(action,payload={},timeoutMs=30000){
    if(!this.enabled)throw Object.assign(new Error('Google Apps Script storage is disabled'),{status:503,code:'GOOGLE_SHEETS_DISABLED'});
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.max(3000,Number(timeoutMs)||30000));
    try{
      const r=await fetch(this.webappUrl,{method:'POST',redirect:'follow',headers:{'Content-Type':'text/plain;charset=utf-8','Cache-Control':'no-store'},body:JSON.stringify({secret:this.apiSecret,action,spreadsheetId:this.sheetId,...payload}),signal:controller.signal});
      const raw=await r.text();let j={};try{j=JSON.parse(raw)}catch{throw new Error(`Google Apps Script returned non-JSON (${r.status}): ${raw.slice(0,180)}`)}
      if(!r.ok||j?.ok===false)throw Object.assign(new Error(j?.error||`Google Apps Script HTTP ${r.status}`),{status:r.status===429?503:(r.status||503),code:'GOOGLE_SHEETS_WEBAPP'});
      return j;
    }catch(err){if(err?.name==='AbortError')throw Object.assign(new Error('Google Apps Script timeout'),{status:504,code:'GOOGLE_SHEETS_TIMEOUT'});throw err}
    finally{clearTimeout(timer)}
  }
  col(n){let s='';for(let x=n;x>0;x=Math.floor((x-1)/26))s=String.fromCharCode(65+(x-1)%26)+s;return s;}
  keyFor(name,o){return ({Leads:o.lead_id,LeadEvents:o.event_id,Notifications:o.notification_id,Outbox:o.request_id,SLASettings:o.setting_id,NotificationRules:o.rule_id,Managers:o.manager_id||o.login,Statuses:o.status_id||o.name,Users:o.login,Bootstrap:o.key,Runtime:o.key})[name]||'';}
  normalizeRows(name,list=[]){const headers=SHEETS[name]||[];const m=new Map();for(const src of list||[]){const o={};for(const h of headers)o[h]=src?.[h]??'';const key=this.keyFor(name,o);if(key)m.set(String(key),{data:o});}this.rows.set(name,m);return m;}
  async readSheet(name){const j=await this.call('read',{sheet:name});return this.normalizeRows(name,j.rows||[]);}
  async refreshAll(){
    if(this.refreshPromise)return this.refreshPromise;
    this.refreshPromise=(async()=>{
      try{
        const names=Object.keys(SHEETS),j=await this.call('readMany',{sheets:names},45000);
        if(j?.sheets){for(const name of names)this.normalizeRows(name,j.sheets[name]||[])}
        else for(const name of names)await this.readSheet(name);
        this.rebuildDocuments();this.lastSyncAt=Date.now();return true;
      }finally{this.refreshPromise=null}
    })();return this.refreshPromise;
  }
  async refreshAllIfStale(maxAgeMs=120000){if(!this.lastSyncAt||Date.now()-this.lastSyncAt>Math.max(30000,Number(maxAgeMs)||120000))await this.refreshAll();return true;}
  rebuildDocuments(){this.documents=new Map();for(const {data} of this.rows.get('Runtime')?.values()||[]){if(String(data.key).startsWith('doc:'))this.documents.set(String(data.key).slice(4),safeJsonParse(data.value,null));}}
  async refreshDocuments(){await this.readSheet('Runtime');this.rebuildDocuments();return new Map(this.documents)}
  async run(fn){await this.refreshAllIfStale().catch(()=>{});return fn()}
  readDocument(file){const key=path.relative(path.join(this.root,'data'),file).split(path.sep).join('/');const v=this.documents.get(key);if(v!==undefined)return clone(v);try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{return undefined}}
  async writeDocument(file,value){const key=path.relative(path.join(this.root,'data'),file).split(path.sep).join('/');this.documents.set(key,clone(value));await this.upsert('Runtime',{key:'doc:'+key,value:json(value),updated_at:Date.now(),description:'CRM document'});}
  async applyPhraseUpdate(){return}
  serializeRow(name,o){const headers=SHEETS[name]||[];const out={};for(const h of headers){const v=o?.[h];out[h]=v===undefined?'':(typeof v==='object'?json(v):v)}return out;}
  async upsertMany(name,objects=[]){
    const headers=SHEETS[name];if(!headers)throw new Error(`Unknown storage sheet: ${name}`);
    const unique=new Map();for(const o of objects||[]){const k=String(this.keyFor(name,o)||'');if(k)unique.set(k,this.serializeRow(name,o));}
    const entries=[...unique.entries()];if(!entries.length)return {written:0};
    let written=0;for(let i=0;i<entries.length;i+=100){const chunk=entries.slice(i,i+100),rows=chunk.map(([,o])=>o);await this.call('upsertMany',{sheet:name,keyField:this.keyField(name),headers,rows},45000);const m=this.rows.get(name)||new Map();for(const [k,o] of chunk)m.set(k,{data:{...o}});this.rows.set(name,m);written+=chunk.length;}
    if(name==='Runtime')this.rebuildDocuments();return {written};
  }
  keyField(name){return ({Leads:'lead_id',LeadEvents:'event_id',Notifications:'notification_id',Outbox:'request_id',SLASettings:'setting_id',NotificationRules:'rule_id',Managers:'manager_id',Statuses:'status_id',Users:'login',Bootstrap:'key',Runtime:'key'})[name]||'';}
  async upsert(name,o){return this.upsertMany(name,[o])}
  async remove(name,key){const k=String(key||'');if(!k)return false;const m=this.rows.get(name)||new Map();if(!m.has(k))return false;const j=await this.call('delete',{sheet:name,keyField:this.keyField(name),value:k});if(j.deleted){m.delete(k);this.rows.set(name,m);if(name==='Runtime')this.rebuildDocuments();return true}return false;}
  sectionRows(section){if(section==='journal')return Object.fromEntries([...(this.rows.get('Leads')||new Map()).entries()].map(([k,x])=>[k,rowToLead(x.data)]));if(section==='rules')return [...(this.rows.get('NotificationRules')||new Map()).values()].map(x=>rowToRule(x.data));if(section==='outbox')return Object.fromEntries([...(this.rows.get('Outbox')||new Map()).entries()].map(([k,x])=>[k,rowToOutbox(x.data)]));if(section==='deliveryLog')return Object.fromEntries([...(this.rows.get('Notifications')||new Map()).entries()].map(([k,x])=>[k,rowToNotification(x.data)]));const prefix=section+':';const out={};for(const [k,x] of this.rows.get('Runtime')||[]){if(k.startsWith(prefix))out[k.slice(prefix.length)]=safeJsonParse(x.data.value,x.data.value)}return out;}
  async readNotifications(defaults,only=null){const chosen=new Set(only?arr(only):['journal','rules','outbox','pairCodes','notified','deletedJournal','deliveryLog']),store=clone(defaults);for(const s of chosen)store[s]=this.sectionRows(s);this.loadedSections.set(store,chosen);this.bases.set(store,clone(store));if(chosen.has('journal')&&chosen.has('deletedJournal'))for(const k of Object.keys(store.deletedJournal||{}))delete store.journal[k];return store;}
  trackNotifications(raw,hydrated){this.bases.set(hydrated,this.bases.get(raw));this.loadedSections.set(hydrated,this.loadedSections.get(raw));return hydrated;}
  async writeNotifications(store){const base=this.bases.get(store)||{},chosen=this.loadedSections.get(store)||new Set(['journal','rules','outbox','pairCodes','notified','deletedJournal','deliveryLog']),groups={Leads:[],NotificationRules:[],Outbox:[],Notifications:[],Runtime:[]};for(const s of chosen){if(s==='journal'){for(const [k,v] of Object.entries(store.journal||{}))if(!equal(base.journal?.[k],v))groups.Leads.push(leadToRow(v));}else if(s==='rules'){for(const r of arr(store.rules))groups.NotificationRules.push(ruleToRow(r));}else if(s==='outbox'){for(const [k,v] of Object.entries(store.outbox||{}))if(!equal(base.outbox?.[k],v))groups.Outbox.push(outboxToRow(v));}else if(s==='deliveryLog'){for(const [k,v] of Object.entries(store.deliveryLog||{}))if(!equal(base.deliveryLog?.[k],v))groups.Notifications.push(notificationToRow(v));}else{for(const [k,v] of Object.entries(store[s]||{}))if(!equal(base[s]?.[k],v))groups.Runtime.push({key:`${s}:${k}`,value:json(v),updated_at:Date.now(),description:s});}}for(const [name,rows] of Object.entries(groups))if(rows.length)await this.upsertMany(name,rows);this.bases.set(store,clone(store));}
  async readLeadJournalByPeer(peerId){return [...(this.rows.get('Leads')||new Map()).entries()].map(([id,x])=>({id,payload:rowToLead(x.data)})).filter(x=>Number(x.payload.peerId)===Number(peerId)&&!this.sectionRows('deletedJournal')[x.id]);}
  async readDeletedJournalIdsByPeer(peerId){const p=`lead-${Math.trunc(num(peerId))}-`;return Object.keys(this.sectionRows('deletedJournal')).filter(x=>x.startsWith(p));}
  async upsertLeadJournalBatch(rows=[]){let written=0;const leads=[],events=[];for(const r of rows){const id=String(r?.id||'');if(!id)continue;const cur=(this.rows.get('Leads')||new Map()).get(id),value=mergeJournalLoose(cur?rowToLead(cur.data):null,r);leads.push(leadToRow(value));const eid=crypto.randomUUID(),dedupe=`lead:${id}:${num(value.updatedAt)||Date.now()}`;const duplicate=[...(this.rows.get('LeadEvents')||new Map()).values()].some(x=>x.data.dedupe_key===dedupe);if(!duplicate)events.push({event_id:eid,event_type:cur?'incremental_update':'incremental_create',lead_id:id,peer_id:num(value.peerId),client_name:text(value.name),manager:text(value.currentManager||value.manager),crm_status:text(value.currentCrmStatus||value.crmStatus),event_at:num(value.updatedAt)||Date.now(),details_json:json({after:value}),dedupe_key:dedupe,created_at:Date.now()});written++;}if(leads.length)await this.upsertMany('Leads',leads);if(events.length)await this.upsertMany('LeadEvents',events);return {written};}
  async appendEvent(e){const id=e.event_id||crypto.randomUUID(),dedupe=e.dedupe_key||id,exists=[...(this.rows.get('LeadEvents')||new Map()).values()].some(x=>x.data.dedupe_key===dedupe);if(exists)return false;await this.upsert('LeadEvents',{event_id:id,...e,dedupe_key:dedupe,created_at:Date.now()});return true;}
  async scanLeadJournal(fn,{batchSize=750}={}){const rows=[...(this.rows.get('Leads')||new Map()).entries()].map(([id,x])=>({id,payload:rowToLead(x.data)})).filter(x=>!this.sectionRows('deletedJournal')[x.id]);for(let i=0;i<rows.length;i+=batchSize)await fn(rows.slice(i,i+batchSize));return {rows:rows.length,batches:Math.ceil(rows.length/batchSize)}}
  async readLeadJournalRecent(limit=2000){return [...(this.rows.get('Leads')||new Map()).entries()].map(([id,x])=>({id,payload:rowToLead(x.data)})).filter(x=>!this.sectionRows('deletedJournal')[x.id]).sort((a,b)=>num(b.payload.receivedAt)-num(a.payload.receivedAt)).slice(0,limit)}
  async readLeadJournalPageAfterId(cursor='',limit=50){return [...(this.rows.get('Leads')||new Map()).entries()].sort((a,b)=>a[0].localeCompare(b[0])).filter(([id])=>id>cursor).slice(0,limit).map(([id,x])=>({id,payload:rowToLead(x.data)}))}
  async countLeadJournal(){return (await this.readLeadJournalRecent(1000000)).length}
  async markLeadJournalDeleted(id,at=Date.now()){if(!(this.rows.get('Leads')||new Map()).has(String(id)))return false;await this.upsert('Runtime',{key:`deletedJournal:${id}`,value:json(at),updated_at:Date.now(),description:'deleted lead'});return true}
  async restoreLeadJournal(id){return this.remove('Runtime',`deletedJournal:${id}`)}
  async readDeletedJournalIds(){return Object.keys(this.sectionRows('deletedJournal'))}
  async markLeadJournalAnswered(peerId,answeredAt,details={}){const rows=(await this.readLeadJournalByPeer(peerId)).filter(x=>!num(x.payload.answeredAt)&&num(answeredAt)>num(x.payload.receivedAt)),updates=[];for(const x of rows){x.payload.status='answered';x.payload.answeredAt=num(answeredAt);x.payload.responseText=text(details.responseText);x.payload.responseAuthor=text(details.responseAuthor);x.payload.responseMessageId=text(details.responseMessageId);x.payload.updatedAt=Date.now();updates.push(leadToRow(x.payload));}if(updates.length)await this.upsertMany('Leads',updates);return rows.length}
  async getNotificationHistoryRows({names=[],admin=false,limit=1500}={}){const allowed=new Set(arr(names).map(x=>text(x).toLowerCase()));return [...(this.rows.get('Notifications')||new Map()).values()].map(x=>rowToNotification(x.data)).filter(x=>admin||allowed.has(text(x.recipientManager).toLowerCase())).sort((a,b)=>num(b.createdAt)-num(a.createdAt)).slice(0,limit)}
  async getNotificationHistorySummary({names=[],admin=false}={}){const rows=await this.getNotificationHistoryRows({names,admin,limit:1000000}),o={total:rows.length,actual:0,historical:0,sent:0,partial:0,pending:0,failed:0};for(const r of rows){if(r.historical||r.overallStatus==='historical')o.historical++;else o.actual++;if(r.overallStatus==='sent')o.sent++;else if(r.overallStatus==='partial')o.partial++;else if(r.overallStatus==='pending')o.pending++;else if(!r.historical)o.failed++;}return o}
  async getNotificationHistoryById(id){const x=(this.rows.get('Notifications')||new Map()).get(String(id));return x?rowToNotification(x.data):null}
  async upsertNotificationHistoryRows(rows=[],{ignoreExisting=false}={}){const toWrite=[];for(const r of rows){if(ignoreExisting&&(this.rows.get('Notifications')||new Map()).has(String(r.id)))continue;toWrite.push(notificationToRow(r));}if(toWrite.length)await this.upsertMany('Notifications',toWrite);return {inserted:toWrite.length,ids:toWrite.map(x=>String(x.notification_id))}}
  async getBrowserPendingNotifications({names=[],admin=false,limit=30}={}){return (await this.getNotificationHistoryRows({names,admin,limit:1000000})).filter(x=>x.channels?.browser?.status==='pending').sort((a,b)=>num(a.createdAt)-num(b.createdAt)).slice(0,limit)}
  async expireStaleBrowserPending(cutoff=Date.now()-30*60*1000,limit=200){const rows=(await this.getNotificationHistoryRows({admin:true,limit:1000000})).filter(x=>x.channels?.browser?.status==='pending'&&num(x.createdAt)<cutoff).slice(0,limit),updates=[];for(const r of rows){r.channels.browser={...(r.channels.browser||{}),status:'missed',at:Date.now(),error:'Браузер не забрал уведомление в течение 30 минут'};r.updatedAt=Date.now();r.overallStatus='failed';updates.push(notificationToRow(r));}if(updates.length)await this.upsertMany('Notifications',updates);return rows.length}
  async pruneNotificationHistory(cutoff){const rows=(await this.getNotificationHistoryRows({admin:true,limit:1000000})).filter(x=>!x.historical&&num(x.createdAt)<cutoff);for(const r of rows)await this.remove('Notifications',r.id);return rows.length}
  async readOutboxRows(limit=1000){return [...(this.rows.get('Outbox')||new Map()).values()].map(x=>rowToOutbox(x.data)).filter(x=>['queued','sending','error'].includes(x.status)).sort((a,b)=>num(a.createdAt)-num(b.createdAt)).slice(0,limit)}
  async readOutboxBackfillRows(limit=5000){return (await this.readOutboxRows(limit)).filter(x=>['queued','error'].includes(x.status))}
  sessionKey(id){return crypto.createHash('sha256').update(String(id)).digest('hex')}
  async saveSession(id,sealed,expires){await this.upsert('Runtime',{key:`session:${this.sessionKey(id)}`,value:json({sealed,expires}),updated_at:Date.now(),description:'session'})}
  async loadSession(id){const x=(this.rows.get('Runtime')||new Map()).get(`session:${this.sessionKey(id)}`);if(!x)return null;const v=safeJsonParse(x.data.value,{});return num(v.expires)>Date.now()?v.sealed:null}
  async deleteSession(id){return this.remove('Runtime',`session:${this.sessionKey(id)}`)}
  async claimCreate(key){const k=`create:${key}`;if((this.rows.get('Runtime')||new Map()).has(k)||this.createClaims.has(k))return false;this.createClaims.add(k);await this.upsert('Runtime',{key:k,value:json({state:'pending'}),updated_at:Date.now(),description:'create guard'});return true}
  async confirmCreate(key,id){await this.upsert('Runtime',{key:`create:${key}`,value:json({state:'confirmed',clientId:String(id)}),updated_at:Date.now(),description:'create guard'})}
  async observeClients(){return}
  poolStats(){return {provider:'google-apps-script',cachedSheets:this.rows.size,lastSyncAt:this.lastSyncAt,webappConfigured:Boolean(this.webappUrl)}}
  async health(){const started=Date.now();if(!this.enabled)return {mode:'google-apps-script',ready:false,configured:false};const j=await this.call('health',{});return {mode:'google-apps-script',ready:Boolean(j.ok),latencyMs:Date.now()-started,spreadsheetId:this.sheetId,cache:this.poolStats()}}
  async close(){return}
}
module.exports={Storage,mergeJournalLoose,SHEETS};
