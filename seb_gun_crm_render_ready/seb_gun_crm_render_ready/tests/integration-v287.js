'use strict';
const fs=require('fs'),path=require('path'),root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const server=read('server.js'),pkg=JSON.parse(read('package.json')),composer=read('frontend/src/components/Composer.vue'),admin=read('frontend/src/views/AdminView.vue'),dialogs=read('frontend/src/stores/dialogs.js'),api=read('frontend/src/services/api.js'),router=read('frontend/src/router/index.js'),more=read('frontend/src/views/MoreView.vue'),css=read('frontend/src/assets/base.css');
function must(v,m){if(!v)throw new Error(m)}
must(/^28\.(7|8|9)\.0$/.test(pkg.version)&&/const VERSION = '28\.(7|8|9)'/.test(server),'version mismatch');
must(composer.includes('resizeInput')&&composer.includes("el.style.height = 'auto'")&&composer.includes('overflowY'),'composer must grow and then scroll');
must(router.includes("/admin/:section?")&&more.includes('session.isAdmin'),'admin routes must only be advertised to admins');
must(admin.includes('Быстрые фразы')&&admin.includes('Пользователи')&&admin.includes('CRM-статусы'),'admin tabs missing');
must(api.includes('adminPhrases')&&api.includes('updateAdminUser')&&api.includes('updateAdminStatus'),'admin API client missing');
must(server.includes("'/api/admin/statuses'")&&server.includes('loadStatusColorOverrides'),'status admin missing');
must(server.includes("index!==null&&index!==''&&Number.isFinite(Number(index))"),'phrase end/start movement must not be mistaken for index zero');
must(dialogs.includes('count: 75')&&dialogs.includes('attempt < 3')&&dialogs.includes('resumeRemaining'),'dialog 502 recovery missing');
must(css.includes('.admin-editor-scroll')&&css.includes('.background-retry'),'responsive admin styles missing');
must(!/TELEGRAM_BOT_TOKEN\s*=\s*['"][^'"]{20,}['"]/.test(server),'Telegram token must not be embedded');
console.log('v28.7 integration checks: OK (growing composer, admin tabs, dialog 502 recovery)');
