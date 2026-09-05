'use strict';
const fs = require('fs');
const path = require('path');
const { isDeepStrictEqual: equal } = require('util');
const { AsyncLocalStorage } = require('async_hooks');
const clone = x => x === undefined ? undefined : JSON.parse(JSON.stringify(x));
const sections = { journal:'lead_journal', rules:'sla_settings', outbox:'notification_deliveries', pairCodes:'notification_state', notified:'notification_state', deletedJournal:'notification_state' };
const object = x => x && typeof x === 'object' && !Array.isArray(x);
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
class Storage {
  constructor(root, options={}) { this.root=root;this.enabled=Boolean(process.env.DATABASE_URL||options.pool);this.pool=options.pool;this.context=new AsyncLocalStorage();this.documents=new Map();this.bases=new WeakMap();this.createClaims=new Set(); }
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
  }
  async refreshDocuments(){const {rows}=await this.pool.query('SELECT key,payload FROM app_documents');this.documents=new Map(rows.map(x=>[x.key,x.payload]));return new Map(this.documents);}
  async run(fn){if(!this.enabled)return fn();const docs=await this.refreshDocuments();return this.context.run(docs,fn);}
  readDocument(file){const key=path.relative(path.join(this.root,'data'),file).split(path.sep).join('/');const docs=this.context.getStore()||this.documents;return clone(docs.get(key));}
  async writeDocument(file,value){
    if(!this.enabled){await fs.promises.mkdir(path.dirname(file),{recursive:true});const tmp=file+'.'+require('crypto').randomUUID()+'.tmp';await fs.promises.writeFile(tmp,JSON.stringify(value,null,2));await fs.promises.rename(tmp,file);return;}
    const key=path.relative(path.join(this.root,'data'),file).split(path.sep).join('/');const docs=this.context.getStore()||this.documents;const base=docs.get(key);
    const saved=await this.transaction(async c=>{await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['document:'+key]);const r=await c.query('SELECT payload FROM app_documents WHERE key=$1',[key]);const v=merge(base,value,r.rows[0]?.payload);await c.query('INSERT INTO app_documents(key,payload) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,updated_at=now()',[key,JSON.stringify(v)]);return v;});
    docs.set(key,saved);this.documents.set(key,saved);
  }
  flatten(store){const rows=new Map();for(const [section,table]of Object.entries(sections)){const values=section==='rules'?Object.fromEntries((store.rules||[]).map(x=>[String(x.id||x.manager),x])):(store[section]||{});for(const [key,payload]of Object.entries(values)){const id=table==='notification_state'?section+':'+key:key;rows.set(table+'\0'+id,{table,id,payload:clone(payload)});}}return rows;}
  async readNotifications(defaults){
    if(!this.enabled){const file=path.join(this.root,'data/notification-settings.json');if(!fs.existsSync(file))return defaults;return JSON.parse(await fs.promises.readFile(file,'utf8'));}
    const store=clone(defaults);
    // One consistent snapshot across tables, even while another request commits.
    await this.transaction(async c=>{await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');for(const table of new Set(Object.values(sections))){const {rows}=await c.query(`SELECT id,payload FROM ${table}`);for(const {id,payload}of rows){if(table==='notification_state'){const pos=id.indexOf(':');store[id.slice(0,pos)][id.slice(pos+1)]=payload;}else if(table==='sla_settings')store.rules.push(payload);else store[table==='lead_journal'?'journal':'outbox'][id]=payload;}}});
    for(const id of Object.keys(store.deletedJournal||{}))delete store.journal[id];
    this.bases.set(store,this.flatten(store));return store;
  }
  trackNotifications(raw,hydrated){if(this.enabled)this.bases.set(hydrated,this.bases.get(raw));return hydrated;}
  async writeNotifications(store){
    if(!this.enabled)return this.writeDocument(path.join(this.root,'data/notification-settings.json'),store);
    const base=this.bases.get(store);if(!base)throw new Error('Notification snapshot is missing');const next=this.flatten(store);
    await this.transaction(async c=>{await c.query('SELECT pg_advisory_xact_lock(2816002)');for(const key of new Set([...base.keys(),...next.keys()])){
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
    for(const entry of row.managerHistory||[]){const hash=require('crypto').createHash('sha256').update(id+JSON.stringify(entry)).digest('hex');await c.query('INSERT INTO lead_assignments(id,lead_id,from_manager,to_manager,changed_at,payload) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',[hash,id,entry.fromManager||null,entry.toManager||entry.manager||'',entry.fromAt?new Date(Number(entry.fromAt)*1000):null,JSON.stringify(entry)]);}
    const sla=require('./working-sla');const threshold=Number(row.violationMinutes||20),end=row.answeredAt?Number(row.answeredAt)*1000:Date.now();
    if(row.receivedAt&&sla.workingMillisecondsBetween(Number(row.receivedAt)*1000,end,row)>threshold*60000){
      const deadline=sla.workingDeadline(Number(row.receivedAt)*1000,row,threshold);let manager=row.managerAtReceipt||row.manager||'';
      for(const entry of [...(row.managerHistory||[])].sort((a,b)=>Number(a.fromAt)-Number(b.fromAt)))if(Number(entry.fromAt)*1000<=deadline)manager=entry.toManager||entry.manager||manager;
      await c.query('INSERT INTO sla_violations(lead_id,manager_at_detection,threshold_minutes,payload) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[id,manager,threshold,JSON.stringify({violationAt:deadline,answeredAt:row.answeredAt||null,attribution:'observed_manager_history'})]);
    }
  }
  async importDirectory(dir){
    const files=[];const visit=folder=>{for(const e of fs.readdirSync(folder,{withFileTypes:true})){if(e.isSymbolicLink())continue;const p=path.join(folder,e.name);if(e.isDirectory()){if(e.name!=='source')visit(p);}else if(e.name.endsWith('.json'))files.push(p);}};visit(dir);
    // Parse everything before the transaction; malformed input cannot partially import.
    const input=files.map(file=>({key:path.relative(dir,file).split(path.sep).join('/'),value:JSON.parse(fs.readFileSync(file,'utf8'))}));
    for(const item of input)if(item.key==='notification-settings.json'&&(!object(item.value)||!Array.isArray(item.value.rules)||!object(item.value.journal)))throw new Error('Invalid notification-settings.json: expected rules array and journal object');
    return this.transaction(async c=>{await c.query('SELECT pg_advisory_xact_lock(2816002)');const done=await c.query("SELECT id FROM crm_migrations WHERE id='legacy-json-import-v1'");if(done.rowCount)return {alreadyImported:true};
      const counts={documents:0,rows:0};for(const {key,value}of input){if(key==='notification-settings.json'){for(const row of this.flatten(value).values()){const r=await c.query(`INSERT INTO ${row.table}(id,payload) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING id`,[row.id,JSON.stringify(row.payload)]);counts.rows+=r.rowCount;if(r.rowCount&&row.table==='lead_journal')await c.query("INSERT INTO lead_events(lead_id,event_type,payload) VALUES($1,'legacy_import',$2)",[row.id,JSON.stringify(row.payload)]);if(r.rowCount&&row.table==='lead_journal')await this.projectJournal(c,row.id,row.payload);}}else{const r=await c.query('INSERT INTO app_documents(key,payload) VALUES($1,$2) ON CONFLICT DO NOTHING',[key,JSON.stringify(value)]);counts.documents+=r.rowCount;}}
      await c.query("INSERT INTO crm_migrations(id) VALUES('legacy-json-import-v1')");return counts;
    });
  }
  async claimCreate(key){if(!this.enabled){if(this.createClaims.has(key))return false;this.createClaims.add(key);return true;}const r=await this.pool.query("INSERT INTO customer_create_requests(key,state) VALUES($1,'pending') ON CONFLICT DO NOTHING RETURNING key",[key]);return r.rowCount===1;}
  async confirmCreate(key,id){if(this.enabled)await this.pool.query("UPDATE customer_create_requests SET state='confirmed',client_id=$2,updated_at=now() WHERE key=$1",[key,String(id)]);}
  sessionKey(id){return require('crypto').createHash('sha256').update(id).digest('hex');}
  async saveSession(id,sealed,expires){await this.pool.query('INSERT INTO user_sessions(id_hash,sealed_payload,expires_at) VALUES($1,$2,$3)',[this.sessionKey(id),sealed,new Date(expires)]);await this.pool.query('DELETE FROM user_sessions WHERE expires_at<now()');}
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
  async health(){if(!this.enabled)return {mode:'json',ready:true};await this.pool.query('SELECT 1');return {mode:'postgresql',ready:true};}
  async close(){if(this.pool)await this.pool.end();}
}
module.exports={Storage,merge};
