'use strict';
const fs=require('fs'),path=require('path'),root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const server=read('server.js'),pkg=JSON.parse(read('package.json')),more=read('frontend/src/views/MoreView.vue'),notifications=read('frontend/src/views/NotificationsView.vue'),render=read('render.yaml');
function must(value,message){if(!value)throw new Error(message)}
must(/^28\.(10|11)\.0$/.test(pkg.version)&&/const VERSION = '28\.(10|11)'/.test(server),'version mismatch');
must(server.includes('Менеджер лида: ${leadManager}')&&server.includes('CRM-статус: ${crmStatus}')&&server.includes('Получатель уведомления: ${r.manager}'),'Telegram alert must identify the actual lead manager, CRM status and recipient');
must(server.includes('selectedManagers.length?selectedManagers:(manager?[manager]:[])'),'empty and legacy notification rules must default to the rule owner');
must(server.includes('Менеджер: ${row.manager||names[0]')&&server.includes('Клиент: ${who}'),'stuck outgoing alert must identify its manager');
must(notifications.includes('Для работы при закрытом телефоне и компьютере')&&notifications.includes('CRM_NOTIFICATION_SECRET'),'background setup guidance missing');
must(/v28\.(10|11) Vue/.test(more)&&render.includes('npm run test:v2810'),'release wiring missing');
must(!/TELEGRAM_BOT_TOKEN\s*=\s*['"][^'"]{20,}['"]/.test(server),'Telegram token must not be embedded');
console.log('v28.10 integration checks: OK (actual lead manager in Telegram, own-manager migration, setup guidance)');
