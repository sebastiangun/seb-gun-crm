'use strict';
const assert=require('node:assert/strict'),path=require('path');
process.env.GOOGLE_SPREADSHEET_ID='sheet-test';
process.env.GOOGLE_SHEETS_WEBAPP_URL='https://script.google.com/macros/s/test/exec';
process.env.GOOGLE_SHEETS_API_SECRET='secret-test-12345678901234567890';
process.env.REQUIRE_GOOGLE_STORAGE='1';
const memory={};
const headers={};
const jsonResponse=obj=>new Response(JSON.stringify(obj),{status:200,headers:{'Content-Type':'application/json'}});
global.fetch=async(_url,opts={})=>{
  const body=JSON.parse(String(opts.body||'{}'));
  assert.equal(body.secret,process.env.GOOGLE_SHEETS_API_SECRET);
  if(body.action==='health')return jsonResponse({ok:true,spreadsheetId:'sheet-test'});
  if(body.action==='setup'){for(const [name,h] of Object.entries(body.schema||{})){headers[name]=h;memory[name]=memory[name]||[];}return jsonResponse({ok:true});}
  if(body.action==='readMany'){const out={};for(const name of body.sheets||[])out[name]=memory[name]||[];return jsonResponse({ok:true,sheets:out});}
  if(body.action==='read')return jsonResponse({ok:true,rows:memory[body.sheet]||[]});
  if(body.action==='upsertMany'){
    const list=memory[body.sheet]||(memory[body.sheet]=[]),key=body.keyField;
    for(const row of body.rows||[]){const i=list.findIndex(x=>String(x[key])===String(row[key]));if(i>=0)list[i]={...row};else list.push({...row});}
    return jsonResponse({ok:true,written:(body.rows||[]).length});
  }
  if(body.action==='delete'){
    const list=memory[body.sheet]||(memory[body.sheet]=[]),i=list.findIndex(x=>String(x[body.keyField])===String(body.value));
    if(i>=0){list.splice(i,1);return jsonResponse({ok:true,deleted:true});}
    return jsonResponse({ok:true,deleted:false});
  }
  return jsonResponse({ok:false,error:'unknown action'});
};
const {Storage,mergeJournalLoose}=require('../lib/google-sheets-storage');
(async()=>{
  const db=new Storage(path.join(__dirname,'..'));
  assert.equal(db.enabled,true);
  await db.init();
  assert.equal(memory.Runtime.find(x=>x.key==='storage_version')?.value,'28.26');
  const merged=mergeJournalLoose({id:'a',managerHistory:[{manager:'A'}],statusHistory:[],incomingTexts:['one'],updatedAt:1},{id:'a',managerHistory:[{manager:'B'}],statusHistory:[{status:'New'}],incomingTexts:['two'],updatedAt:2,currentManager:'B'});
  assert.equal(merged.currentManager,'B');assert.equal(merged.managerHistory.length,2);

  const received=Math.floor(Date.parse('2026-09-06T12:00:00Z')/1000),answered=received+10*60;
  const lead={id:'lead-1',peerId:101,name:'Анна',manager:'Дарья',currentManager:'Дарья',crmStatus:'Диагностика',currentCrmStatus:'Диагностика',receivedAt:received,answeredAt:answered,updatedAt:Date.now(),managerHistory:[],statusHistory:[],incomingTexts:['Привет'],workDays:[1,2,3,4,5,6,7],workStart:'00:00',workEnd:'23:59',timezone:'UTC',slaMinutes:8,violationMinutes:20};
  const first=await db.upsertLeadJournalBatch([lead]);
  assert.equal(first.events,1);
  assert.equal(memory.Leads[0].work_start,'00:00');
  assert.equal(memory.Leads[0].work_end,'23:59');
  assert.equal(memory.Leads[0].working_minutes,10);
  assert.equal(memory.Leads[0].sla_warning,true);
  assert.equal(memory.Leads[0].sla_violation,false);
  const eventCount=memory.LeadEvents.length;
  const second=await db.upsertLeadJournalBatch([{...lead,updatedAt:Date.now()+5000}]);
  assert.equal(second.events,0,'updatedAt-only refresh must not create LeadEvents noise');
  assert.equal(memory.LeadEvents.length,eventCount);
  assert.equal((await db.readLeadJournalByPeer(101)).length,1);

  const bootstrapPath=path.join(__dirname,'..','data','dialog-bootstrap-v2819.json');
  await db.writeDocument(bootstrapPath,{status:'running',offset:77,processed:77,totalDialogs:200,lastPeerId:101});
  assert.equal(memory.Bootstrap.find(x=>x.key==='dialogs-once')?.processed,77);
  assert.equal(db.readDocument(bootstrapPath).offset,77);
  const slaPath=path.join(__dirname,'..','data','sla-report-settings.json');
  await db.writeDocument(slaPath,{version:1,profiles:{admin:{managerFilters:['Дарья'],statuses:['Диагностика'],workDays:[1,2,3,4,5,6,7],workStart:'09:30',workEnd:'21:45',slaMinutes:8,violationMinutes:20,timezone:'Europe/Moscow'}}});
  assert.equal(memory.SLASettings.find(x=>x.setting_id==='admin')?.work_start,'09:30');
  assert.equal(memory.SLASettings.find(x=>x.setting_id==='admin')?.work_end,'21:45');

  const delivery={id:'n1',eventType:'sla_warning',peerId:101,recipientManager:'Дарья',createdAt:Date.now(),updatedAt:Date.now(),overallStatus:'sent',channels:{telegram:{status:'sent'},browser:{status:'not_requested'}}};
  await db.upsertNotificationHistoryRows([delivery]);
  const summary=await db.getNotificationHistorySummary({names:['Дарья'],admin:false});
  assert.equal(summary.total,1);assert.equal(summary.sent,1);
  assert.equal(await db.markLeadJournalDeleted('lead-1'),true);
  assert.equal((await db.readLeadJournalByPeer(101)).length,0);
  assert.equal(await db.restoreLeadJournal('lead-1'),true);
  assert.equal((await db.readLeadJournalByPeer(101)).length,1);
  const h=await db.health();assert.equal(h.ready,true);assert.equal(h.mode,'google-apps-script');
  console.log('PASS: v28.26 Apps Script storage SLA/text-clock/dedupe/bootstrap semantics');
})().catch(e=>{console.error(e);process.exit(1)});
