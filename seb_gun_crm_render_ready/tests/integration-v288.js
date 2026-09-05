'use strict';
const fs=require('fs'),path=require('path'),root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const server=read('server.js'),pkg=JSON.parse(read('package.json')),chat=read('frontend/src/stores/chat.js'),bubble=read('frontend/src/components/MessageBubble.vue'),chatView=read('frontend/src/views/ChatView.vue'),phrases=read('frontend/src/stores/phrases.js'),drawer=read('frontend/src/components/PhraseDrawer.vue'),admin=read('frontend/src/views/AdminView.vue'),api=read('frontend/src/services/api.js'),dialogs=read('frontend/src/stores/dialogs.js'),notifications=read('frontend/src/views/NotificationsView.vue');
function must(value,message){if(!value)throw new Error(message)}
must(/^28\.(8|9|10|11|12|13|14|15)\.0$/.test(pkg.version)&&/const VERSION = '28\.(8|9|10|11|12|13|14|15)'/.test(server),'version mismatch');
must(chat.includes('URL.createObjectURL')&&bubble.includes('previewUrl')&&chatView.includes('crm:outbox-sent'),'live sent-photo preview missing');
must(phrases.includes('searchText')&&phrases.includes('load(force = false)')&&drawer.includes('crm:phrases-changed'),'fresh quick-phrase search missing');
must(admin.includes('+ Раздел')&&api.includes('createAdminPhraseGroup')&&server.includes("'/api/admin/phrase-groups'"),'phrase section creation missing');
must(dialogs.includes('all = false')&&!dialogs.includes('guard++ < 40'),'dialogs must not auto-download dozens of pages');
must(server.includes('NOTIFICATION_DEFAULT_CHAT_ID')&&server.includes('/id(?:\\s|$)')&&server.includes('executeNotificationCheck'),'durable Telegram SLA setup missing');
must(notifications.includes('Фоновая проверка')&&notifications.includes('missingEnvironment'),'notification diagnostics missing');
must(!/TELEGRAM_BOT_TOKEN\s*=\s*['"][^'"]{20,}['"]/.test(server),'Telegram token must not be embedded');
console.log('v28.8 integration checks: OK (photo sync, phrase search/sections, paced dialogs, durable Telegram SLA)');
