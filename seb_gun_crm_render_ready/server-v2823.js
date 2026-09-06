'use strict';

// v28.23 deliberately keeps server.js as the proven BlueSales/VK/UI base and
// replaces only the expensive reporting paths at runtime. This makes rollback
// trivial while moving SLA/history reads to an append-only event log + state table.
const fs = require('fs');
const path = require('path');
const Module = require('module');
const { Storage } = require('./lib/postgres-storage');
const { installEventStatePatches } = require('./lib/event-state-store');

installEventStatePatches(Storage);

const serverPath = path.join(__dirname,'server.js');
let source = fs.readFileSync(serverPath,'utf8');

function replaceOne(label, pattern, replacement) {
  const before = source;
  source = source.replace(pattern,replacement);
  if (source === before) throw new Error(`v28.23 source patch not applied: ${label}`);
}

replaceOne('version',"const VERSION = '28.22';","const VERSION = '28.23';");

replaceOne('SLA materialized report',
  /async function computeSlaReportDirect\(session,settings\)\{[\s\S]*?\n\}\nasync function buildSlaReport/,
`async function computeSlaReportDirect(session,settings){
  const data=await storage.getSlaProjectionReport(settings,{limit:2000});
  return {
    settings,
    ...data,
    bootstrap:readDialogBootstrapState(),
    refresh:{mode:'event-log-state',running:slaRecentSyncRunning,lastStartedAt:slaRecentSyncLastAt,minIntervalMs:SLA_RECENT_SYNC_MIN_MS},
    performance:{...(data.performance||{}),backend:'append-only-event-log+lead-state'}
  };
}
async function buildSlaReport`);

replaceOne('notification history read-only',
  /  if \(pathname === '\/api\/notifications\/history' && req\.method === 'GET'\) \{[\s\S]*?\n  \}\n  if \(pathname === '\/api\/notifications\/browser-pending'/,
`  if (pathname === '/api/notifications/history' && req.method === 'GET') {
    try{
      const names=notificationActorNames(s),admin=isAdminSession(s),backfill=readNotificationHistoryBackfillState();
      if(storage.enabled){
        const started=Date.now();
        const [rows,summary]=await Promise.all([
          storage.getNotificationHistoryRows({names,admin,limit:1500}),
          storage.getNotificationHistorySummaryCached(names,admin)
        ]);
        return sendJson(res,200,{ok:true,rows,rowsTotal:summary.total,rowsLimited:summary.total>rows.length,summary,backfill,bootstrap:readDialogBootstrapState(),storage:'postgresql',performance:{mode:'direct-sql-cached-summary',queryMs:Date.now()-started,limit:1500}});
      }
      const store=await readNotificationStore(['deliveryLog']),allRows=notificationDeliveryRows(store,s,{admin}),rows=allRows.slice(0,1500);
      return sendJson(res,200,{ok:true,rows,rowsTotal:allRows.length,rowsLimited:allRows.length>rows.length,summary:notificationHistorySummary(allRows),backfill,bootstrap:readDialogBootstrapState(),storage:'json'});
    }catch(err){return handleApiError(res,err)}
  }
  if (pathname === '/api/notifications/browser-pending'`);

// The event-state worker expires stale browser deliveries in the background.
// Avoid turning a read-only history request into UPDATE work.
source = source.replace(/await storage\.expireStaleBrowserPending\([^;]+;?/g,'');

// Keep recent VK reconciliation, but at a calmer default on small Render plans.
if (!process.env.SLA_RECENT_SYNC_MIN_MS) process.env.SLA_RECENT_SYNC_MIN_MS = '300000';

const compiled = new Module(serverPath, module.parent || module);
compiled.filename = serverPath;
compiled.paths = Module._nodeModulePaths(__dirname);
compiled._compile(source,serverPath);
