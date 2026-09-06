'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { isDeepStrictEqual: equal } = require('util');
const { AsyncLocalStorage } = require('async_hooks');
const clone = x => x === undefined ? undefined : JSON.parse(JSON.stringify(x));
const sections = { journal:'lead_journal', rules:'sla_settings', outbox:'notification_deliveries', pairCodes:'notification_state', notified:'notification_state', deletedJournal:'notification_state', deliveryLog:'notification_history' };
const object = x => x && typeof x === 'object' && !Array.isArray(x);
const allSections = Object.keys(sections);
function conflict() { return Object.assign(new Error('Данные изменились в другом запросе. Обновите раздел и повторите действие.'), {status:409,code:'STORAGE_CONFLICT'}); }
// Three-way merge: disjoint changes survive concurrent writes; conflicting scalar
// changes fail visibly, never silently overwrite another manager's work.
function merge(base, next, current, key='') {
  if(equal(base,next)) return clone(current);
  if(equal(base,current)||equal(next,current)) return clone(next);
  if(['managerHistory','statusHistory','incomingTexts'].includes(key) && Array.isArray(next) && Array.isArray(current)) {
    return [...current,...next.filter(x=>!current.some(y=>equal(x,y)))];
  }
  if(key==='updatedAt') return Math.max(Number(next)||0,Number(current)||0);
  if(object(next)&&object(current)&&(object(base)||base===undefined)) {
    const out={}; for(const k of new Set([...Object.keys(base||{}),...Object.keys(next),...Object.keys(current)])) {
      const v=merge(base?.[k],next[k],current[k],k); if(v!==undefined)out[k]=v;
    } return out;
  }
  throw conflict();
}
function uniqArray(current=[], next=[]) { return [...current,...next.filter(x=>!current.some(y=>equal(x,y)))]; }
function positiveMin(a,b){a=Number(a)||0;b=Number(b)||0;if(!a)return b;if(!b)return a;return Math.min(a,b)}
function mergeJournalLoose(current,next){
  if(!current)return clone(next);
  const currentUpdated=Number(current.updatedAt||0),nextUpdated=Number(next.updatedAt||0),newer=nextUpdated>=currentUpdated?next:current;
  const out={...current,...next};
  out.managerHistory=uniqArray(current.managerHistory||[],next.managerHistory||[]);
  out.statusHistory=uniqArray(current.statusHistory||[],next.statusHistory||[]);
  out.incomingTexts=uniqArray(current.incomingTexts||[],next.incomingTexts||[]);
  out.recordedAt=positiveMin(current.recordedAt,next.recordedAt)||Date.now();
  out.updatedAt=Math.max(currentUpdated,nextUpdated,Date.now());
  out.answeredAt=positiveMin(current.answeredAt,next.answeredAt);
  if(out.answeredAt)out.status='answered';
  out.currentManager=String(newer.currentManager||newer.manager||out.currentManager||out.manager||'');
  out.manager=out.currentManager||String(out.manager||'');
  out.currentCrmStatus=String(newer.currentCrmStatus||newer.crmStatus||out.currentCrmStatus||out.crmStatus||'');
  out.crmStatus=out.currentCrmStatus||String(out.crmStatus||'');
  out.responseText=String(next.responseText||current.responseText||'');
  out.responseAuthor=String(next.responseAuthor||current.responseAuthor||'');
  out.responseMessageId=String(next.responseMessageId||current.responseMessageId||'');
  return out;
}
function selectedSections(value){
  if(!value)return new Set(allSections);
  const input=value instanceof Set?[...value]:(Array.isArray(value)?value:[value]);
  return new Set(input.filter(x=>Object.prototype.hasOwnProperty.call(sections,x)));
}
function numericJsonExpr(field){return `CASE WHEN payload->>'${field}' ~ '^[0-9]+$' THEN (payload->>'${field}')::bigint ELSE 0 END`}
function deliveryOverall(row={}){const values=Object.values(row.channels||{}).map(x=>String(x?.status||''));if(values.includes('sent'))return values.every(x=>x==='sent'||x==='not_requested')?'sent':'partial';if(values.includes('pending'))return'pending';if(values.includes('failed')||values.includes('missed')||values.includes('blocked'))return'failed';return'not_sent'}
class Storage {
  constructor(root, options={}) {
    this.root=root;this.enabled=Boolean(process.env.DATABASE_URL||options.pool);this.pool=options.pool;this.context=new AsyncLocalStorage();this.documents=new Map();this.bases=new WeakMap();this.loadedSections=new WeakMap();this.createClaims=new Set();this.documentsLoadedAt=0;
  }
  async init() {
    if(!this.enabled) { if(process.env.REQUIRE_DATABASE==='1')throw new Error('DATABASE_URL обязателен');return; }
    if(!this.pool) {
      const {Pool}=require('pg');
      this.pool=new Pool({connectionString:process.env.DATABASE_URL,max:5,connectionTimeoutMillis:5000,idleTimeoutMillis:30000,statement_timeout:10000,
        ...(process.env.PG_SSL==='1'?{ssl:{rejectUnauthorized:true,...(process.env.PG_SSL_CA?{ca:process.env.PG_SSL_CA}:{})}}:{})});
      this.pool.on('error',()=>console.error('[database] idle connection unavailable'));
    }
    await this.transaction(async c=>{await c.query("SELECT pg_advisory_xact_lock(2816001)");await c.query(fs.readFileSync(path.join(this.root,'db/001-storage.sql'),'utf8'));});
    if(process.env.DB_IMPORT_ON_START==='1')await this.importDirectory(process.env.LEGACY_DATA_DIR||path.join(this.root,'data'));
    await this.refreshDocuments();
  }
  async transaction(fn) {
    const c=await this.pool.connect();try{await c.query('BEGIN');const result=await fn(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
  }
  async applyPhraseUpdate(){
    if(!this.enabled)return;
    const file=path.join(this.root,'data/phrase-update.json');if(!fs.existsSync(file))return;
    const patch=JSON.parse(fs.readFileSync(file,'utf8'));const marker='phrase-update:'+patch.release;
    await this.transaction(async c=>{
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['document:quick_phrases.json']);
      if((await c.query('SELECT id FROM crm_migrations WHERE id=$1',[marker])).rowCount)return;
      const found=await c.query("SELECT payload FROM app_documents WHERE key='quick_phrases.json' FOR UPDATE");
      const doc=found.rows[0]?.payload||{version:4,groups:[]};
      for(const incoming of patch.groups){let group=doc.groups.find(g=>g.id===incoming.id||g.name===incoming.name);if(!group){group={...incoming,phrases:[]};doc.groups.push(group);}
        for(const phrase of incoming.phrases){let index=group.phrases.findIndex(p=>p.id===phrase.id);if(index<0&&incoming.phrases.filter(p=>p.name===phrase.name).length===1&&group.phrases.filter(p=>p.name===phrase.name).length===1)index=group.phrases.findIndex(p=>p.name===phrase.name);if(index<0)group.phrases.push(phrase);else group.phrases[index]={...phrase,id:group.phrases[index].id};}
      }
      doc.updatedAt=new Date().toISOString();doc.source=patch.release;
      await c.query("INSERT INTO app_documents(key,payload) VALUES('quick_phrases.json',$1) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,updated_at=now()",[JSON.stringify(doc)]);
      await c.query('INSERT INTO crm_migrations(id) VALUES($1)',[marker]);
    });
    await this.refreshDocuments();
  }
  async refreshDocuments(){const {rows}=await this.pool.query('SELECT key,payload FROM app_documents');this.documents=new Map(rows.map(x=>[x.key,x.payload]));this.documentsLoadedAt=Date.now();return new Map(this.documents);}
  async refreshDocumentsIfStale(maxAgeMs=30000){if(!this.enabled)return new Map();if(!this.documentsLoadedAt||Date.now()-this.documentsLoadedAt>Math.max(1000,Number(maxAgeMs)||30000))return this.refreshDocuments();return new Map(this.documents)}
  // v28.22: API requests use the in-memory document cache. The previous implementation
  // re-read the entire app_documents table before every API request, which amplified load.
  async run(fn,{fresh=false}={}){if(!this.enabled)return fn();if(fresh)await this.refreshDocuments();const docs=new Map(this.documents);return this.context.run(docs,fn);}
  readDocument(file){const key=path.relative(path.join(this.root,'data'),file).split(path.sep).join('/');const docs=this.context.getStore()||this.documents;return clone(docs.get(key));}
  async writeDocument(file,value){
    if(!this.enabled){await fs.promises.mkdir(path.dirname(file),{recursive:true});const tmp=file+'.'+crypto.randomUUID()+'.tmp';await fs.promises.writeFile(tmp,JSON.stringify(value,null,2));await fs.promises.rename(tmp,file);return;}
    const key=path.relative(path.join(this.root,'data'),file).split(path.sep).join('/');const docs=this.context.getStore()||this.documents;const base=docs.get(key);
    const saved=await this.transaction(async c=>{await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['document:'+key]);const r=await c.query('SELECT payload FROM app_documents WHERE key=$1',[key]);const v=merge(base,value,r.rows[0]?.payload);await c.query('INSERT INTO app_documents(key,payload) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,updated_at=now()',[key,JSON.stringify(v)]);return v;});
    docs.set(key,saved);this.documents.set(key,saved);this.documentsLoadedAt=Date.now();
  }
  flatten(store, only=null){const chosen=selectedSections(only),rows=new Map();for(const [section,table]of Object.entries(sections)){if(!chosen.has(section))continue;const values=section==='rules'?Object.fromEntries((store.rules||[]).map(x=>[String(x.id||x.manager),x])):(store[section]||{});for(const [key,payload]of Object.entries(values)){const id=table==='notification_state'?section+':'+key:key;rows.set(table+'\0'+id,{table,id,payload:clone(payload)});}}return rows;}
  async readNotifications(defaults, only=null){
    if(!this.enabled){const file=path.join(this.root,'data/notification-settings.json');if(!fs.existsSync(file))return defaults;return JSON.parse(await fs.promises.readFile(file,'utf8'));}
    const chosen=selectedSections(only),store=clone(defaults);
    for(const section of chosen){if(section==='rules')store.rules=[];else store[section]={};}
    await this.transaction(async c=>{
      await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      for(const section of chosen){
        const table=sections[section];let result;
        if(table==='notification_state')result=await c.query('SELECT id,payload FROM notification_state WHERE id LIKE $1',[section+':%']);
        else result=await c.query(`SELECT id,payload FROM ${table}`);
        for(const {id,payload}of result.rows){if(table==='notification_state'){const pos=id.indexOf(':');const bucket=id.slice(0,pos);if(chosen.has(bucket))store[bucket][id.slice(pos+1)]=payload;}else if(section==='rules')store.rules.push(payload);else store[section][id]=payload;}
      }
    });
    if(chosen.has('journal')&&chosen.has('deletedJournal'))for(const id of Object.keys(store.deletedJournal||{}))delete store.journal[id];
    this.loadedSections.set(store,chosen);this.bases.set(store,this.flatten(store,chosen));return store;
  }
  trackNotifications(raw,hydrated){if(this.enabled){this.bases.set(hydrated,this.bases.get(raw));this.loadedSections.set(hydrated,this.loadedSections.get(raw)||selectedSections(null));}return hydrated;}
  async writeNotifications(store){
    if(!this.enabled)return this.writeDocument(path.join(this.root,'data/notification-settings.json'),store);
    const chosen=this.loadedSections.get(store)||selectedSections(null),base=this.bases.get(store);if(!base)throw new Error('Notification snapshot is missing');const next=this.flatten(store,chosen);
    await this.transaction(async c=>{for(const key of new Set([...base.keys(),...next.keys()])){
      const old=base.get(key),row=next.get(key);if(equal(old?.payload,row?.payload))continue;
      const {table,id}=row||old;const result=await c.query(`SELECT payload FROM ${table} WHERE id=$1 FOR UPDATE`,[id]);const current=result.rows[0]?.payload;
      // Journal deletions are tombstones. Keep the original record and its audit.
      if(!row&&table==='lead_journal')continue;
      const value=merge(old?.payload,row?.payload,current);
      if(value===undefined){await c.query(`DELETE FROM ${table} WHERE id=$1`,[id]);continue;}
      await c.query(`INSERT INTO ${table}(id,payload) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=now()`,[id,JSON.stringify(value)]);
      if(table==='lead_journal')await c.query('INSERT INTO lead_events(lead_id,event_type,payload) VALUES($1,$2,$3)',[id,current?'updated':'imported_or_created',JSON.stringify({before:current||null,after:value})]);
      if(table==='lead_journal')await this.projectJournal(c,id,value);
    }});this.bases.set(store,next);
  }
  async projectJournal(c,id,row){
    for(const entry of row.managerHistory||[]){const hash=crypto.createHash('sha256').update(id+JSON.stringify(entry)).digest('hex');await c.query('INSERT INTO lead_assignments(id,lead_id,from_manager,to_manager,changed_at,payload) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',[hash,id,entry.fromManager||null,entry.toManager||entry.manager||'',entry.fromAt?new Date(Number(entry.fromAt)*1000):null,JSON.stringify(entry)]);}
    const sla=require('./working-sla');const threshold=Number(row.violationMinutes||20),end=row.answeredAt?Number(row.answeredAt)*1000:Date.now();
    if(row.receivedAt&&sla.workingMillisecondsBetween(Number(row.receivedAt)*1000,end,row)>=threshold*60000){
      const deadline=sla.workingDeadline(Number(row.receivedAt)*1000,row,threshold);let manager=row.managerAtReceipt||row.manager||'';
      for(const entry of [...(row.managerHistory||[])].sort((a,b)=>Number(a.fromAt)-Number(b.fromAt)))if(Number(entry.fromAt)*1000<=deadline)manager=entry.toManager||entry.manager||manager;
      await c.query('INSERT INTO sla_violations(lead_id,manager_at_detection,threshold_minutes,payload) VALUES($1,$2,$3,$4) ON CONFLICT(lead_id) DO UPDATE SET threshold_minutes=excluded.threshold_minutes,payload=excluded.payload',[id,manager,threshold,JSON.stringify({violationAt:deadline,answeredAt:row.answeredAt||null,attribution:'observed_manager_history'})]);
    }
  }

