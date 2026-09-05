'use strict';
const fs=require('fs'),path=require('path'),root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const server=read('server.js'),pkg=JSON.parse(read('package.json')),app=read('frontend/src/App.vue'),more=read('frontend/src/views/MoreView.vue'),notifications=read('frontend/src/views/NotificationsView.vue'),browser=read('frontend/src/stores/browserNotifications.js'),sw=read('frontend/public/sw.js'),phrases=read('frontend/src/stores/phrases.js'),composer=read('frontend/src/components/Composer.vue'),css=read('frontend/src/assets/base.css'),html=read('frontend/index.html'),render=read('render.yaml'),gitignore=read('.gitignore');
function must(value,message){if(!value)throw new Error(message)}
must(/^28\.(11|12|13|14)\.0$/.test(pkg.version)&&/const VERSION = '28\.(11|12|13|14)'/.test(server),'version mismatch');
must(browser.includes("Notification.requestPermission()")&&browser.includes("registration.showNotification")&&browser.includes('notificationOverview'),'browser notification polling missing');
must(sw.includes('notificationclick')&&sw.includes('openWindow')&&app.includes('browserNotifications.start()'),'service worker notification lifecycle missing');
must(gitignore.includes('/public/')&&!/^public\/$/m.test(gitignore),'frontend/public PWA assets must not be ignored by git');
must(more.includes('Включить уведомления браузера')&&more.includes('свёрнутой вкладке')&&notifications.includes('Проверить сейчас'),'browser notification controls missing');
must(!html.includes('getRegistrations())await r.unregister()'),'service worker must not be unregistered on every page load');
must(phrases.includes('export function normalizePhraseSearch')&&phrases.includes("toLocaleLowerCase('ru-RU')")&&phrases.includes("replace(/ё/g, 'е')"),'phrase normalization missing');
must(composer.includes('phraseSuggestions')&&composer.includes('normalizePhraseSearch')&&composer.includes('selectSuggestedPhrase'),'live composer phrase suggestions missing');
must(css.includes('.composer-phrase-suggestions')&&render.includes('npm run test:v2811'),'release wiring missing');
console.log('v28.11 integration checks: OK (browser alerts, service worker clicks, live normalized phrase suggestions)');
