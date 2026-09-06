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
  const merged=mergeJournalLoose({id:'a',managerHistory:[{manager:'A'}],statusHistory:[],incomingTexts:['one'],updatedAt:1},{id:'a',managerHistory:[{manager:'B'}],statusHistory:[{status:'New'}],incomingTexts:['two'],updatedAt:2,currentManager:'B'});
  assert.equal(merged.currentManager,'B');assert.equal(merged.managerHistory.length,2);
  const now=Math.floor(Date.now()/1000);
  await db.upsertLeadJournalBatch([{id:'lead-1',peerId:101,name:'Анна',manager:'Дарья',currentManager:'Дарья',crmStatus:'Диагностика',currentCrmStatus:'Диагностика',receivedAt:now-60,updatedAt:Date.now(),managerHistory:[],statusHistory:[],incomingTexts:['Привет']}]);
  assert.equal((await db.readLeadJournalByPeer(101)).length,1);
  await db.markLeadJournalAnswered(101,now,{responseText:'Ответ'});
  assert.equal((await db.readLeadJournalByPeer(101))[0].payload.answeredAt,now);
  const delivery={id:'n1',eventType:'sla_warning',peerId:101,recipientManager:'Дарья',createdAt:Date.now(),updatedAt:Date.now(),overallStatus:'sent',channels:{telegram:{status:'sent'},browser:{status:'not_requested'}}};
  await db.upsertNotificationHistoryRows([delivery]);
  const summary=await db.getNotificationHistorySummary({names:['Дарья'],admin:false});
  assert.equal(summary.total,1);assert.equal(summary.sent,1);
  await db.writeDocument(path.join(__dirname,'..','data','bootstrap-test.json'),{offset:77});
  assert.equal(db.readDocument(path.join(__dirname,'..','data','bootstrap-test.json')).offset,77);
  assert.equal(await db.markLeadJournalDeleted('lead-1'),true);
  assert.equal((await db.readLeadJournalByPeer(101)).length,0);
  assert.equal(await db.restoreLeadJournal('lead-1'),true);
  assert.equal((await db.readLeadJournalByPeer(101)).length,1);
  const h=await db.health();assert.equal(h.ready,true);assert.equal(h.mode,'google-apps-script');
  console.log('PASS: v28.25 Apps Script storage read/upsert/delete/batch/session-document semantics');
})().catch(e=>{console.error(e);process.exit(1)});
