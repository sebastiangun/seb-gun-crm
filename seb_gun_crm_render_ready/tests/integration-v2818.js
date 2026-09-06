'use strict';
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const pkg=require('../package.json');
const server=read('server.js');
const notifications=read('frontend/src/views/NotificationsView.vue');
const confirm=read('frontend/src/components/NotificationRuleConfirmSheet.vue');
const channels=read('frontend/src/components/NotificationChannelsSheet.vue');
const browser=read('frontend/src/stores/browserNotifications.js');
const css=read('frontend/src/assets/base.css');
const more=read('frontend/src/views/MoreView.vue');
const render=read('render.yaml');
function must(value,message){if(!value)throw new Error(message)}

must(pkg.version==='28.18.0'&&server.includes("const VERSION = '28.18'"),'version mismatch');

// Rule must not be persisted immediately: user first gets a full description and explicit confirmation.
must(notifications.includes('function requestSave()')&&notifications.includes('confirmSheet.value=true'),'save confirmation trigger missing');
must(notifications.includes('confirmationRows')&&notifications.includes('filterDescription')&&notifications.includes('Менеджеры лидов')&&notifications.includes('CRM-статусы')&&notifications.includes('Рабочее время'),'filter summary missing fields');
must(confirm.includes('Подтвердите фильтр')&&confirm.includes('Подтверждаю и сохраняю')&&confirm.includes('Если хотя бы один пункт не совпал')&&confirm.includes('КАК ЭТО БУДЕТ РАБОТАТЬ'),'confirmation dialog wording missing');
must(notifications.includes('@confirm="saveConfirmed"')&&notifications.includes('api.saveNotificationSettings'),'confirmed save wiring missing');

// Device setup must expose both Telegram pairing and browser permission/test in one extra window.
must(notifications.includes('Включить уведомления на устройстве')&&notifications.includes('NotificationChannelsSheet'),'channel setup entry missing');
must(channels.includes('Telegram-бот')&&channels.includes('Уведомления браузера')&&channels.includes('Разрешить на устройстве'),'channel setup controls missing');
must(notifications.includes('@pair="pair"')&&notifications.includes('@enable-browser="enableBrowser"')&&notifications.includes('@test-browser="testBrowser"'),'channel actions are not wired');
must(notifications.includes('await browserNotifications.enable();await browserNotifications.test()'),'browser enable does not send immediate test notification');
must(browser.includes("localStorage.setItem(ENABLED_KEY,'1')")&&browser.includes('Notification.requestPermission()'),'browser permission/persistence missing');

// Active rules should proactively surface channel setup when a delivery channel is not ready.
must(notifications.includes("if(ruleEnabled.value&&(!selectedRule()?.telegramConnected||!browserReady.value))channelsSheet.value=true"),'post-save channel onboarding missing');

// Mobile-safe bottom sheets must keep actions reachable.
must(css.includes('.notification-confirm-sheet')&&css.includes('.notification-channels-sheet')&&css.includes('max-height:calc(100dvh'),'mobile sheet constraints missing');
must(css.includes('.notification-confirm-actions')&&css.includes('.single-action-footer'),'sheet action footer styling missing');

must(more.includes('v28.18 Vue'),'version not shown in UI');
must(render.includes('npm run test:v2818'),'Render does not run v28.18 checks');
console.log('v28.18 integration checks: OK (filter confirmation + Telegram/browser device setup)');
