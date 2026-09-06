'use strict';
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),pkg=require('../package.json');
const server=read('server.js'),storage=read('lib/postgres-storage.js'),sql=read('db/001-storage.sql'),api=read('frontend/src/services/api.js'),more=read('frontend/src/views/MoreView.vue'),render=read('render.yaml');
function must(v,m){if(!v)throw new Error(m)}
must(pkg.version==='28.22.0'&&server.includes("const VERSION = '28.22'"),'version mismatch');
// API requests must not refresh every document before dispatch.
must(server.includes("if (url.pathname.startsWith('/api/')) return await apiRouter(req, res, url)")&&!server.includes("if (url.pathname.startsWith('/api/')) return await storage.run(()=>apiRouter"),'global storage.run still wraps API');
must(storage.includes('do not reload app_documents before every API request')||storage.includes('API requests use the in-memory document cache'),'document cache optimization missing');
must(/async run\(fn,\{fresh=false\}=\{\}\).*if\(fresh\)await this\.refreshDocuments/.test(storage.replace(/\n/g,' ')),'storage.run still refreshes documents unconditionally');
// Critical read endpoints must use direct, bounded SQL helpers.
must(storage.includes('scanLeadJournal')&&storage.includes('readLeadJournalRecent')&&storage.includes('getNotificationHistoryRows')&&storage.includes('getNotificationHistorySummary'),'direct SQL helpers missing');
must(server.includes("performance:{mode:'direct-sql-paged'")&&server.includes('storage.scanLeadJournal')&&server.includes('storage.readLeadJournalRecent(5000)'),'SLA report is not paged/direct SQL');
must(server.includes('storage.getNotificationHistoryRows({names,admin,limit:1500})')&&server.includes('storage.getNotificationHistorySummary({names,admin})'),'notification history still hydrates full store');
// Bootstrap and normal chat journal writes must be incremental per peer.
must(server.includes('ingestNotificationJournalDirect')&&server.includes('storage.readLeadJournalByPeer')&&server.includes('storage.upsertLeadJournalBatch'),'incremental journal helper missing');
const bootstrapBlock=server.slice(server.indexOf('async function runDialogBootstrapOnce'),server.indexOf('function startDialogBootstrapOnce'));
must(bootstrapBlock.includes('ingestNotificationJournalDirect')&&!bootstrapBlock.includes('const store=await readNotificationStore()'),'bootstrap still loads full notification store');
must(server.includes('storage.markLeadJournalAnswered(peerId'),'message reply still hydrates full journal');
// Notification checker must only hydrate small state and persist deliveries directly.
const checkBlock=server.slice(server.indexOf('async function runNotificationCheck'),server.indexOf('let notificationCheckRunning'));
must(checkBlock.includes("readNotificationStore(['rules','notified','outbox'])")&&!checkBlock.includes('readNotificationStore()'),'notification checker loads full store');
must(checkBlock.includes('storage.upsertNotificationHistoryRows(deliveries)'),'delivery history is not written incrementally');
// Historical backfill must use a keyset cursor and bounded batches.
must(server.includes('ensureHistoricalNotificationBackfillDirect')&&server.includes('readLeadJournalPageAfterId(cursorId,50)')&&server.includes('ignoreExisting:true'),'direct historical backfill missing');
// Schema indexes and diagnostics.
must(sql.includes('lead_journal_received_num')&&sql.includes('notification_history_created_num')&&sql.includes('notification_history_browser_status'),'direct-report indexes missing');
must(server.includes("'/api/admin/diagnostics'")&&api.includes('adminDiagnostics')&&more.includes('PostgreSQL и нагрузка'),'diagnostics UI/API missing');
must(more.includes('v28.22 Vue'),'frontend version missing');
must(render.includes('npm run test:v2819'),'Render compatibility gate missing');
console.log('v28.22 integration checks: OK (direct SQL, incremental journal/bootstrap, bounded audit reads, diagnostics)');
