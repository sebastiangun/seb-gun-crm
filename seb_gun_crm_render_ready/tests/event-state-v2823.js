'use strict';
process.env.DB_IMPORT_ON_START='0';
const {PGlite}=require('@electric-sql/pglite');
const assert=require('node:assert/strict'),path=require('path');
const {Storage}=require('../lib/postgres-storage');
const {installEventStatePatches}=require('../lib/event-state-store');
installEventStatePatches(Storage);

(async()=>{
  const engine=new PGlite();
  const query=async(sql,args)=>{
    if(sql.includes('pg_advisory_xact_lock'))return {rows:[],rowCount:1};
    if(!args&&sql.includes('CREATE TABLE')){await engine.exec(sql);return {rows:[],rowCount:0};}
    const r=await engine.query(sql,args);return {...r,rowCount:/^SELECT/i.test(sql.trim())?r.rows.length:r.affectedRows};
  };
  const pool={query,connect:async()=>({query,release(){}}),end:()=>engine.close(),totalCount:1,idleCount:1,waitingCount:0};
  const db=new Storage(path.join(__dirname,'..'),{pool});await db.init();db.eventState.stop();

  const common={workDays:[1,2,3,4,5,6,7],workStart:'00:00',workEnd:'23:59',timezone:'Europe/Moscow',slaMinutes:8,violationMinutes:20,managerHistory:[],statusHistory:[],incomingTexts:[]};
  const now=Math.floor(Date.now()/1000);
  const answered={...common,id:'lead-test-answered',peerId:101,receivedAt:now-600,answeredAt:now-300,manager:'Дарья',currentManager:'Дарья',crmStatus:'Цена озвучена',currentCrmStatus:'Цена озвучена',status:'answered',updatedAt:Date.now()};
  const waiting={...common,id:'lead-test-waiting',peerId:102,receivedAt:now-1800,answeredAt:0,manager:'Иван',currentManager:'Иван',crmStatus:'Диагностика',currentCrmStatus:'Диагностика',status:'waiting',updatedAt:Date.now()};
  await db.upsertLeadJournalBatch([answered,waiting],new Map());
  await db.eventState.flushQueue(20);

  const report=await db.getSlaProjectionReport({managerFilters:[],statuses:[],workDays:[1,2,3,4,5,6,7],workStart:'00:00',workEnd:'23:59',timezone:'Europe/Moscow',slaMinutes:8,violationMinutes:20},{limit:100});
  assert.equal(report.performance.mode,'event-state-materialized');
  assert.ok(report.totals.total>=2);
  assert.ok(report.rows.some(x=>x.id==='lead-test-answered'));
  assert.ok(report.rows.some(x=>x.id==='lead-test-waiting'));

  const eventCount=Number((await query('SELECT count(*)::bigint AS c FROM crm_event_log')).rows[0].c);assert.ok(eventCount>=2);
  const stateCount=Number((await query('SELECT count(*)::bigint AS c FROM lead_state')).rows[0].c);assert.ok(stateCount>=2);

  const delivery={id:'delivery-v2823',recipientManager:'Дарья',createdAt:Date.now(),overallStatus:'sent',historical:false,channels:{telegram:{status:'sent'},browser:{status:'not_requested'}}};
  await db.upsertNotificationHistoryRows([delivery]);
  const summary=await db.getNotificationHistorySummaryCached(['Дарья'],false);assert.equal(summary.sent,1);assert.equal(summary.total,1);

  assert.equal(await db.markLeadJournalDeleted('lead-test-answered'),true);
  assert.equal((await query("SELECT deleted FROM lead_state WHERE lead_id='lead-test-answered'")).rows[0].deleted,true);
  assert.equal(await db.restoreLeadJournal('lead-test-answered'),true);
  assert.equal((await query("SELECT deleted FROM lead_state WHERE lead_id='lead-test-answered'")).rows[0].deleted,false);

  const diag=await db.getEventStateDiagnostics();assert.ok(diag.states>=2);assert.ok(diag.events>=2);
  await db.close();
  console.log('PASS: v28.23 append-only event log, lead_state projection, cached SLA/history reads');
})().catch(e=>{console.error(e);process.exit(1)});
