'use strict';
const fs=require('fs'),path=require('path'),root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const server=read('server.js'),pkg=JSON.parse(read('package.json')),app=read('frontend/src/App.vue'),more=read('frontend/src/views/MoreView.vue'),clock=read('frontend/src/components/MoscowClock.vue'),css=read('frontend/src/assets/base.css');
function must(value,message){if(!value)throw new Error(message)}
must(/^28\.(5|6|7|8|9|10|11)\.0$/.test(pkg.version)&&/const VERSION = '28\.(5|6|7|8|9|10|11)'/.test(server),'version mismatch');
must(server.includes("'10:00'")&&server.includes("'22:00'")&&server.includes("'Europe/Moscow'"),'Moscow workday defaults missing');
must(more.includes('Через сколько рабочих минут уведомить')&&more.includes('v-model.number="form.slaMinutes"'),'configurable SLA field missing');
must(more.includes('Отправлять в Telegram, если лид долго без ответа')&&more.includes('v-model="form.enabled"'),'Telegram lead toggle missing');
must(more.includes('Начало рабочего дня, МСК')&&more.includes('Конец рабочего дня, МСК'),'Moscow work hours fields missing');
must(clock.includes("timeZone:'Europe/Moscow'")&&app.includes('<MoscowClock />')&&css.includes('.moscow-clock'),'visible Moscow clock missing');
console.log('v28.5 integration checks: OK (configurable SLA, 10:00–22:00 MSK, Telegram toggle, Moscow clock)');
