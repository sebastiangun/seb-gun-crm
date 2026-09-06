'use strict';

const WorkingSla = require('./working-sla');

const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const lower = value => String(value || '').trim().toLowerCase();
const asArray = value => Array.isArray(value) ? value : [];
const uniq = values => [...new Set(values.map(lower).filter(Boolean))];
const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;

function managerAtEpoch(row, at) {
  let manager = String(row.managerAtReceipt || row.manager || row.currentManager || '');
  for (const entry of asArray(row.managerHistory).slice().sort((a,b)=>num(a.fromAt)-num(b.fromAt))) {
    if (num(entry.fromAt) <= at) manager = String(entry.toManager || entry.manager || manager);
  }
  return manager || String(row.currentManager || row.manager || 'Не назначен');
}

function normalizedHistoryValues(row, kind) {
  if (kind === 'manager') {
    return uniq([
      row.managerAtReceipt,row.manager,row.currentManager,
      ...asArray(row.managerHistory).flatMap(x=>[x.manager,x.fromManager,x.toManager])
    ]);
  }
  return uniq([
    row.statusAtReceipt,row.crmStatus,row.currentCrmStatus,
    ...asArray(row.statusHistory).flatMap(x=>[x.status,x.fromStatus,x.toStatus])
  ]);
}

function projectLead(row, nowMs = Date.now()) {
  row = clone(row || {});
  row.managerHistory = asArray(row.managerHistory);
  row.statusHistory = asArray(row.statusHistory);
  row.incomingTexts = asArray(row.incomingTexts);
  row.workDays = asArray(row.workDays).length ? asArray(row.workDays) : [1,2,3,4,5,6,7];
  row.workStart = String(row.workStart || '10:00');
  row.workEnd = String(row.workEnd || '22:00');
  row.timezone = String(row.timezone || 'Europe/Moscow');
  row.slaMinutes = Math.max(1, num(row.slaMinutes) || 8);
  row.violationMinutes = Math.max(row.slaMinutes, num(row.violationMinutes) || 20);

  const receivedAt = Math.max(0, Math.trunc(num(row.receivedAt)));
  const answeredAt = Math.max(0, Math.trunc(num(row.answeredAt)));
  const settings = {
    workDays: row.workDays,
    workStart: row.workStart,
    workEnd: row.workEnd,
    timezone: row.timezone,
    slaMinutes: row.slaMinutes,
    violationMinutes: row.violationMinutes,
  };
  const endMs = answeredAt ? answeredAt * 1000 : nowMs;
  let worked = 0, violationAtMs = 0, notificationAtMs = 0;
  if (receivedAt) {
    try { worked = WorkingSla.workingMinutesBetween(receivedAt * 1000, endMs, settings); } catch { worked = 0; }
    try { violationAtMs = WorkingSla.workingDeadline(receivedAt * 1000, settings, row.violationMinutes); } catch { violationAtMs = 0; }
    try { notificationAtMs = WorkingSla.workingDeadline(receivedAt * 1000, settings, row.slaMinutes); } catch { notificationAtMs = 0; }
  }
  worked = Math.max(0, Math.round(num(worked)));
  const violated = Boolean(receivedAt && worked >= row.violationMinutes);
  const notified = Boolean(receivedAt && worked >= row.slaMinutes);
  const responsibilityAt = violated && violationAtMs
    ? Math.floor(violationAtMs / 1000)
    : (answeredAt || Math.floor(nowMs / 1000));
  const responsibleManager = managerAtEpoch(row, responsibilityAt);
  const currentManager = String(row.currentManager || row.manager || responsibleManager || 'Не назначен');
  const currentCrmStatus = String(row.currentCrmStatus || row.crmStatus || '');
  const waiting = !answeredAt;
  const responseMinutes = answeredAt && receivedAt ? Math.max(0, Math.round((answeredAt - receivedAt) / 60)) : 0;
  const onTime = Boolean(answeredAt && !violated);

  const reportRow = {
    ...row,
    id: String(row.id || ''),
    receivedAt,
    answeredAt,
    status: answeredAt ? 'answered' : 'waiting',
    waiting,
    responseMinutes,
    workingResponseMinutes: worked,
    violated,
    notified,
    onTime,
    responsibleManager,
    currentManager,
    crmStatus: currentCrmStatus,
    currentCrmStatus,
    notificationAt: notificationAtMs ? Math.floor(notificationAtMs / 1000) : 0,
    violationAt: violationAtMs ? Math.floor(violationAtMs / 1000) : 0,
  };

  return {
    reportRow,
    managerValues: normalizedHistoryValues(row, 'manager'),
    statusValues: normalizedHistoryValues(row, 'status'),
  };
}

