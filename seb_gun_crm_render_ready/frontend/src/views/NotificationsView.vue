<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../services/api'
import { useMetaStore } from '../stores/meta'
import { useSessionStore } from '../stores/session'
import { useUiStore } from '../stores/ui'
import { useBrowserNotificationsStore } from '../stores/browserNotifications'
import SingleSelectSheet from '../components/SingleSelectSheet.vue'
import MultiFilterSheet from '../components/MultiFilterSheet.vue'
import NotificationRuleConfirmSheet from '../components/NotificationRuleConfirmSheet.vue'
import NotificationChannelsSheet from '../components/NotificationChannelsSheet.vue'
import { copyText } from '../utils/clipboard'

const session=useSessionStore(),meta=useMetaStore(),ui=useUiStore(),router=useRouter(),browserNotifications=useBrowserNotificationsStore()
const notification=ref(null),sla=ref({slaMinutes:8,violationMinutes:20}),outboxSettings=ref({stuckMinutes:3}),manager=ref(''),saving=ref(false),checking=ref(false),exporting=ref(false)
const managerSheet=ref(false),filterSheet=ref(''),confirmSheet=ref(false),channelsSheet=ref(false),channelBusy=ref('')
const days=['Пн','Вт','Ср','Чт','Пт','Сб','Вс']
const form=reactive({warningAlerts:false,violationAlerts:false,outboxAlerts:false,dialogFilter:'unanswered',managerFilters:[],statuses:[],strictFilters:true,workDays:[1,2,3,4,5,6,7],workStart:'10:00',workEnd:'22:00',repeatMinutes:0,timezone:'Europe/Moscow'})
const managers=computed(()=>session.isAdmin?meta.users.map(u=>u.name||u.login):[session.account?.name||session.loginName].filter(Boolean))
const managerOptions=computed(()=>managers.value.map(m=>({value:m,label:m})).filter(x=>x.value))
const leadManagerOptions=computed(()=>meta.users.map(u=>({value:u.name||u.login,label:u.name||u.login})).filter(x=>x.value))
const statusOptions=computed(()=>meta.statuses.map(s=>({value:s.name||s,label:s.name||s})).filter(x=>x.value))
const botConfigured=computed(()=>!!notification.value?.botConfigured)
const backgroundReady=computed(()=>!!notification.value?.internalSchedulerConfigured)
const strictReady=computed(()=>form.managerFilters.length>0&&form.statuses.length>0)
const ruleEnabled=computed(()=>form.warningAlerts||form.violationAlerts||form.outboxAlerts)
const browserReady=computed(()=>browserNotifications.supported&&browserNotifications.enabled&&browserNotifications.permission==='granted')
const deliveryReady=computed(()=>!!selectedRule()?.telegramConnected&&browserReady.value)
const selectedDaysText=computed(()=>form.workDays.slice().sort((a,b)=>a-b).map(d=>days[d-1]).filter(Boolean).join(', ')||'не выбраны')
const eventText=computed(()=>[form.warningAlerts?`предупреждение SLA (${sla.value.slaMinutes} мин)`:null,form.violationAlerts?`нарушение (${sla.value.violationMinutes} мин)`:null,form.outboxAlerts?`зависшее сообщение (${outboxSettings.value.stuckMinutes} мин)`:null].filter(Boolean).join(' + ')||'правило выключено')
const filterDescription=computed(()=>`Уведомлять получателя «${manager.value||'—'}» только по менеджерам: ${form.managerFilters.join(', ')||'не выбраны'}; CRM-статусы: ${form.statuses.join(', ')||'не выбраны'}; ${selectedDaysText.value}, ${form.workStart}–${form.workEnd} МСК. События: ${eventText.value}. Порог ответа и нарушения берётся из раздела «Менеджеры», порог зависшего сообщения — из «Неотправленные».`)
const confirmationRows=computed(()=>[
  {label:'Получатель',value:manager.value||'не выбран'},{label:'События',value:eventText.value},{label:'Менеджеры лидов',value:form.managerFilters.join(', ')||'не выбраны'},{label:'CRM-статусы',value:form.statuses.join(', ')||'не выбраны'},{label:'Диалоги',value:form.dialogFilter==='unread'?'непрочитанные':'неотвеченные'},{label:'Рабочие дни',value:selectedDaysText.value},{label:'Период доставки',value:`${form.workStart}–${form.workEnd} МСК`},{label:'SLA / нарушение',value:`${sla.value.slaMinutes} / ${sla.value.violationMinutes} рабочих мин.`},{label:'Зависшее сообщение',value:`после ${outboxSettings.value.stuckMinutes} мин.`},{label:'Повтор',value:Number(form.repeatMinutes||0)>0?`через ${Number(form.repeatMinutes)} мин.`:'не повторять'},
])

