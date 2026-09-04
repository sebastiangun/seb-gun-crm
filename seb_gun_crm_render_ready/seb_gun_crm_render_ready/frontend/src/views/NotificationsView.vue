<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../services/api'
import { useOutboxStore } from '../stores/outbox'
import { useSessionStore } from '../stores/session'
import { useUiStore } from '../stores/ui'
import { useBrowserNotificationsStore } from '../stores/browserNotifications'

const route=useRoute(),router=useRouter(),outbox=useOutboxStore(),session=useSessionStore(),ui=useUiStore()
const browserNotifications=useBrowserNotificationsStore()
const loading=ref(false),checking=ref(false),rows=ref([]),serverQueue=ref([]),slaMinutes=ref(8),background=ref(null)
const queue=computed(()=>{const map=new Map();for(const m of serverQueue.value)map.set(String(m.requestId||m.localId),m);for(const m of outbox.active)map.set(String(m.clientRequestId||m.localId),{...map.get(String(m.clientRequestId||m.localId)),...m});return [...map.values()].sort((a,b)=>Number(a.createdAt||0)-Number(b.createdAt||0))})
function waitLabel(minutes){const m=Math.max(0,Number(minutes||0));if(m<60)return`${m} мин`;return`${Math.floor(m/60)} ч ${m%60} мин`}
function statusLabel(m){return m.status==='error'?'Не отправлено':m.status==='sending'?'Отправляется':'Стоит в очереди'}
async function load(){loading.value=true;try{const d=await api.notificationOverview();rows.value=d.dialogs||[];serverQueue.value=d.outbox||[];slaMinutes.value=Number(d.slaMinutes||8);background.value=d.background||null}catch(e){ui.toast(e.message,'error')}finally{loading.value=false}}
async function checkNow(){checking.value=true;try{await load();if(browserNotifications.enabled)await browserNotifications.check(true);ui.toast(`Проверено: лидов без ответа — ${rows.value.length}`,'ok',5000)}catch(e){ui.toast(e.message,'error',6000)}finally{checking.value=false}}
function checkTime(value){return value?new Date(Number(value)).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'}):'ещё не запускалась'}
function openDialog(peerId){router.push({path:`/dialogs/${peerId}`,query:{from:route.fullPath}})}
async function dismiss(m){if(m.localId)outbox.remove(m.localId);else await api.outboxEvent({requestId:m.requestId,peerId:m.peerId,status:'removed'});await load()}
onMounted(()=>{outbox.init(session.loginName);load()})
</script>
<template><main class="page page-with-nav notifications-page">
  <header class="page-header sticky-header"><div><small>VK · TELEGRAM SLA</small><h1>Уведомления</h1></div><button class="header-action" :disabled="loading" @click="load">↻</button></header>
  <section class="settings-card notification-summary"><div><b>Требуют ответа</b><span>Не отвечено больше {{slaMinutes}} рабочих минут</span></div><button class="secondary-btn" :disabled="checking" @click="checkNow">{{checking?'Проверяю…':'Проверить сейчас'}}</button></section>
  <section v-if="background" class="settings-card background-status"><div class="setting-row"><span>Фоновая проверка</span><b :class="background.ready?'connected-text':'muted-text'">{{background.ready?'Сервер настроен':'Не настроена'}}</b></div><div class="setting-row"><span>Внешний запуск</span><b :class="background.externalSchedulerConfigured?'connected-text':'muted-text'">{{background.externalSchedulerConfigured?'Ключ готов':'Нет ключа'}}</b></div><div class="setting-row"><span>Связь после перезапуска</span><b :class="background.environmentPairingConfigured?'connected-text':'muted-text'">{{background.environmentPairingConfigured?'Сохранена':'Нужно настроить'}}</b></div><p v-if="background.missingEnvironment?.length" class="settings-hint"><b>Не хватает в Render:</b> {{background.missingEnvironment.join(', ')}}</p><p v-if="!background.ready" class="settings-hint">Для работы при закрытом телефоне и компьютере заполните эти переменные в Render → Environment. Для внешнего запуска значение NOTIFICATION_CHECK_SECRET должно совпадать с секретом CRM_NOTIFICATION_SECRET в GitHub Actions.</p><p class="settings-hint">Последняя проверка: {{checkTime(background.lastCheck?.lastAt)}}<template v-if="background.lastCheck?.lastError"> · Ошибка: {{background.lastCheck.lastError}}</template></p></section>
  <section class="notification-block"><h3>Зависшие исходящие <b>{{queue.length}}</b></h3><article v-for="m in queue" :key="m.requestId||m.localId" class="notification-row queue-row"><button @click="openDialog(m.peerId)"><strong>{{m.peerName||`VK ${m.peerId}`}}</strong><span>{{m.text||m.snippet||'Сообщение с вложением'}}</span><small :class="`queue-${m.status}`">{{statusLabel(m)}}</small></button><div><button v-if="m.localId&&m.status!=='sending'" @click="outbox.retry(m.localId)">Повторить</button><button v-if="m.status!=='sending'" class="danger-link" @click="dismiss(m)">Убрать</button></div></article><div v-if="!queue.length" class="empty-mini">Зависших сообщений нет</div></section>
  <div v-if="loading" class="list-status"><span class="tiny-spinner"></span> Проверяю диалоги…</div>
  <section class="notification-block"><h3>Лиды без ответа <b>{{rows.length}}</b></h3><article v-for="d in rows" :key="d.peerId" class="notification-row"><button @click="openDialog(d.peerId)"><strong>{{d.name}}</strong><span>{{d.snippet||'Входящее сообщение'}}</span><small>{{d.manager||'Менеджер не назначен'}}<template v-if="d.crmStatus"> · {{d.crmStatus}}</template></small></button><time>{{waitLabel(d.waitMinutes)}}</time></article><div v-if="!loading&&!rows.length" class="empty-state"><b>Срочных ответов нет</b><span>Нет лидов, ожидающих дольше установленного SLA.</span></div></section>
</main></template>
