'use strict';
const fs=require('fs'),path=require('path'),root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const server=read('server.js'),pkg=JSON.parse(read('package.json')),more=read('frontend/src/views/MoreView.vue'),css=read('frontend/src/assets/base.css');
function must(value,message){if(!value)throw new Error(message)}
must(/^28\.(6|7|8|9|10|11|12|13|14)\.0$/.test(pkg.version)&&/const VERSION = '28\.(6|7|8|9|10|11|12|13|14)'/.test(server),'version mismatch');
must(css.includes('*::-webkit-scrollbar')&&css.includes('scrollbar-width:auto'),'global visible scrollbar missing');
must(css.includes('overflow-x:hidden;overflow-y:auto;background:var(--bg)'),'desktop page scrolling is still blocked');
must(server.includes('refreshTelegramBotIdentity')&&server.includes("telegramCall('getMe')")&&server.includes('activeTelegramBotUsername'),'automatic Telegram bot identity missing');
must(more.includes('Telegram-бот ещё не настроен на сервере')&&more.includes('Открыть Render Environment'),'Telegram setup guidance missing');
must(more.includes("!manager||!botConfigured"),'connect button must be disabled until token is configured');
console.log('v28.6 integration checks: OK (scrollbars on every device, desktop page scroll, Telegram setup diagnostics)');