class EventStateStore {
  constructor(storage) {
    this.storage = storage;
    this.initialized = false;
    this.initializing = null;
    this.timer = null;
    this.busy = false;
    this.queue = new Map();
    this.notificationSummaryCache = new Map();
    this.lastTickAt = 0;
    this.lastError = '';
    this.lastBrowserExpiryAt = 0;
  }

  get pool() { return this.storage.pool; }

  async init() {
    if (!this.storage.enabled) return false;
    if (this.initialized) return true;
    if (this.initializing) return this.initializing;
    this.initializing = (async()=>{
      const statements = [
        `CREATE TABLE IF NOT EXISTS crm_event_log (
          id bigserial PRIMARY KEY,
          dedupe_key text UNIQUE NOT NULL,
          event_type text NOT NULL,
          lead_id text,
          peer_id bigint,
          manager text,
          crm_status text,
          event_at bigint NOT NULL DEFAULT 0,
          payload jsonb NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        )`,
        `CREATE INDEX IF NOT EXISTS crm_event_log_peer_time ON crm_event_log(peer_id,event_at DESC,id DESC)`,
        `CREATE INDEX IF NOT EXISTS crm_event_log_type_time ON crm_event_log(event_type,event_at DESC,id DESC)`,
        `CREATE TABLE IF NOT EXISTS lead_state (
          lead_id text PRIMARY KEY,
          peer_id bigint NOT NULL DEFAULT 0,
          responsible_manager text NOT NULL DEFAULT '',
          current_manager text NOT NULL DEFAULT '',
          crm_status text NOT NULL DEFAULT '',
          waiting boolean NOT NULL DEFAULT true,
          answered boolean NOT NULL DEFAULT false,
          on_time boolean NOT NULL DEFAULT false,
          violated boolean NOT NULL DEFAULT false,
          notified boolean NOT NULL DEFAULT false,
          working_minutes integer NOT NULL DEFAULT 0,
          received_at bigint NOT NULL DEFAULT 0,
          answered_at bigint NOT NULL DEFAULT 0,
          manager_values_lc text[] NOT NULL DEFAULT ARRAY[]::text[],
          status_values_lc text[] NOT NULL DEFAULT ARRAY[]::text[],
          payload jsonb NOT NULL,
          report_row jsonb NOT NULL,
          deleted boolean NOT NULL DEFAULT false,
          source_updated bigint NOT NULL DEFAULT 0,
          updated_at timestamptz NOT NULL DEFAULT now()
        )`,
        `CREATE INDEX IF NOT EXISTS lead_state_received ON lead_state(received_at DESC,lead_id DESC)`,
        `CREATE INDEX IF NOT EXISTS lead_state_manager ON lead_state(responsible_manager)`,
        `CREATE INDEX IF NOT EXISTS lead_state_status ON lead_state(crm_status)`,
        `CREATE INDEX IF NOT EXISTS lead_state_waiting ON lead_state(waiting,received_at DESC)`,
        `CREATE TABLE IF NOT EXISTS event_projection_state (
          key text PRIMARY KEY,
          payload jsonb NOT NULL,
          updated_at timestamptz NOT NULL DEFAULT now()
        )`,
      ];
      for (const sql of statements) await this.pool.query(sql);
      this.initialized = true;
      this.start();
      return true;
    })().catch(err=>{ this.lastError = String(err?.message || err); throw err; }).finally(()=>{ this.initializing = null; });
    return this.initializing;
  }

