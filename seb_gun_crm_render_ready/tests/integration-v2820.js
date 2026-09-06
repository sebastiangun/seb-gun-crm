'use strict';
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),pkg=require('../package.json');
const server=read('server.js'),api=read('frontend/src/services/api.js'),sla=read('frontend/src/views/ManagersView.vue'),history=read('frontend/src/views/NotificationHistoryView.vue'),more=read('frontend/src/views/MoreView.vue'),notifications=read('frontend/src/views/NotificationsView.vue'),outbox=read('frontend/src/views/OutboxView.vue'),admin=read('frontend/src/views/AdminView.vue'),css=read('frontend/src/assets/base.css');
function must(v,m){if(!v)throw new Error(m)}
must(['28.20.0','28.21.0'].includes(pkg.version)&&/const VERSION = '28\.(20|21)'/.test(server),'version mismatch');
must(server.includes('the report endpoint is intentionally DB-only and fast')&&server.includes('scheduleRecentSlaSync'),'SLA report still blocks on VK history');
must(api.includes('retries = 0')&&api.includes("code:'NETWORK_ERROR'")&&api.includes("slaReport: () => request('/api/sla/report'"),'GET retry / SLA resilience missing');
must(server.includes('ensureHistoricalNotificationBackfill')&&server.includes('historical_backfill_v2820')&&server.includes("overallStatus='historical'"),'historical notification backfill missing');
must(server.includes('Нельзя достоверно утверждать')&&server.includes('notificationHistorySummary'),'historical audit disclaimer/summary missing');
must(sla.includes('bootstrapProgress')&&sla.includes('progress-track')&&sla.includes('Старые уже загруженные данные не очищены'),'SLA progress or resilient error UI missing');
must(history.includes('Фактическая доставка + восстановленная история')&&history.includes('История до журнала')&&history.includes('Доставка неизвестна'),'notification history provenance UI missing');
must((more.includes('v28.20 Vue')||more.includes('v28.21 Vue'))&&more.includes('bootstrapProgress')&&more.includes('восстановленная история старых SLA-событий'),'More status dashboard missing');
must(notifications.includes('КАК СЕЙЧАС РАБОТАЕТ ПРАВИЛО')&&notifications.includes('filterDescription'),'notification rule live explanation missing');
must(outbox.includes('stuckCount')&&outbox.includes('Уже зависли')&&outbox.includes('watchdog очереди'),'outbox observable stats missing');
must(admin.includes('bootstrapProgress')&&admin.includes('Успешно обработано'),'admin bootstrap progress missing');
must(css.includes('/* v28.20: observability')&&css.includes('.weekday-grid input{position:absolute;opacity:0')&&css.includes('.sla-summary-grid')&&css.includes('.history-filter-grid'),'v28.20 responsive control CSS missing');
console.log('v28.20 integration checks: OK (fast SLA, progress UX, historical audit backfill, resilient control screens)');
