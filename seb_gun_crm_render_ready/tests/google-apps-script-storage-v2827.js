'use strict';
const assert=require('node:assert/strict'),path=require('path');
process.env.GOOGLE_SPREADSHEET_ID='sheet-test';
process.env.GOOGLE_SHEETS_WEBAPP_URL='https://script.google.com/macros/s/test/exec';
process.env.GOOGLE_SHEETS_API_SECRET='secret-test-12345678901234567890';
process.env.REQUIRE_GOOGLE_STORAGE='1';
process.env.ANALYTICS_PERIOD='2026-09';
process.env.APP_TIMEZONE='Europe/Moscow';
process.env.MONTHLY_AUTO_PREPARE='1';
const memory={Leads:[{lead_id:'legacy-old',received_at:1780000000}],Outbox:[{request_id:'old-outbox'}],Bootstrap:[{key:'dialogs-once'}]};
const headers={};
const jsonResponse=obj=>new Response(JSON.stringify(obj),{status:200,headers:{'Content-Type':'application/json'}});
global.fetch=async(_url,opts={})=>{
  const body=JSON.parse(String(opts.body||'{}'));
  assert.equal(body.secret,process.env.GOOGLE_SHEETS_API_SECRET);
  if(body.action==='health')return jsonResponse({ok:true,spreadsheetId:'sheet-test',spreadsheetName:'seb_gun_crm_storage_2026_09'});
  if(body.action==='setup'){for(const [name,h] of Object.entries(body.schema||{})){headers[name]=h;memory[name]=memory[name]||[];}return jsonResponse({ok:true});}
  if(body.action==='readMany'){const out={};for(const name of body.sheets||[])out[name]=memory[name]||[];return jsonResponse({ok:true,sheets:out});}
  if(body.action==='read')return jsonResponse({ok:true,rows:memory[body.sheet]||[]});
  if(body.action==='clear'){memory[body.sheet]=[];return jsonResponse({ok:true,cleared:1});}
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
  assert.equal(memory.Runtime.find(x=>x.key==='storage_version')?.value,'28.27');
  assert.equal(memory.Runtime.find(x=>x.key==='analytics_period')?.value,'2026-09');
  assert.equal(db.monthlyStatus().rotationRequired,false);
  assert.equal(memory.Leads.length,0,'legacy Leads should be cleared on first monthly prepare');
  assert.equal(memory.Outbox.length,0,'legacy Outbox should be cleared on first monthly prepare');
  assert.equal(memory.Bootstrap.length,0,'legacy Bootstrap should be cleared on first monthly prepare');
  assert.equal(memory.QuickPhrases.length,185,'quick phrases should seed into Google Sheets');
  assert.equal(db.getQuickPhraseGroups().length,27);

  const merged=mergeJournalLoose({id:'a',managerHistory:[{manager:'A'}],statusHistory:[],incomingTexts:['one'],updatedAt:1},{id:'a',managerHistory:[{manager:'B'}],statusHistory:[{status:'New'}],incomingTexts:['two'],updatedAt:2,currentManager:'B'});
  assert.equal(merged.currentManager,'B');assert.equal(merged.managerHistory.length,2);

  const received=Math.floor(Date.parse('2026-09-06T12:00:00Z')/1000),answered=received+10*60;
  const lead={id:'lead-1',peerId:101,name:'Анна',manager:'Дарья',currentManager:'Дарья',crmStatus:'Диагностика',currentCrmStatus:'Диагностика',receivedAt:received,answeredAt:answered,updatedAt:Date.now(),managerHistory:[],statusHistory:[],incomingTexts:['Привет'],workDays:[1,2,3,4,5,6,7],workStart:'00:00',workEnd:'23:59',timezone:'UTC',slaMinutes:8,violationMinutes:20};
  const first=await db.upsertLeadJournalBatch([lead]);
  assert.equal(first.events,1);
  assert.equal(memory.Leads[0].working_minutes,10);
  const august={...lead,id:'lead-aug',receivedAt:Math.floor(Date.parse('2026-08-31T12:00:00Z')/1000)};
  const old=await db.upsertLeadJournalBatch([august]);
  assert.equal(old.skippedPeriod,1,'previous month must not enter monthly analytics');
  assert.equal(memory.Leads.some(x=>x.lead_id==='lead-aug'),false);

  const eventCount=memory.LeadEvents.length;
  const second=await db.upsertLeadJournalBatch([{...lead,updatedAt:Date.now()+5000}]);
  assert.equal(second.events,0,'updatedAt-only refresh must not create LeadEvents noise');
  assert.equal(memory.LeadEvents.length,eventCount);

  const bootstrapPath=path.join(__dirname,'..','data','dialog-bootstrap-v2819.json');
  await db.writeDocument(bootstrapPath,{status:'running',currentBatchEnd:77,processedDialogs:71,totalDialogs:200,failedDialogs:3,lastPeerId:101,analyticsPeriod:'2026-09'});
  const bootstrapRow=memory.Bootstrap.find(x=>x.key==='dialogs-once');
  assert.equal(bootstrapRow.offset,77);
  assert.equal(bootstrapRow.processed,71);
  assert.equal(bootstrapRow.errors,3);

  await db.observeClients('manager@example.com',[{id:55,fullName:'Ирина',phone:'+79990000000',email:'i@example.com',city:'Москва',crmStatus:'Заявка',manager:'0.1 Сергей К.',nextContactDate:'2026-09-08',social:{vkId:225479545},tags:[{name:'КС'}]}]);
  const cached=db.cachedClients({login:'manager@example.com',limit:100});
  assert.equal(cached.total,1);assert.equal(cached.customers[0].fullName,'Ирина');
  assert.equal(db.cachedClientsByVkIds('manager@example.com',[225479545]).length,1);

  const delivery={id:'n1',eventType:'sla_warning',peerId:101,recipientManager:'Дарья',createdAt:Date.parse('2026-09-06T12:00:00Z'),updatedAt:Date.now(),overallStatus:'sent',channels:{telegram:{status:'sent'},browser:{status:'not_requested'}}};
  await db.upsertNotificationHistoryRows([delivery]);
  assert.equal((await db.getNotificationHistorySummary({names:['Дарья'],admin:false})).total,1);
  const oldDelivery={...delivery,id:'n-old',createdAt:Date.parse('2026-08-20T12:00:00Z')};
  await db.upsertNotificationHistoryRows([oldDelivery]);
  assert.equal(memory.Notifications.some(x=>x.notification_id==='n-old'),false);

  const h=await db.health();assert.equal(h.ready,true);assert.equal(h.monthly.period,'2026-09');

  // A copied previous-month sheet can be activated safely: analytics is cleared,
  // while QuickPhrases/settings/client cache survive the monthly rollover.
  db.sheetPeriod='2026-08';db.rotationRequired=true;
  const activated=await db.startCurrentMonth();
  assert.equal(activated.rotationRequired,false);
  assert.equal(activated.sheetPeriod,'2026-09');
  assert.equal(memory.Leads.length,0);assert.equal(memory.LeadEvents.length,0);assert.equal(memory.Notifications.length,0);assert.equal(memory.Outbox.length,0);assert.equal(memory.Bootstrap.length,0);
  assert.equal(memory.QuickPhrases.length,185);assert.equal(memory.ClientsCache.length,1);
  assert.equal(memory.Runtime.find(x=>x.key==='analytics_period')?.value,'2026-09');
  console.log('PASS: v28.27 monthly Sheets analytics + QuickPhrases + ClientsCache semantics');
})().catch(e=>{console.error(e);process.exit(1)});
