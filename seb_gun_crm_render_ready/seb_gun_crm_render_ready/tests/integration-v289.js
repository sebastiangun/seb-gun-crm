'use strict';
const fs=require('fs'),path=require('path'),root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const server=read('server.js'),pkg=JSON.parse(read('package.json')),more=read('frontend/src/views/MoreView.vue'),api=read('frontend/src/services/api.js'),env=read('.env.example'),render=read('render.yaml');
function must(value,message){if(!value)throw new Error(message)}
must(/^28\.(9|10|11)\.0$/.test(pkg.version)&&/const VERSION = '28\.(9|10|11)'/.test(server),'version mismatch');
must(server.includes('NOTIFICATION_RULES_JSON')&&server.includes('notificationEnvironmentRuleInputs')&&server.includes('notificationRulesExportValue'),'multi-manager durable rule storage missing');
must(server.includes("'/api/admin/notification-rules-export'")&&server.includes("key:'NOTIFICATION_RULES_JSON'"),'admin rules export endpoint missing');
must(api.includes('exportNotificationRules')&&more.includes('Скопировать для Render'),'admin Render export UI missing');
must(more.includes('manager.value?[manager.value]:[]'),'a new manager must default to their own lead filter');
must(server.includes('canManageNotificationManager')&&more.includes('session.isAdmin?meta.users'),'managers must only connect and edit their own Telegram unless they are admins');
must(env.includes('NOTIFICATION_RULES_JSON=[]')&&render.includes('key: NOTIFICATION_RULES_JSON'),'Render environment declaration missing');
must(!/TELEGRAM_BOT_TOKEN\s*=\s*['"][^'"]{20,}['"]/.test(server),'Telegram token must not be embedded');
console.log('v28.9 integration checks: OK (per-manager Telegram recipients, own filters, durable JSON export)');
