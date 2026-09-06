'use strict';
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const pkg=require('../package.json');
const server=read('server.js');
const router=read('frontend/src/router/index.js');
const nav=read('frontend/src/components/BottomNav.vue');
const more=read('frontend/src/views/MoreView.vue');
const notifications=read('frontend/src/views/NotificationsView.vue');
const managers=read('frontend/src/views/ManagersView.vue');
const outbox=read('frontend/src/views/OutboxView.vue');
const admin=read('frontend/src/views/AdminView.vue');
const api=read('frontend/src/services/api.js');
const render=read('render.yaml');
function must(value,message){if(!value)throw new Error(message)}

must(pkg.version==='28.17.0'&&server.includes("const VERSION = '28.17'"),'version mismatch');
// Admin must survive a newly-connected DB without an imported user-access document.
must(server.includes('Merge the bundled seed with DB overrides')&&server.includes("fs.readFileSync(userAccessPath(),'utf8')")&&server.includes('if(!persisted)return seed'),'admin seed/DB fallback missing');
must(more.includes('Открыть админку')&&more.includes("session.isAdmin")&&router.includes("/admin/:section?"),'admin UI/route missing');
must(admin.includes('📚 Журнал лидов'),'admin journal naming missing');

// Three distinct control areas.
must(router.includes("path: '/outbox'")&&router.includes("path: '/sla'")&&router.includes("path: '/notifications'"),'separate routes missing');
must(nav.includes("'/sla', '📊', 'Менеджеры'")&&nav.includes("'/notifications', '🔔', 'Уведомления'"),'bottom navigation split missing');
must(outbox.includes('Неотправленные')&&outbox.includes('Зависших сообщений')&&!outbox.includes('Регламент и фильтр отчёта'),'outbox is not isolated');
must(managers.includes('Регламент и фильтр отчёта')&&managers.includes('Нарушений')&&managers.includes('Вовремя')&&managers.includes('Средний ответ'),'manager SLA report missing');
must(managers.includes('Рабочий день от, МСК')&&managers.includes('Рабочий день до, МСК')&&managers.includes('Нарушение регламента после'),'SLA work schedule fields missing');

// Strict notifications: manager + status are mandatory and apply to both SLA and queue/browser alerts.
must(server.includes('function notificationRuleMatchesCustomer')&&server.includes('strictFilters:true')&&server.includes('notificationRuleHasExplicitFilters'),'strict notification matcher missing');
must(server.includes("message:'Для строгих уведомлений выберите хотя бы одного менеджера лида и хотя бы один CRM-статус'"),'strict notification validation missing');
must(server.includes('r.queueAlerts&&r.telegramChatId&&notificationWorkingNow(Date.now(),r)&&notificationRuleMatchesCustomer(r,crm||{})'),'queue alert does not use strict CRM filter');
must(server.includes("allDialogs.filter(d=>!d.lastMessageOut&&notificationRuleMatchesCustomer(rule,d.crm||{}))"),'browser overview does not use strict filter');
must(server.includes('CURRENT CRM manager/status')&&server.includes('notificationRuleMatchesCustomer(rule,{manager:row.currentManager'),'journal can leak historical matches into recipient alerts');
must(notifications.includes('Строгий фильтр')&&notifications.includes('Менеджеры лидов')&&notifications.includes('CRM-статусы')&&notifications.includes('Рабочий день от, МСК'),'notification rule UI incomplete');

// Persistence: every rule setting that affects delivery must survive export/restart, and SLA profile is stored independently.
must(server.includes('violationMinutes:r.violationMinutes')&&server.includes('workDays:r.workDays')&&server.includes('strictFilters:r.strictFilters'),'notification export loses settings');
must(server.includes('sla-report-settings.json')&&server.includes('saveSlaReportSettings')&&server.includes("storage.enabled?'postgresql':'json'"),'SLA settings persistence missing');
must(api.includes('/api/outbox/overview')&&api.includes('/api/sla/settings')&&api.includes('/api/sla/report'),'frontend API wiring missing');

must(render.includes('npm run test:v2817')&&render.includes('REQUIRE_DATABASE')&&render.includes('DATABASE_URL'),'Render release wiring/database requirement missing');
console.log('v28.17 integration checks: OK (admin recovery, separated outbox/SLA/notifications, strict filters, persistent settings)');