  start() {
    if (this.timer || !this.storage.enabled) return;
    this.timer = setInterval(()=>this.tick().catch(err=>{this.lastError=String(err?.message||err);console.warn('[event-state]',this.lastError)}), 1500);
    if (this.timer.unref) this.timer.unref();
    setTimeout(()=>this.tick().catch(()=>{}), 250);
  }

  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  enqueueRows(rows=[]) {
    for (const row of rows || []) if (row?.id) this.queue.set(String(row.id), clone(row));
    if (this.queue.size) setTimeout(()=>this.tick().catch(()=>{}), 30);
  }

  async getState(key, fallback={}) {
    await this.init();
    const r = await this.pool.query('SELECT payload FROM event_projection_state WHERE key=$1',[String(key)]);
    return r.rows[0]?.payload || clone(fallback);
  }

  async setState(key, payload) {
    await this.pool.query(`INSERT INTO event_projection_state(key,payload) VALUES($1,$2)
      ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,updated_at=now()`,[String(key),JSON.stringify(payload||{})]);
  }

  async upsertProjectionRow(c,row,{eventKey='',eventType='lead_state'}={}) {
    if (!row?.id) return;
    const {reportRow,managerValues,statusValues} = projectLead(row);
    const deletedCheck = await c.query("SELECT 1 FROM notification_state WHERE id=$1",['deletedJournal:'+String(row.id)]);
    const deleted = deletedCheck.rowCount > 0;
    await c.query(`INSERT INTO lead_state(
      lead_id,peer_id,responsible_manager,current_manager,crm_status,waiting,answered,on_time,violated,notified,
      working_minutes,received_at,answered_at,manager_values_lc,status_values_lc,payload,report_row,deleted,source_updated
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
    ON CONFLICT(lead_id) DO UPDATE SET
      peer_id=excluded.peer_id,responsible_manager=excluded.responsible_manager,current_manager=excluded.current_manager,
      crm_status=excluded.crm_status,waiting=excluded.waiting,answered=excluded.answered,on_time=excluded.on_time,
      violated=excluded.violated,notified=excluded.notified,working_minutes=excluded.working_minutes,
      received_at=excluded.received_at,answered_at=excluded.answered_at,manager_values_lc=excluded.manager_values_lc,
      status_values_lc=excluded.status_values_lc,payload=excluded.payload,report_row=excluded.report_row,
      deleted=excluded.deleted,source_updated=excluded.source_updated,updated_at=now()`,[
      String(row.id),Math.trunc(num(row.peerId)),String(reportRow.responsibleManager||''),String(reportRow.currentManager||''),
      String(reportRow.currentCrmStatus||''),reportRow.waiting,!reportRow.waiting,reportRow.onTime,reportRow.violated,reportRow.notified,
      Math.trunc(num(reportRow.workingResponseMinutes)),Math.trunc(num(reportRow.receivedAt)),Math.trunc(num(reportRow.answeredAt)),
      managerValues,statusValues,JSON.stringify(row),JSON.stringify(reportRow),deleted,Math.trunc(num(row.updatedAt)||Date.now())
    ]);
    const dedupe = String(eventKey || `state:${row.id}:${Math.trunc(num(row.updatedAt)||Date.now())}`);
    await c.query(`INSERT INTO crm_event_log(dedupe_key,event_type,lead_id,peer_id,manager,crm_status,event_at,payload)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(dedupe_key) DO NOTHING`,[
      dedupe,String(eventType||'lead_state'),String(row.id),Math.trunc(num(row.peerId)),String(reportRow.currentManager||''),
      String(reportRow.currentCrmStatus||''),Math.trunc(num(row.answeredAt||row.receivedAt||Date.now()/1000)),JSON.stringify({row:reportRow})
    ]);
  }

