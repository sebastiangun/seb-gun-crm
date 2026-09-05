'use strict';
const fs=require('fs'),path=require('path'),root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const server=read('server.js'),pkg=JSON.parse(read('package.json')),notifications=read('frontend/src/views/NotificationsView.vue'),admin=read('frontend/src/views/AdminView.vue'),api=read('frontend/src/services/api.js'),browser=read('frontend/src/stores/browserNotifications.js'),render=read('render.yaml');
function must(value,message){if(!value)throw new Error(message)}
must(/^28\.(12|13|14|15|16)\.0$/.test(pkg.version)&&/const VERSION = '28\.(12|13|14|15|16)'/.test(server),'version mismatch');
must(server.includes('notificationJournalUpsert')&&server.includes('firstOutgoingReplyAfter')&&server.includes('markNotificationJournalAnswered'),'notification journal lifecycle missing');
must(server.includes("row.status='answered'")&&server.includes('row.answeredAt=')&&notifications.includes("dateTime(d.answeredAt)"),'answered status and timestamp missing');
must(server.includes("/api/admin/notification-journal")&&server.includes('requireAdminSession(s,res)')&&api.includes('deleteAdminNotificationJournal'),'admin-only journal deletion missing');
must(admin.includes("section==='notifications'")&&admin.includes('removeNotification(row)')&&notifications.includes('Журнал лидов'),'notification journal UI missing');
must(browser.includes("item.status!=='answered'&&item.notificationDue"),'answered journal rows must not trigger browser alerts');
must(render.includes('npm run test:v2812'),'release wiring missing');
console.log('v28.12 integration checks: OK (durable lead journal, answer timestamps, admin deletion)');
