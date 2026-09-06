process.env.DB_IMPORT_ON_START='0';
const {PGlite}=require('@electric-sql/pglite');
const {Storage}=require('../lib/postgres-storage');
const assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
(async()=>{
 const engine=new PGlite();
 // PGlite executes PostgreSQL SQL in WASM. Advisory locks are stubbed here;
 // this test validates stale snapshots, not TCP pooling or multi-process locks.
 const query=async(sql,args)=>{if(sql.includes('pg_advisory_xact_lock'))return {rows:[],rowCount:1};if(!args&&sql.includes('CREATE TABLE')){await engine.exec(sql);return {rows:[],rowCount:0};}const r=await engine.query(sql,args);return {...r,rowCount:/^SELECT/i.test(sql)?r.rows.length:r.affectedRows};};
 const pool={query,connect:async()=>({query,release(){}}),end:()=>engine.close()};
 const root=path.join(__dirname,'..');
 const db=new Storage(root,{pool});await db.init();
 const defaults=()=>({rules:[],journal:{},outbox:{},notified:{},pairCodes:{},deletedJournal:{},deliveryLog:{}});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'crm-import-'));
 const fixture=defaults();fixture.journal.a={id:'a',peerId:123,manager:'one',status:'waiting',managerHistory:[]};
 fs.writeFileSync(path.join(dir,'notification-settings.json'),JSON.stringify(fixture));fs.writeFileSync(path.join(dir,'user-access.json'),'{"users":[]}');
 assert.equal((await db.importDirectory(dir)).rows,1);assert.equal((await db.importDirectory(dir)).alreadyImported,true);
 let first=await db.readNotifications(defaults()),second=await db.readNotifications(defaults());
 first.journal.a.status='answered';first.journal.a.responseText='Reply';await db.writeNotifications(first);
 second.journal.a.manager='two';await db.writeNotifications(second);
 let current=await db.readNotifications(defaults());assert.equal(current.journal.a.status,'answered');assert.equal(current.journal.a.manager,'two');
 first=await db.readNotifications(defaults());second=await db.readNotifications(defaults());first.journal.a.manager='three';second.journal.a.manager='four';await db.writeNotifications(first);await assert.rejects(db.writeNotifications(second),{code:'STORAGE_CONFLICT'});
 // v28.22 direct SQL / incremental paths.
 const peerRows=await db.readLeadJournalByPeer(123);assert.equal(peerRows.length,1);assert.equal(peerRows[0].payload.manager,'four');
 let scanned=0;await db.scanLeadJournal(async rows=>{scanned+=rows.length},{batchSize:50});assert.equal(scanned,1);
 const recent=await db.readLeadJournalRecent(10);assert.equal(recent.length,1);
 await db.markLeadJournalAnswered(123,2000000000,{responseText:'Direct reply',responseAuthor:'tester'});assert.equal((await db.readLeadJournalByPeer(123))[0].payload.status,'answered');
 const delivery={id:'delivery-test',recipientManager:'one',createdAt:Date.now(),overallStatus:'sent',historical:false,channels:{telegram:{status:'sent'},browser:{status:'sent'}}};
 await db.upsertNotificationHistoryRows([delivery]);assert.equal((await db.getNotificationHistoryRows({names:['one'],admin:false,limit:10})).length,1);assert.equal((await db.getNotificationHistorySummary({names:['one'],admin:false})).sent,1);
 const pending={id:'delivery-pending',recipientManager:'one',createdAt:Date.now()-3600000,overallStatus:'pending',historical:false,channels:{telegram:{status:'not_requested'},browser:{status:'pending'}}};await db.upsertNotificationHistoryRows([pending]);assert.equal((await db.getBrowserPendingNotifications({names:['one'],limit:10})).length,1);await db.expireStaleBrowserPending(Date.now()-1800000,10);assert.equal((await db.getNotificationHistoryById('delivery-pending')).channels.browser.status,'missed');
 current=await db.readNotifications(defaults());delete current.journal.a;current.deletedJournal.a=Date.now();await db.writeNotifications(current);assert.equal(Object.keys((await db.readNotifications(defaults())).journal).length,0);assert.equal((await query('SELECT count(*) FROM lead_journal')).rows[0].count,1);assert.equal((await db.readLeadJournalByPeer(123)).length,0);assert.equal(await db.restoreLeadJournal('a'),true);assert.equal((await db.readLeadJournalByPeer(123)).length,1);await db.markLeadJournalDeleted('a');
 assert.equal(await db.claimCreate('vk:123'),true);assert.equal(await db.claimCreate('vk:123'),false);
 await db.saveSession('abc','sealed',Date.now()+60000);assert.equal(await db.loadSession('abc'),'sealed');const restored=new Storage(root,{pool});await restored.init();assert.equal(await restored.loadSession('abc'),'sealed');await db.deleteSession('abc');assert.equal(await db.loadSession('abc'),null);
 await db.observeClients('one',[{id:1,nextContactDate:'2026-09-07',manager:'one'}]);await db.observeClients('one',[{id:1,nextContactDate:'2026-09-09',manager:'two'}]);assert.equal((await query('SELECT count(*) FROM client_events')).rows[0].count,2);assert.equal((await query('SELECT next_contact FROM calendar_events')).rows[0].next_contact,'2026-09-09');
 await db.refreshDocuments();await db.run(async()=>{await db.writeDocument(path.join(root,'data/user-access.json'),{users:[{login:'test'}]});});assert.equal(db.readDocument(path.join(root,'data/user-access.json')).users.length,1);
 await db.applyPhraseUpdate();await db.applyPhraseUpdate();await db.refreshDocuments();assert.ok(db.readDocument(path.join(root,'data/quick_phrases.json')).groups.length>=26);
 await db.close();fs.rmSync(dir,{recursive:true});console.log('PASS: SQL schema, partial snapshots, direct journal/history queries, incremental writes, conflict rollback, audit retention, create deduplication, sessions, calendar, document cache');
})().catch(e=>{console.error(e);process.exit(1)});