function selectedRule(){return notification.value?.rules?.find(r=>r.manager===manager.value)}
function syncRule(){const r=selectedRule();Object.assign(form,{warningAlerts:Boolean(r?.warningAlerts??r?.enabled),violationAlerts:Boolean(r?.violationAlerts??r?.enabled),outboxAlerts:Boolean(r?.outboxAlerts??r?.queueAlerts),dialogFilter:r?.dialogFilter||'unanswered',managerFilters:r?[...(r.managerFilters||[])]:(manager.value?[manager.value]:[]),statuses:[...(r?.statuses||[])],strictFilters:true,workDays:[...(r?.workDays||[1,2,3,4,5,6,7])],workStart:r?.workStart||'10:00',workEnd:r?.workEnd||'22:00',repeatMinutes:Number(r?.repeatMinutes||0),timezone:'Europe/Moscow'})}
function chooseManager(value){manager.value=value;syncRule()}
async function load(){await meta.load();const [n,s,o]=await Promise.all([api.notificationSettings(),api.slaSettings(),api.outboxSettings()]);notification.value=n;sla.value=s.settings||sla.value;outboxSettings.value=o.settings||outboxSettings.value;manager.value=manager.value||managers.value[0]||'';syncRule()}
function validateRule(){if(!form.workDays.length){ui.toast('Выберите хотя бы один день доставки','error');return false}if(ruleEnabled.value&&!strictReady.value){ui.toast('Выберите менеджеров лидов и CRM-статусы. Пустой фильтр не означает «все».','error',8000);return false}if(!manager.value){ui.toast('Выберите получателя правила','error');return false}return true}
function requestSave(){if(validateRule())confirmSheet.value=true}
async function saveConfirmed(){if(!validateRule())return;saving.value=true;try{await api.saveNotificationSettings({manager:manager.value,...form,enabled:form.warningAlerts,queueAlerts:form.outboxAlerts,slaMinutes:Number(sla.value.slaMinutes||8),violationMinutes:Number(sla.value.violationMinutes||20),timezone:'Europe/Moscow'});confirmSheet.value=false;ui.toast('Настройка доставки сохранена','ok');await load();if(ruleEnabled.value&&(!selectedRule()?.telegramConnected||!browserReady.value))channelsSheet.value=true}catch(e){ui.toast(e.message,'error',8000)}finally{saving.value=false}}
async function pair(){if(!botConfigured.value)return ui.toast('Сначала добавьте TELEGRAM_BOT_TOKEN в Render Environment','error',7000);channelBusy.value='telegram';try{const d=await api.pairTelegram(manager.value);window.open(d.pairUrl,'_blank','noopener');ui.toast(`Откройте @${d.botUsername||notification.value?.botUsername} и нажмите START, затем «Проверить подключение»`,'ok',9000)}catch(e){ui.toast(e.message,'error',7000)}finally{channelBusy.value=''}}
async function refreshPair(){channelBusy.value='refresh';try{notification.value=await api.notificationSettings();ui.toast(selectedRule()?.telegramConnected?'Telegram подключён':'Подключение пока не найдено',selectedRule()?.telegramConnected?'ok':'error',6500)}catch(e){ui.toast(e.message,'error',7000)}finally{channelBusy.value=''}}
async function test(){try{await api.testTelegram(manager.value);ui.toast('Тест отправлен в Telegram','ok')}catch(e){ui.toast(e.message,'error')}}
async function enableBrowser(){channelBusy.value='browser';try{await browserNotifications.enable();await browserNotifications.test();ui.toast('Уведомления на этом устройстве включены','ok',7000)}catch(e){ui.toast(e.message,'error',8000)}finally{channelBusy.value=''}}
async function testBrowser(){channelBusy.value='browser-test';try{await browserNotifications.test();ui.toast('Тестовое уведомление отправлено','ok')}catch(e){ui.toast(e.message,'error',7000)}finally{channelBusy.value=''}}
async function checkNow(){checking.value=true;try{const d=await api.checkNotifications();ui.toast(`Проверено: ${d.checked||0}, событий: ${d.deliveryEvents||0}, Telegram: ${d.sent||0}`,'ok',6000);await load();browserNotifications.check()}catch(e){ui.toast(e.message,'error',8000)}finally{checking.value=false}}
async function exportRules(){exporting.value=true;try{const d=await api.exportNotificationRules();if(!d.count)return ui.toast('Сначала подключите Telegram хотя бы одному получателю','error',7000);await copyText(d.value);ui.toast(`Скопировано правил: ${d.count}`,'ok',7000)}catch(e){ui.toast(e.message,'error',7000)}finally{exporting.value=false}}
function checkTime(value){return value?new Date(Number(value)).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'}):'ещё не запускалась'}
onMounted(()=>load().catch(e=>ui.toast(e.message,'error',7000)))
</script>

<template>
  <main class="page page-with-nav notifications-page">
    <header class="page-header sticky-header"><div><small>НАСТРОЙКА ДОСТАВКИ · МСК</small><h1>Настройка уведомлений</h1></div><button class="header-action" @click="load">↻</button></header>

    <section class="settings-card control-links-card"><button class="control-link" @click="router.push('/notification-history')"><span>🧾</span><div><b>История уведомлений</b><small>Отдельный журнал: кому, когда, Telegram/браузер/оба/не доставлено</small></div><em>›</em></button></section>

    <section class="settings-card notification-channel-banner" :class="{ready:deliveryReady}"><div class="channel-banner-copy"><small>КАНАЛЫ ДОСТАВКИ</small><h3>{{deliveryReady?'Telegram и это устройство подключены':'Настройте каналы'}}</h3><p>Каналы подключаются отдельно от фильтра и отдельно от журналов SLA/неотправленных.</p></div><div class="channel-banner-statuses"><span :class="selectedRule()?.telegramConnected?'ready':'warn'">✈️ Telegram: {{selectedRule()?.telegramConnected?'да':'нет'}}</span><span :class="browserReady?'ready':'warn'">🔔 Устройство: {{browserReady?'да':'нет'}}</span></div><button class="primary-btn" @click="channelsSheet=true">{{deliveryReady?'Проверить каналы':'Подключить каналы'}}</button></section>

    <section class="status-panel notification-rule-status">
      <div class="status-panel-head"><div><small>КАК СЕЙЧАС РАБОТАЕТ ПРАВИЛО</small><h3>{{manager||'Получатель не выбран'}}</h3></div><b :class="ruleEnabled&&strictReady?'connected-text':'muted-text'">{{ruleEnabled&&strictReady?'Активно':'Не готово'}}</b></div>
      <p>{{filterDescription}}</p>
      <div class="data-status-grid four"><span><small>События</small><b>{{[form.warningAlerts,form.violationAlerts,form.outboxAlerts].filter(Boolean).length}}</b></span><span><small>Менеджеры лидов</small><b>{{form.managerFilters.length}}</b></span><span><small>CRM-статусы</small><b>{{form.statuses.length}}</b></span><span><small>Последняя проверка</small><b>{{checkTime(notification?.lastCheck?.lastAt)}}</b></span></div>
      <div class="folder-mini-stats"><span>Telegram <b>{{selectedRule()?.telegramConnected?'подключён':'нет'}}</b></span><span>Браузер <b>{{browserReady?'разрешён':'нет'}}</b></span><span>Фоновая проверка <b>{{backgroundReady?'готова':'не готова'}}</b></span></div>
    </section>

    <section class="settings-card notification-settings">
      <div class="section-title-row"><div><h3>Кому и по какому фильтру отправлять</h3><p>Здесь нет статистики нарушений и очереди сообщений — только маршрутизация уведомлений.</p></div><b class="storage-badge">{{notification?.storage==='postgresql'?'PostgreSQL':'JSON'}}</b></div>
      <div v-if="notification&&!botConfigured" class="telegram-setup-warning"><b>Telegram-бот не настроен</b><span>Добавьте TELEGRAM_BOT_TOKEN в Render → Environment.</span></div>
      <div class="telegram-readiness"><div class="setting-row"><span>Фоновая проверка</span><b :class="backgroundReady?'connected-text':'muted-text'">{{backgroundReady?'Готова':'Не готова'}}</b></div><div class="setting-row"><span>Последняя проверка</span><b>{{checkTime(notification?.lastCheck?.lastAt)}}</b></div></div>

      <label>Получатель<button type="button" class="select-sheet-trigger" @click="managerSheet=true"><span>{{manager||'Выберите получателя'}}</span><b>▾</b></button></label>
      <label class="toggle-row"><input v-model="form.warningAlerts" type="checkbox"><span>Предупреждение о времени ответа ({{sla.slaMinutes}} мин)</span></label>
      <label class="toggle-row"><input v-model="form.violationAlerts" type="checkbox"><span>Уведомление о нарушении регламента ({{sla.violationMinutes}} мин)</span></label>
      <label class="toggle-row"><input v-model="form.outboxAlerts" type="checkbox"><span>Уведомление о зависшем исходящем ({{outboxSettings.stuckMinutes}} мин)</span></label>
      <div class="source-settings-box"><b>Пороги настраиваются в других разделах</b><span>Время ответа/нарушение → «Менеджеры». Зависшее сообщение → «Неотправленные». Здесь выбираются только получатель, фильтр и период доставки.</span></div>

      <div class="strict-filter-box" :class="{ready:strictReady}"><b>{{strictReady?'Строгий фильтр заполнен':'Фильтр не заполнен'}}</b><span>{{strictReady?`Менеджеров: ${form.managerFilters.length} · статусов: ${form.statuses.length}`:'Выберите хотя бы одного менеджера лида и один CRM-статус.'}}</span></div>
      <div class="filter-buttons"><button type="button" @click="filterSheet='manager'"><span>Менеджеры лидов</span><b>{{form.managerFilters.length||'Не выбраны'}}</b><span>▾</span></button><button type="button" @click="filterSheet='status'"><span>CRM-статусы</span><b>{{form.statuses.length||'Не выбраны'}}</b><span>▾</span></button></div>
      <div class="segmented two"><button :class="{active:form.dialogFilter==='unanswered'}" @click="form.dialogFilter='unanswered'">Неотвеченные</button><button :class="{active:form.dialogFilter==='unread'}" @click="form.dialogFilter='unread'">Непрочитанные</button></div>
      <div class="weekday-grid"><label v-for="(day,i) in days" :key="day" :class="{active:form.workDays.includes(i+1)}"><input v-model="form.workDays" type="checkbox" :value="i+1"><span>{{day}}</span></label></div>
      <div class="form-grid"><label>Доставка от, МСК<input v-model="form.workStart" type="time"></label><label>Доставка до, МСК<input v-model="form.workEnd" type="time"></label></div>
      <label>Повторить уведомление через, минут<input v-model.number="form.repeatMinutes" type="number" min="0" max="1440"><small>0 — одно уведомление каждого типа</small></label>
      <button class="primary-btn" :disabled="saving||!manager" @click="requestSave">{{saving?'Сохраняю…':'Проверить и сохранить фильтр'}}</button>
      <div class="button-row"><button class="secondary-btn" :disabled="!manager" @click="channelsSheet=true">Подключение каналов</button><button class="secondary-btn" :disabled="!manager||!selectedRule()?.telegramConnected" @click="test">Тест Telegram</button></div><button class="secondary-btn" :disabled="checking" @click="checkNow">{{checking?'Проверяю…':'Проверить сейчас'}}</button>
    </section>

    <section v-if="session.isAdmin" class="settings-card"><h3>Резерв правил для Render</h3><button class="secondary-btn" :disabled="exporting" @click="exportRules">{{exporting?'Подготовка…':'Скопировать NOTIFICATION_RULES_JSON'}}</button></section>

    <SingleSelectSheet :open="managerSheet" title="Получатель уведомлений" :options="managerOptions" :model-value="manager" empty-label="Выберите получателя" @update:model-value="chooseManager" @close="managerSheet=false"/>
    <MultiFilterSheet :open="filterSheet==='manager'" title="Каких менеджеров контролировать" :options="leadManagerOptions" v-model="form.managerFilters" @apply="filterSheet=''" @close="filterSheet=''"/>
    <MultiFilterSheet :open="filterSheet==='status'" title="Какие CRM-статусы контролировать" :options="statusOptions" v-model="form.statuses" @apply="filterSheet=''" @close="filterSheet=''"/>
    <NotificationRuleConfirmSheet :open="confirmSheet" :rows="confirmationRows" :saving="saving" :enabled="ruleEnabled" :description="filterDescription" @close="confirmSheet=false" @confirm="saveConfirmed"/>
    <NotificationChannelsSheet :open="channelsSheet" :manager="manager" :bot-configured="botConfigured" :bot-username="notification?.botUsername||''" :telegram-connected="!!selectedRule()?.telegramConnected" :browser-supported="browserNotifications.supported" :browser-enabled="browserNotifications.enabled" :browser-permission="browserNotifications.permission" :busy="channelBusy" @close="channelsSheet=false" @pair="pair" @refresh="refreshPair" @enable-browser="enableBrowser" @test-browser="testBrowser"/>
  </main>
</template>