  // ---- v28.22 direct SQL / incremental journal API ----
  async readLeadJournalByPeer(peerId){
    if(!this.enabled)return [];
    const r=await this.pool.query("SELECT l.id,l.payload FROM lead_journal l WHERE l.payload->>'peerId'=$1 AND NOT EXISTS (SELECT 1 FROM notification_state s WHERE s.id='deletedJournal:'||l.id) ORDER BY l.id",[String(Math.trunc(Number(peerId)||0))]);
    return r.rows.map(x=>({id:x.id,payload:x.payload}));
  }
  async readDeletedJournalIdsByPeer(peerId){
    if(!this.enabled)return [];
    const prefix=`deletedJournal:lead-${Math.trunc(Number(peerId)||0)}-%`,r=await this.pool.query("SELECT id FROM notification_state WHERE id LIKE $1",[prefix]);return r.rows.map(x=>String(x.id).slice('deletedJournal:'.length));
  }
  async upsertLeadJournalBatch(rows=[],bases=new Map()){
    if(!this.enabled||!rows.length)return {written:0};const list=[...new Map(rows.filter(Boolean).map(row=>[String(row.id),row])).values()];let written=0;
    await this.transaction(async c=>{for(const row of list){const id=String(row.id||'');if(!id)continue;const r=await c.query('SELECT payload FROM lead_journal WHERE id=$1 FOR UPDATE',[id]),current=r.rows[0]?.payload,base=bases instanceof Map?bases.get(id):bases?.[id];let value;
      if(current&&base!==undefined){try{value=merge(base,row,current)}catch{value=mergeJournalLoose(current,row)}}else value=mergeJournalLoose(current,row);
      if(equal(current,value))continue;
      await c.query('INSERT INTO lead_journal(id,payload) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=now()',[id,JSON.stringify(value)]);
      await c.query('INSERT INTO lead_events(lead_id,event_type,payload) VALUES($1,$2,$3)',[id,current?'incremental_update':'incremental_create',JSON.stringify({before:current||null,after:value})]);await this.projectJournal(c,id,value);written++;
    }});return {written};
  }
  async scanLeadJournal(onBatch,{batchSize=750}={}){
    if(!this.enabled)return {rows:0,batches:0};let cursor='',rowsSeen=0,batches=0;const size=Math.min(2000,Math.max(50,Number(batchSize)||750));
    for(;;){const r=await this.pool.query("SELECT l.id,l.payload FROM lead_journal l WHERE l.id>$1 AND NOT EXISTS (SELECT 1 FROM notification_state s WHERE s.id='deletedJournal:'||l.id) ORDER BY l.id ASC LIMIT $2",[cursor,size]);if(!r.rows.length)break;rowsSeen+=r.rows.length;batches++;await onBatch(r.rows.map(x=>({id:x.id,payload:x.payload})));cursor=String(r.rows[r.rows.length-1].id);if(r.rows.length<size)break;await new Promise(resolve=>setImmediate(resolve));}
    return {rows:rowsSeen,batches};
  }
  async readLeadJournalRecent(limit=2000){
    if(!this.enabled)return [];const size=Math.min(5000,Math.max(1,Number(limit)||2000));const expr=numericJsonExpr('receivedAt');const r=await this.pool.query(`SELECT l.id,l.payload FROM lead_journal l WHERE NOT EXISTS (SELECT 1 FROM notification_state s WHERE s.id='deletedJournal:'||l.id) ORDER BY ${expr} DESC,l.id DESC LIMIT $1`,[size]);return r.rows.map(x=>({id:x.id,payload:x.payload}));
  }
  async readLeadJournalPageAfterId(cursorId='',limit=50){
    if(!this.enabled)return [];const size=Math.min(500,Math.max(1,Number(limit)||50));const r=await this.pool.query("SELECT l.id,l.payload FROM lead_journal l WHERE l.id>$1 AND NOT EXISTS (SELECT 1 FROM notification_state s WHERE s.id='deletedJournal:'||l.id) ORDER BY l.id ASC LIMIT $2",[String(cursorId||''),size]);return r.rows.map(x=>({id:x.id,payload:x.payload}));
  }
  async countLeadJournal(){if(!this.enabled)return 0;const r=await this.pool.query("SELECT count(*)::bigint AS count FROM lead_journal l WHERE NOT EXISTS (SELECT 1 FROM notification_state s WHERE s.id='deletedJournal:'||l.id)");return Number(r.rows[0]?.count||0)}
  _recipientWhere(names=[],admin=false,start=1){if(admin)return {sql:'',params:[]};const clean=[...new Set((names||[]).map(x=>String(x||'').trim().toLowerCase()).filter(Boolean))];if(!clean.length)return {sql:' AND 1=0',params:[]};const placeholders=clean.map((_,i)=>`$${start+i}`).join(',');return {sql:` AND lower(COALESCE(payload->>'recipientManager','')) IN (${placeholders})`,params:clean};}
  async getNotificationHistoryRows({names=[],admin=false,limit=1500}={}){
    if(!this.enabled)return [];const size=Math.min(5000,Math.max(1,Number(limit)||1500)),w=this._recipientWhere(names,admin,2),expr=numericJsonExpr('createdAt');const r=await this.pool.query(`SELECT id,payload FROM notification_history WHERE 1=1${w.sql} ORDER BY ${expr} DESC,id DESC LIMIT $1`,[size,...w.params]);return r.rows.map(x=>x.payload);
  }
  async getNotificationHistorySummary({names=[],admin=false}={}){
    if(!this.enabled)return {total:0,actual:0,historical:0,sent:0,partial:0,pending:0,failed:0};const w=this._recipientWhere(names,admin,1);const r=await this.pool.query(`SELECT
      count(*)::bigint AS total,
      count(*) FILTER (WHERE COALESCE(payload->>'historical','false')='true' OR COALESCE(payload->>'overallStatus','')='historical')::bigint AS historical,
      count(*) FILTER (WHERE NOT (COALESCE(payload->>'historical','false')='true' OR COALESCE(payload->>'overallStatus','')='historical'))::bigint AS actual,
      count(*) FILTER (WHERE payload->>'overallStatus'='sent')::bigint AS sent,
      count(*) FILTER (WHERE payload->>'overallStatus'='partial')::bigint AS partial,
      count(*) FILTER (WHERE payload->>'overallStatus'='pending')::bigint AS pending,
      count(*) FILTER (WHERE NOT (COALESCE(payload->>'historical','false')='true' OR COALESCE(payload->>'overallStatus','')='historical') AND COALESCE(payload->>'overallStatus','') NOT IN ('sent','partial','pending'))::bigint AS failed
      FROM notification_history WHERE 1=1${w.sql}`,w.params);const x=r.rows[0]||{};return Object.fromEntries(['total','actual','historical','sent','partial','pending','failed'].map(k=>[k,Number(x[k]||0)]));
  }
  async getNotificationHistoryById(id){if(!this.enabled)return null;const r=await this.pool.query('SELECT payload FROM notification_history WHERE id=$1',[String(id)]);return r.rows[0]?.payload||null}
  async upsertNotificationHistoryRows(rows=[],{ignoreExisting=false}={}){
    if(!this.enabled||!rows.length)return {inserted:0,ids:[]};const ids=[];await this.transaction(async c=>{for(const row of rows){if(!row?.id)continue;const sql=ignoreExisting?'INSERT INTO notification_history(id,payload) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING id':'INSERT INTO notification_history(id,payload) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=now() RETURNING id';const r=await c.query(sql,[String(row.id),JSON.stringify(row)]);if(r.rows[0]?.id)ids.push(String(r.rows[0].id));}});return {inserted:ids.length,ids};
  }
  async getBrowserPendingNotifications({names=[],admin=false,limit=30}={}){
    if(!this.enabled)return [];const size=Math.min(100,Math.max(1,Number(limit)||30)),w=this._recipientWhere(names,admin,2),expr=numericJsonExpr('createdAt');const r=await this.pool.query(`SELECT payload FROM notification_history WHERE COALESCE(payload#>>'{channels,browser,status}','')='pending'${w.sql} ORDER BY ${expr} ASC LIMIT $1`,[size,...w.params]);return r.rows.map(x=>x.payload);
  }
  async expireStaleBrowserPending(cutoffMs=Date.now()-30*60*1000,limit=200){
    if(!this.enabled)return 0;const size=Math.min(1000,Math.max(1,Number(limit)||200)),expr=numericJsonExpr('createdAt'),r=await this.pool.query(`SELECT id,payload FROM notification_history WHERE COALESCE(payload#>>'{channels,browser,status}','')='pending' AND ${expr}<$1 ORDER BY ${expr} ASC LIMIT $2`,[Math.max(0,Number(cutoffMs)||0),size]);if(!r.rows.length)return 0;const rows=[];for(const x of r.rows){const row=clone(x.payload);row.channels=row.channels||{};row.channels.browser={...(row.channels.browser||{}),status:'missed',at:Date.now(),error:'Браузер не забрал уведомление в течение 30 минут'};row.updatedAt=Date.now();row.overallStatus=deliveryOverall(row);rows.push(row)}await this.upsertNotificationHistoryRows(rows);return rows.length
  }
  async pruneNotificationHistory(cutoffMs){if(!this.enabled)return 0;const expr=numericJsonExpr('createdAt'),r=await this.pool.query(`DELETE FROM notification_history WHERE COALESCE(payload->>'historical','false')<>'true' AND ${expr}<$1`,[Math.max(0,Number(cutoffMs)||0)]);return Number(r.rowCount||0)}
  async readOutboxRows(limit=1000){if(!this.enabled)return [];const size=Math.min(5000,Math.max(1,Number(limit)||1000)),expr=numericJsonExpr('createdAt');const r=await this.pool.query(`SELECT id,payload FROM notification_deliveries WHERE COALESCE(payload->>'status','') IN ('queued','sending','error') ORDER BY ${expr} ASC LIMIT $1`,[size]);return r.rows.map(x=>x.payload)}
  async readOutboxBackfillRows(limit=5000){if(!this.enabled)return [];const size=Math.min(10000,Math.max(1,Number(limit)||5000)),expr=numericJsonExpr('createdAt');const r=await this.pool.query(`SELECT id,payload FROM notification_deliveries WHERE COALESCE(payload->>'status','') IN ('queued','error') ORDER BY ${expr} ASC LIMIT $1`,[size]);return r.rows.map(x=>x.payload)}
  async markLeadJournalDeleted(id,at=Date.now()){if(!this.enabled)return false;const key=String(id||'');if(!key)return false;const exists=await this.pool.query('SELECT 1 FROM lead_journal WHERE id=$1',[key]);if(!exists.rowCount)return false;await this.pool.query(`INSERT INTO notification_state(id,payload) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=now()`,['deletedJournal:'+key,JSON.stringify(Number(at)||Date.now())]);return true}
  async restoreLeadJournal(id){if(!this.enabled)return false;const r=await this.pool.query('DELETE FROM notification_state WHERE id=$1 RETURNING id',['deletedJournal:'+String(id||'')]);return r.rowCount>0}
  async readDeletedJournalIds(limit=5000){if(!this.enabled)return [];const size=Math.min(20000,Math.max(1,Number(limit)||5000)),r=await this.pool.query("SELECT id FROM notification_state WHERE id LIKE 'deletedJournal:%' ORDER BY updated_at DESC LIMIT $1",[size]);return r.rows.map(x=>String(x.id).slice('deletedJournal:'.length))}
  async markLeadJournalAnswered(peerId,answeredAt,details={}){
    if(!this.enabled)return 0;const peer=String(Math.trunc(Number(peerId)||0)),at=Number(answeredAt)||Math.floor(Date.now()/1000);const r=await this.pool.query("SELECT l.id,l.payload FROM lead_journal l WHERE l.payload->>'peerId'=$1 AND COALESCE(l.payload->>'answeredAt','0') IN ('','0') AND NOT EXISTS (SELECT 1 FROM notification_state s WHERE s.id='deletedJournal:'||l.id)",[peer]);if(!r.rows.length)return 0;const bases=new Map(),rows=[];for(const x of r.rows){const row=clone(x.payload);if(at<=Number(row.receivedAt||0))continue;bases.set(x.id,clone(x.payload));row.status='answered';row.answeredAt=at;row.responseText=String(details.responseText||row.responseText||'').slice(0,2000);row.responseAuthor=String(details.responseAuthor||row.responseAuthor||'').slice(0,180);row.responseMessageId=String(details.responseMessageId||row.responseMessageId||'');row.updatedAt=Date.now();rows.push(row)}if(!rows.length)return 0;await this.upsertLeadJournalBatch(rows,bases);return rows.length}