  async flushQueue(limit=100) {
    if (!this.queue.size) return 0;
    const rows = [...this.queue.values()].slice(0,Math.max(1,Number(limit)||100));
    for (const row of rows) this.queue.delete(String(row.id));
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      for (const row of rows) await this.upsertProjectionRow(c,row,{eventType:'lead_state_update'});
      await c.query('COMMIT');
      return rows.length;
    } catch (err) {
      await c.query('ROLLBACK').catch(()=>{});
      for (const row of rows) this.queue.set(String(row.id),row);
      throw err;
    } finally { c.release(); }
  }

  async backfillBatch(limit=100) {
    const state = await this.getState('lead_state_backfill',{cursor:'',complete:false,processed:0});
    if (state.complete) return state;
    const size = Math.min(250,Math.max(10,Number(limit)||100));
    const r = await this.pool.query(`SELECT l.id,l.payload FROM lead_journal l WHERE l.id>$1 ORDER BY l.id ASC LIMIT $2`,[String(state.cursor||''),size]);
    if (!r.rows.length) {
      const done={...state,complete:true,completedAt:Date.now()};await this.setState('lead_state_backfill',done);return done;
    }
    const c=await this.pool.connect();
    try {
      await c.query('BEGIN');
      for (const x of r.rows) await this.upsertProjectionRow(c,{...x.payload,id:x.id},{eventKey:`snapshot:${x.id}:${Math.trunc(num(x.payload?.updatedAt)||0)}`,eventType:'historical_snapshot'});
      await c.query('COMMIT');
    } catch(err){await c.query('ROLLBACK').catch(()=>{});throw err} finally{c.release()}
    const next={cursor:String(r.rows[r.rows.length-1].id),complete:r.rows.length<size,processed:num(state.processed)+r.rows.length,updatedAt:Date.now()};
    if(next.complete)next.completedAt=Date.now();await this.setState('lead_state_backfill',next);return next;
  }

  async tailLeadEvents(limit=100) {
    const state=await this.getState('lead_events_cursor',{id:0});
    const size=Math.min(250,Math.max(10,Number(limit)||100));
    const r=await this.pool.query('SELECT id,lead_id,event_type,payload,extract(epoch from recorded_at)::bigint AS at FROM lead_events WHERE id>$1 ORDER BY id ASC LIMIT $2',[Math.trunc(num(state.id)),size]);
    if(!r.rows.length)return state;
    const c=await this.pool.connect();
    try{
      await c.query('BEGIN');
      for(const x of r.rows){const after=x.payload?.after;if(after)await this.upsertProjectionRow(c,{...after,id:x.lead_id},{eventKey:`lead-event:${x.id}`,eventType:String(x.event_type||'lead_event')});}
      await c.query('COMMIT');
    }catch(err){await c.query('ROLLBACK').catch(()=>{});throw err}finally{c.release()}
    const next={id:Number(r.rows[r.rows.length-1].id),updatedAt:Date.now()};await this.setState('lead_events_cursor',next);return next;
  }

  async expireBrowserPending() {
    if(Date.now()-this.lastBrowserExpiryAt<5*60*1000)return 0;
    this.lastBrowserExpiryAt=Date.now();
    const r=await this.pool.query(`UPDATE notification_history SET payload=jsonb_set(jsonb_set(payload,'{channels,browser,status}','\"missed\"'::jsonb,true),'{updatedAt}',to_jsonb($1::bigint),true),updated_at=now()
      WHERE id IN (SELECT id FROM notification_history WHERE COALESCE(payload#>>'{channels,browser,status}','')='pending'
      AND CASE WHEN payload->>'createdAt' ~ '^[0-9]+$' THEN (payload->>'createdAt')::bigint ELSE 0 END < $2 ORDER BY updated_at ASC LIMIT 200)`,[Date.now(),Date.now()-30*60*1000]);
    if(r.rowCount)this.notificationSummaryCache.clear();
    return Number(r.rowCount||0);
  }

  async tick() {
    if(this.busy||!this.storage.enabled)return;
    this.busy=true;this.lastTickAt=Date.now();
    try{
      await this.init();
      await this.flushQueue(100);
      const backfill=await this.backfillBatch(100);
      if(backfill.complete)await this.tailLeadEvents(100);
      await this.expireBrowserPending();
      this.lastError='';
    }finally{this.busy=false}
  }

  _where(settings={},start=1) {
    const managers=uniq(settings.managerFilters||[]),statuses=uniq(settings.statuses||[]),parts=['deleted=false'],params=[];
    if(managers.length){params.push(managers);parts.push(`(lower(responsible_manager)=ANY($${start+params.length-1}::text[]) OR manager_values_lc && $${start+params.length-1}::text[])`)}
    if(statuses.length){params.push(statuses);parts.push(`status_values_lc && $${start+params.length-1}::text[]`)}
    return {sql:parts.join(' AND '),params};
  }

  async getSlaReport(settings={}, {limit=2000}={}) {
    await this.init();
    if(this.queue.size)await this.flushQueue(100).catch(()=>{});
    const started=Date.now(),where=this._where(settings,1),params=[...where.params];
    const answeredSql=`SELECT responsible_manager AS manager,count(*)::bigint AS total,
      count(*)::bigint AS answered,count(*) FILTER(WHERE on_time)::bigint AS on_time,
      count(*) FILTER(WHERE violated)::bigint AS violations,
      COALESCE(sum(working_minutes),0)::bigint AS response_total,count(*)::bigint AS response_count,
      COALESCE(max(working_minutes),0)::bigint AS max_response
      FROM lead_state WHERE ${where.sql} AND waiting=false GROUP BY responsible_manager`;
    const answered=(await this.pool.query(answeredSql,params)).rows;
    const waiting=(await this.pool.query(`SELECT payload FROM lead_state WHERE ${where.sql} AND waiting=true ORDER BY received_at ASC LIMIT 5000`,params)).rows;
    const recentLimit=Math.min(2000,Math.max(100,Number(limit)||2000));
    const recent=(await this.pool.query(`SELECT payload,report_row,waiting FROM lead_state WHERE ${where.sql} ORDER BY received_at DESC,lead_id DESC LIMIT ${recentLimit}`,params)).rows;
    const map=new Map();
    for(const x of answered){map.set(String(x.manager||'Не назначен'),{manager:String(x.manager||'Не назначен'),total:Number(x.total||0),answered:Number(x.answered||0),onTime:Number(x.on_time||0),violations:Number(x.violations||0),waiting:0,responseTotal:Number(x.response_total||0),responseCount:Number(x.response_count||0),maxResponseMinutes:Number(x.max_response||0)})}
    for(const x of waiting){const p=projectLead(x.payload).reportRow,key=String(p.responsibleManager||'Не назначен'),s=map.get(key)||{manager:key,total:0,answered:0,onTime:0,violations:0,waiting:0,responseTotal:0,responseCount:0,maxResponseMinutes:0};s.total++;s.waiting++;if(p.violated)s.violations++;map.set(key,s)}
    const managers=[...map.values()].map(x=>({...x,averageResponseMinutes:x.responseCount?Math.round(x.responseTotal/x.responseCount):0,responseTotal:undefined,responseCount:undefined})).sort((a,b)=>b.violations-a.violations||b.total-a.total||a.manager.localeCompare(b.manager,'ru'));
    const totals=managers.reduce((a,x)=>({total:a.total+x.total,answered:a.answered+x.answered,onTime:a.onTime+x.onTime,violations:a.violations+x.violations,waiting:a.waiting+x.waiting}),{total:0,answered:0,onTime:0,violations:0,waiting:0});
    const rows=recent.map(x=>x.waiting?projectLead(x.payload).reportRow:x.report_row);
    const projection=await this.getState('lead_state_backfill',{cursor:'',complete:false,processed:0});
    return {rows,rowsTotal:totals.total,rowsLimited:totals.total>rows.length,managers,totals,checkedAt:Date.now(),projection:{status:projection.complete?'ready':'building',processed:Number(projection.processed||0),cursor:String(projection.cursor||'')},performance:{mode:'event-state-materialized',queryMs:Date.now()-started,visibleLimit:recentLimit}};
  }

  async getNotificationSummary(names=[],admin=false) {
    await this.init();
    const key=(admin?'admin:':'user:')+uniq(names).join('|'),cached=this.notificationSummaryCache.get(key);
    if(cached&&Date.now()-cached.at<60000)return cached.value;
    const clean=uniq(names),params=[];let where='1=1';
    if(!admin){if(!clean.length)return {total:0,actual:0,historical:0,sent:0,partial:0,pending:0,failed:0};params.push(clean);where+=` AND lower(COALESCE(payload->>'recipientManager',''))=ANY($1::text[])`;}
    const r=await this.pool.query(`SELECT count(*)::bigint AS total,
      count(*) FILTER(WHERE COALESCE(payload->>'historical','false')='true' OR COALESCE(payload->>'overallStatus','')='historical')::bigint AS historical,
      count(*) FILTER(WHERE NOT(COALESCE(payload->>'historical','false')='true' OR COALESCE(payload->>'overallStatus','')='historical'))::bigint AS actual,
      count(*) FILTER(WHERE payload->>'overallStatus'='sent')::bigint AS sent,
      count(*) FILTER(WHERE payload->>'overallStatus'='partial')::bigint AS partial,
      count(*) FILTER(WHERE payload->>'overallStatus'='pending')::bigint AS pending,
      count(*) FILTER(WHERE NOT(COALESCE(payload->>'historical','false')='true' OR COALESCE(payload->>'overallStatus','')='historical') AND COALESCE(payload->>'overallStatus','') NOT IN('sent','partial','pending'))::bigint AS failed
      FROM notification_history WHERE ${where}`,params);
    const x=r.rows[0]||{},value=Object.fromEntries(['total','actual','historical','sent','partial','pending','failed'].map(k=>[k,Number(x[k]||0)]));
    this.notificationSummaryCache.set(key,{at:Date.now(),value});return value;
  }

  invalidateNotificationSummary(){this.notificationSummaryCache.clear()}

  async diagnostics(){
    await this.init();
    const backfill=await this.getState('lead_state_backfill',{cursor:'',complete:false,processed:0}),events=await this.getState('lead_events_cursor',{id:0});
    const counts=await this.pool.query('SELECT (SELECT count(*) FROM lead_state)::bigint AS states,(SELECT count(*) FROM crm_event_log)::bigint AS events');
    return {ready:this.initialized,busy:this.busy,queued:this.queue.size,lastTickAt:this.lastTickAt,lastError:this.lastError,projection:backfill,eventCursor:events,states:Number(counts.rows[0]?.states||0),events:Number(counts.rows[0]?.events||0)};
  }
}

