'use strict';
const fs=require('fs'),path=require('path'),root=path.join(__dirname,'..');
const sla=require('../lib/working-sla');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const server=read('server.js'),pkg=JSON.parse(read('package.json')),notifications=read('frontend/src/views/NotificationsView.vue'),render=read('render.yaml');
function must(value,message){if(!value)throw new Error(message)}
function utc(y,m,d,h,min=0,sec=0){return Date.UTC(y,m-1,d,h,min,sec)}
const rule={slaMinutes:8,workStart:'10:00',workEnd:'22:00',timezone:'Europe/Moscow'};
must(/^28\.(13|14|15|16)\.0$/.test(pkg.version)&&/const VERSION = '28\.(13|14|15|16)'/.test(server),'version mismatch');
const night=sla.responseWindow(utc(2026,9,5,19,30),rule);
must(night.outsideHoursAtReceipt&&night.responseStartAt===utc(2026,9,6,7,0)&&night.dueAt===utc(2026,9,6,7,8),'22:30 MSK must start at 10:00 and expire at 10:08 next day');
const morning=sla.responseWindow(utc(2026,9,5,6,50),rule);
must(morning.responseStartAt===utc(2026,9,5,7,0)&&morning.dueAt===utc(2026,9,5,7,8),'09:50 MSK must start at 10:00');
const daytime=sla.responseWindow(utc(2026,9,5,9,0),rule);
must(!daytime.outsideHoursAtReceipt&&daytime.responseStartAt===utc(2026,9,5,9,0)&&daytime.dueAt===utc(2026,9,5,9,8),'12:00 MSK must count immediately');
must(sla.workingMinutesBetween(utc(2026,9,5,19,30),utc(2026,9,6,7,7,59),rule)===7,'night hours must not count toward SLA');
must(sla.workingMinutesBetween(utc(2026,9,5,19,30),utc(2026,9,6,7,8),rule)===8,'lead must become overdue after 8 working minutes');
const shiftEnd=sla.responseWindow(utc(2026,9,5,18,58),rule);
must(shiftEnd.dueAt===utc(2026,9,6,7,6),'21:58 MSK must count two minutes today and six after 10:00 next day');
must(server.includes("slaMinutes:8")&&server.includes("workStart:raw.workStart||'10:00'")&&server.includes("workEnd:raw.workEnd||'22:00'")&&server.includes("NOTIFICATION_DEFAULT_TZ||'Europe/Moscow'"),'default SLA settings missing');
must(server.includes("filter:'unanswered'")&&server.includes("notificationJournalRows(store,{admin:true})"),'journal must collect and return all unanswered leads');
must(server.includes('fallbackRule=safeNotificationRule')&&server.includes('journalRow=notificationJournalUpsert')&&server.includes('!baseRule.enabled||!baseRule.telegramChatId'),'journal collection must not depend on Telegram connection');
must(notifications.includes('Вне рабочего времени')&&notifications.includes('Срок ответа')&&notifications.includes('workingWaitMinutes'),'working SLA explanation missing in journal');
must(render.includes('npm run test:v2813'),'release wiring missing');
console.log('v28.13 integration checks: OK (10:00–22:00 MSK SLA, overnight pause, exact deadline)');