  async importDirectory(dir){
    const files=[];const visit=folder=>{for(const e of fs.readdirSync(folder,{withFileTypes:true})){if(e.isSymbolicLink())continue;const p=path.join(folder,e.name);if(e.isDirectory()){if(e.name!=='source')visit(p);}else if(e.name.endsWith('.json'))files.push(p);}};visit(dir);
    const input=files.map(file=>({key:path.relative(dir,file).split(path.sep).join('/'),value:JSON.parse(fs.readFileSync(file,'utf8'))}));
    for(const item of input)if(item.key==='notification-settings.json'&&(!object(item.value)||!Array.isArray(item.value.rules)||!object(item.value.journal)))throw new Error('Invalid notification-settings.json: expected rules array and journal object');
    return this.transaction(async c=>{await c.query('SELECT pg_advisory_xact_lock(2816002)');const done=await c.query("SELECT id FROM crm_migrations WHERE id='legacy-json-import-v1'");if(done.rowCount)return {alreadyImported:true};
      const counts={documents:0,rows:0};for(const {key,value}of input){if(key==='notification-settings.json'){for(const row of this.flatten(value).values()){const r=await c.query(`INSERT INTO ${row.table}(id,payload) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING id`,[row.id,JSON.stringify(row.payload)]);counts.rows+=r.rowCount;if(r.rowCount&&row.table==='lead_journal')await c.query("INSERT INTO lead_events(lead_id,event_type,payload) VALUES($1,'legacy_import',$2)",[row.id,JSON.stringify(row.payload)]);if(r.rowCount&&row.table==='lead_journal')await this.projectJournal(c,row.id,row.payload);}}else{const r=await c.query('INSERT INTO app_documents(key,payload) VALUES($1,$2) ON CONFLICT DO NOTHING',[key,JSON.stringify(value)]);counts.documents+=r.rowCount;}}
      await c.query("INSERT INTO crm_migrations(id) VALUES('legacy-json-import-v1')");return counts;
    });
  }
  async claimCreate(key){if(!this.enabled){if(this.createClaims.has(key))return false;this.createClaims.add(key);return true;}const r=await this.pool.query("INSERT INTO customer_create_requests(key,state) VALUES($1,'pending') ON CONFLICT DO NOTHING RETURNING key",[key]);return r.rowCount===1;}
  async confirmCreate(key,id){if(this.enabled)await this.pool.query("UPDATE customer_create_requests SET state='confirmed',client_id=$2,updated_at=now() WHERE key=$1",[key,String(id)]);}
  sessionKey(id){return crypto.createHash('sha256').update(id).digest('hex');}
  async saveSession(id,sealed,expires){await this.pool.query('INSERT INTO user_sessions(id_hash,sealed_payload,expires_at) VALUES($1,$2,$3) ON CONFLICT(id_hash) DO UPDATE SET sealed_payload=excluded.sealed_payload,expires_at=excluded.expires_at',[this.sessionKey(id),sealed,new Date(expires)]);await this.pool.query('DELETE FROM user_sessions WHERE expires_at<now()');}
  async loadSession(id){const r=await this.pool.query('SELECT sealed_payload FROM user_sessions WHERE id_hash=$1 AND expires_at>now()',[this.sessionKey(id)]);return r.rows[0]?.sealed_payload||null;}
  async deleteSession(id){if(this.enabled)await this.pool.query('DELETE FROM user_sessions WHERE id_hash=$1',[this.sessionKey(id)]);}
  async observeClients(scope,clients){
    if(!this.enabled||!clients.length)return;
    await this.transaction(async c=>{for(const row of clients){if(!row.id)continue;const id=String(row.id);await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['client:'+scope+':'+id]);const previous=(await c.query('SELECT payload FROM clients WHERE scope=$1 AND id=$2',[scope,id])).rows[0]?.payload;
      await c.query('INSERT INTO clients(scope,id,payload) VALUES($1,$2,$3) ON CONFLICT(scope,id) DO UPDATE SET payload=excluded.payload,observed_at=now()',[scope,id,JSON.stringify(row)]);
      if(row.nextContactDate)await c.query('INSERT INTO calendar_events(scope,client_id,next_contact) VALUES($1,$2,$3) ON CONFLICT(scope,client_id) DO UPDATE SET next_contact=excluded.next_contact,updated_at=now()',[scope,id,String(row.nextContactDate)]);
      else await c.query('DELETE FROM calendar_events WHERE scope=$1 AND client_id=$2',[scope,id]);
      if(!previous||['manager','managerLogin','crmStatus','nextContactDate'].some(k=>!equal(previous[k],row[k])))await c.query('INSERT INTO client_events(scope,client_id,event_type,payload) VALUES($1,$2,$3,$4)',[scope,id,previous?'observed_change':'first_observed',JSON.stringify({before:previous||null,after:row})]);
    }});
  }
  poolStats(){return this.enabled?{total:Number(this.pool?.totalCount??0),idle:Number(this.pool?.idleCount??0),waiting:Number(this.pool?.waitingCount??0),documentsCached:this.documents.size,documentsLoadedAt:this.documentsLoadedAt}:null}
  async health(){if(!this.enabled)return {mode:'json',ready:true};const started=Date.now();await this.pool.query('SELECT 1');return {mode:'postgresql',ready:true,latencyMs:Date.now()-started,pool:this.poolStats()};}
  async close(){if(this.pool)await this.pool.end();}
}
module.exports={Storage,merge,mergeJournalLoose};