function installEventStatePatches(Storage) {
  if (!Storage || Storage.prototype.__eventStateV2823) return;
  Storage.prototype.__eventStateV2823 = true;
  const originalInit=Storage.prototype.init;
  const originalUpsert=Storage.prototype.upsertLeadJournalBatch;
  const originalDelete=Storage.prototype.markLeadJournalDeleted;
  const originalRestore=Storage.prototype.restoreLeadJournal;
  const originalHistoryUpsert=Storage.prototype.upsertNotificationHistoryRows;
  Storage.prototype.init=async function(...args){const result=await originalInit.apply(this,args);if(this.enabled){this.eventState=this.eventState||new EventStateStore(this);await this.eventState.init();}return result};
  Storage.prototype.upsertLeadJournalBatch=async function(rows,bases){const result=await originalUpsert.call(this,rows,bases);if(this.eventState)this.eventState.enqueueRows(rows);return result};
  Storage.prototype.markLeadJournalDeleted=async function(id,at){const result=await originalDelete.call(this,id,at);if(result&&this.eventState){await this.eventState.pool.query('UPDATE lead_state SET deleted=true,updated_at=now() WHERE lead_id=$1',[String(id)]).catch(()=>{})}return result};
  Storage.prototype.restoreLeadJournal=async function(id){const result=await originalRestore.call(this,id);if(result&&this.eventState){await this.eventState.pool.query('UPDATE lead_state SET deleted=false,updated_at=now() WHERE lead_id=$1',[String(id)]).catch(()=>{})}return result};
  Storage.prototype.upsertNotificationHistoryRows=async function(rows,options){const result=await originalHistoryUpsert.call(this,rows,options);if(this.eventState)this.eventState.invalidateNotificationSummary();return result};
  Storage.prototype.getSlaProjectionReport=async function(settings,options){if(!this.eventState)this.eventState=new EventStateStore(this);return this.eventState.getSlaReport(settings,options)};
  Storage.prototype.getNotificationHistorySummaryCached=async function(names,admin){if(!this.eventState)this.eventState=new EventStateStore(this);return this.eventState.getNotificationSummary(names,admin)};
  Storage.prototype.getEventStateDiagnostics=async function(){if(!this.eventState)this.eventState=new EventStateStore(this);return this.eventState.diagnostics()};
}

module.exports={EventStateStore,installEventStatePatches,projectLead};
