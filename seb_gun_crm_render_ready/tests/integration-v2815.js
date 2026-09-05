'use strict';
const fs=require('fs'),path=require('path'),root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const pkg=require('../package.json'),server=read('server.js'),notifications=read('frontend/src/views/NotificationsView.vue'),admin=read('frontend/src/views/AdminView.vue'),render=read('render.yaml');
function must(value,message){if(!value)throw new Error(message)}
must(pkg.version==='28.15.0'&&server.includes("const VERSION = '28.15'"),'version mismatch');
must(server.includes('findCustomerByVkEverywhere')&&server.includes("bsCall(session, 'customers.addMany', [createPayload])"),'safe BlueSales create path missing');
must(!server.includes("command:'customers.add'")&&!server.includes("addMany-object"),'duplicate-producing create fallbacks remain');
must(server.includes('pendingCustomerCreates')&&server.includes("'CREATE_PENDING'"),'ambiguous create deduplication missing');
must(server.includes('ingestNotificationJournalMessages')&&server.includes('syncRecentLeadJournal'),'full VK lead-history ingestion missing');
must(server.includes('responseText')&&server.includes('responseAuthor')&&server.includes('managerHistory'),'response or manager history missing');
must(notifications.includes('Дата от')&&notifications.includes('Дата до')&&notifications.includes('managerFilter')&&notifications.includes('statusFilter'),'journal filters missing');
must(notifications.includes('Ответили:')&&notifications.includes('managerPath(d)'),'answer time or manager chain missing');
must(admin.includes('managersPicker')&&admin.includes('MultiFilterSheet'),'phrase manager dropdown missing');
must(render.includes('npm run test:v2815'),'release wiring missing');
console.log('v28.15 integration checks: OK (safe client create, lead history, filters, manager transfers)');
