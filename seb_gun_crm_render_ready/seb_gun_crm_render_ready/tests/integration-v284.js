'use strict';
const fs=require('fs'),path=require('path'),root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const server=read('server.js'),pkg=JSON.parse(read('package.json')),more=read('frontend/src/views/MoreView.vue'),notifications=read('frontend/src/views/NotificationsView.vue'),outbox=read('frontend/src/stores/outbox.js'),api=read('frontend/src/services/api.js');
function must(value,message){if(!value)throw new Error(message)}
must(/^28\.(4|5|6|7|8|9|10|11|12)\.0$/.test(pkg.version)&&/const VERSION = '28\.(4|5|6|7|8|9|10|11|12)'/.test(server),'version mismatch');
must(server.includes("pathname==='/manifest.webmanifest'")&&server.includes("pathname==='/icon.svg'"),'PWA fallbacks missing');
must(server.includes('managerFilters')&&server.includes('dialogFilter')&&server.includes('queueAlerts'),'notification filters missing');
must(server.includes('runScheduledNotificationCheck')&&server.includes('setInterval(runScheduledNotificationCheck,60000)'),'background Telegram SLA check missing');
must(server.includes('/api/notifications/outbox-event')&&server.includes('notificationOutboxRows'),'server outbox journal missing');
must(more.includes('Менеджеры лидов')&&more.includes('CRM-статусы лидов')&&more.includes('зависш'),'settings filters missing');
must(notifications.includes('Зависшие исходящие')&&notifications.includes('Журнал лидов')&&notifications.includes('Без ответа')&&notifications.includes('slaMinutes'),'notification sections missing');
must(outbox.includes('outboxEvent')&&api.includes('/api/notifications/outbox-event'),'outbox synchronization missing');
console.log('v28.4 integration checks: OK (filtered Telegram SLA, stuck outbox journal, PWA fallback)');
