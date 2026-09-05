<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../services/api'
import { useOutboxStore } from '../stores/outbox'
import { useSessionStore } from '../stores/session'
import { useUiStore } from '../stores/ui'
import { useBrowserNotificationsStore } from '../stores/browserNotifications'
import { useMetaStore } from '../stores/meta'
import MultiFilterSheet from '../components/MultiFilterSheet.vue'

const route=useRoute(),router=useRouter(),outbox=useOutboxStore(),session=useSessionStore(),ui=useUiStore()
const browserNotifications=useBrowserNotificationsStore()
const meta=useMetaStore()
const loading=ref(false),checking=ref(false),rows=ref([]),serverQueue=ref([]),slaMinutes=ref(8),workStart=ref('10:00'),workEnd=ref('22:00'),background=ref(null),journalFilter=ref('all')
const filterSheet=ref(''),managerFilter=ref([]),statusFilter=ref([]),dateFrom=ref(''),dateTo=ref('')
const queue=computed(()=>{const map=new Map();for(const m of serverQueue.value)map.set(String(m.requestId||m.localId),m);for(const m of outbox.active)map.set(String(m.clientRequestId||m.localId),{...map.get(String(m.clientRequestId||m.localId)),...m});return [...map.values()].sort((a,b)=>Number(a.createdAt||0)-Number(b.createdAt||0))})
const waitingCount=computed(()=>rows.value.filter(row=>row.status!=='answered').length)
const answeredCount=computed(()=>rows.value.filter(row=>row.status==='answered').length)
const managerOptions=computed(()=>meta.users.map(u=>({value:u.name||u.login,label:u.name||u.login})).filter(x=>x.value))
const statusOptions=computed(()=>meta.statuses.map(s=>({value:s.name||s,label:s.name||s})).filter(x=>x.value))
const rowManagers=row=>[row.manager,row.currentManager,row.managerAtReceipt,...(row.managerHistory||[]).flatMap(x=>[x.manager,x.fromManager,x.toManager])].filter(Boolean)
const rowStatuses=row=>[row.crmStatus,row.currentCrmStatus,row.statusAtReceipt,...(row.statusHistory||[]).flatMap(x=>[x.status,x.fromStatus,x.toStatus])].filter(Boolean)
const visibleRows=computed(()=>rows.value.filter(row=>{
  if(journalFilter.value!=='all'&&(journalFilter.value==='answered'?(row.status!=='answered'):(row.status==='answered')))return false
  if(managerFilter.value.length&&!managerFilter.value.some(v=>rowManagers(row).includes(v)))return false
  if(statusFilter.value.length&&!statusFilter.value.some(v=>rowStatuses(row).includes(v)))return false
  const day=new Date(Number(row.receivedAt||0)*1000).toLocaleDateString('en-CA',{timeZone:'Europe/Moscow'})
  return(!dateFrom.value||day>=dateFrom.value)&&(!dateTo.value||day<=dateTo.value)
}))
function waitLabel(minutes){const m=Math.max(0,Number(minutes||0));if(m<60)return`${m} мин`;return`${Math.floor(m/60)} ч ${m%60} мин`}
function statusLabel(m){return m.status==='error'?'Не отправлено':m.status==='sending'?'Отправляется':'Стоит в очереди'}
function dateTime(seconds){return seconds?new Date(Number(seconds)*1000).toLocaleString('ru-RU',{timeZone:'Europe/Moscow',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—'}
async function load(){loading.value=true;try{await meta.load();const d=await api.notificationOverview();rows.value=d.dialogs||[];serverQueue.value=d.outbox||[];slaMinutes.value=Number(d.slaMinutes||8);workStart.value=d.workStart||'10:00';workEnd.value=d.workEnd||'22:00';background.value=d.background||null}catch(e){ui.toast(e.message,'error')}finally{loading.value=false}}
async function checkNow(){checking.value=true;try{await load();if(browserNotifications.enabled)await browserNotifications.check(true);ui.toast(`Проверено: ждут ответа — ${waitingCount.value}`,'ok',5000)}catch(e){ui.toast(e.message,'error',6000)}finally{checking.value=false}}
function checkTime(value){return value?new Date(Number(value)).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'}):'ещё не запускалась'}
function openDialog(peerId){router.push({path:`/dialogs/${peerId}`,query:{from:route.fullPath}})}
function managerPath(row){const values=[row.managerAtReceipt,...(row.managerHistory||[]).flatMap(x=>[x.fromManager,x.toManager]),row.currentManager||row.manager].filter(Boolean);return[...new Set(values)].join(' → ')||'Менеджер не назначен'}
function resetJournalFilters(){managerFilter.value=[];statusFilter.value=[];dateFrom.value='';dateTo.value=''}
async function dismiss(m){if(m.localId)outbox.remove(m.localId);else await api.outboxEvent({requestId:m.requestId,peerId:m.peerId,status:'removed'});await load()}
onMounted(()=>{outbox.init(session.loginName);load()})
</script>
<template><main class="page page-with-nav notifications-page">
  <header class="page-header sticky-header"><div><small>VK · ЖУРНАЛ SLA</small><h1>Уведомления</h1></div><button class="header-action" :disabled="loading" @click="load">↻</button></header>
  <section class="settings-card notification-summary"><div><b>Ждут ответа: {{waitingCount}}</b><span>SLA: {{slaMinutes}} рабочих минут · график {{workStart}}–{{workEnd}} МСК. Вне графика отсчёт начнётся с начала следующего рабочего дня.</span></div><button class="secondary-btn" :disabled="checking" @click="checkNow">{{checking?'Проверяю…':'Проверить сейчас'}}</button></section>
  <section v-if="background" class="settings-card background-status"><div class="setting-row"><span>Фоновая проверка</span><b :class="background.ready?'connected-text':'muted-text'">{{background.ready?'Сервер настроен':'Не настроена'}}</b></div><div class="setting-row"><span>Внешний запуск</span><b :class="background.externalSchedulerConfigured?'connected-text':'muted-text'">{{background.externalSchedulerConfigured?'Ключ готов':'Нет ключа'}}</b></div><div class="setting-row"><span>Связь после перезапуска</span><b :class="background.environmentPairingConfigured?'connected-text':'muted-text'">{{background.environmentPairingConfigured?'Сохранена':'Нужно настроить'}}</b></div><p v-if="background.missingEnvironment?.length" class="settings-hint"><b>Не хватает в Render:</b> {{background.missingEnvironment.join(', ')}}</p><p v-if="!background.ready" class="settings-hint">Для работы при закрытом телефоне и компьютере заполните эти переменные в Render → Environment. Для внешнего запуска значение NOTIFICATION_CHECK_SECRET должно совпадать с секретом CRM_NOTIFICATION_SECRET в GitHub Actions.</p><p class="settings-hint">Последняя проверка: {{checkTime(background.lastCheck?.lastAt)}}<template v-if="background.lastCheck?.lastError"> · Ошибка: {{background.lastCheck.lastError}}</template></p></section>
  <section class="notification-block"><h3>Зависшие исходящие <b>{{queue.length}}</b></h3><article v-for="m in queue" :key="m.requestId||m.localId" class="notification-row queue-row"><button @click="openDialog(m.peerId)"><strong>{{m.peerName||`VK ${m.peerId}`}}</strong><span>{{m.text||m.snippet||'Сообщение с вложением'}}</span><small :class="`queue-${m.status}`">{{statusLabel(m)}}</small></button><div><button v-if="m.localId&&m.status!=='sending'" @click="outbox.retry(m.localId)">Повторить</button><button v-if="m.status!=='sending'" class="danger-link" @click="dismiss(m)">Убрать</button></div></article><div v-if="!queue.length" class="empty-mini">Зависших сообщений нет</div></section>
  <div v-if="loading" class="list-status"><span class="tiny-spinner"></span> Проверяю диалоги…</div>
  <section class="notification-block lead-journal"><h3>Журнал лидов <b>{{rows.length}}</b></h3><div class="segmented journal-tabs"><button :class="{active:journalFilter==='all'}" @click="journalFilter='all'">Все {{rows.length}}</button><button :class="{active:journalFilter==='waiting'}" @click="journalFilter='waiting'">Без ответа {{waitingCount}}</button><button :class="{active:journalFilter==='answered'}" @click="journalFilter='answered'">Отвечено {{answeredCount}}</button></div><div class="journal-filters"><button class="select-sheet-trigger" @click="filterSheet='manager'"><span>Менеджеры</span><b>{{managerFilter.length||'Все'}} ▾</b></button><button class="select-sheet-trigger" @click="filterSheet='status'"><span>Статусы</span><b>{{statusFilter.length||'Все'}} ▾</b></button><label>Дата от<input v-model="dateFrom" type="date"></label><label>Дата до<input v-model="dateTo" type="date"></label><button v-if="managerFilter.length||statusFilter.length||dateFrom||dateTo" class="danger-link" @click="resetJournalFilters">Сбросить фильтры</button></div><article v-for="d in visibleRows" :key="d.id" class="notification-row journal-row"><button @click="openDialog(d.peerId)"><strong>{{d.name}}</strong><span><b>Клиент:</b> {{d.snippet||'Входящее сообщение'}}</span><span v-if="d.status==='answered'&&d.responseText"><b>{{d.responseAuthor||'Менеджер'}}:</b> {{d.responseText}}</span><small>Менеджеры: {{managerPath(d)}}<template v-if="d.crmStatus"> · Статус: {{d.crmStatus}}</template></small><em>Написал: {{dateTime(d.receivedAt)}}</em><em v-if="d.status==='answered'">Ответили: {{dateTime(d.answeredAt)}}</em><em v-if="d.outsideHoursAtReceipt">Вне рабочего времени · отсчёт с {{dateTime(d.responseStartAt)}}</em><em>Срок ответа: {{dateTime(d.dueAt)}}</em></button><div class="journal-state"><b :class="d.status==='answered'?'answered-badge':'waiting-badge'">{{d.status==='answered'?'Отвечено':'Без ответа'}}</b><time v-if="d.status==='answered'">{{waitLabel(d.workingWaitMinutes)}} до ответа</time><time v-else>{{waitLabel(d.workingWaitMinutes)}} рабочего времени</time></div></article><div v-if="!loading&&!visibleRows.length" class="empty-state"><b>Записей нет</b><span>Измените фильтры или дождитесь нового обращения.</span></div></section>
  <MultiFilterSheet :open="filterSheet==='manager'" title="Менеджеры лидов" :options="managerOptions" v-model="managerFilter" @apply="filterSheet=''" @close="filterSheet=''"/>
  <MultiFilterSheet :open="filterSheet==='status'" title="CRM-статусы" :options="statusOptions" v-model="statusFilter" @apply="filterSheet=''" @close="filterSheet=''"/>
</main></template>
