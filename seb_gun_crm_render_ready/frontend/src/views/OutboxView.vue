<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../services/api'
import { useOutboxStore } from '../stores/outbox'
import { useSessionStore } from '../stores/session'
import { useUiStore } from '../stores/ui'

const route=useRoute(),router=useRouter(),outbox=useOutboxStore(),session=useSessionStore(),ui=useUiStore()
const loading=ref(false),saving=ref(false),serverQueue=ref([]),storage=ref('json')
const settings=reactive({enabled:true,stuckMinutes:3,repeatMinutes:0})
const queue=computed(()=>{const map=new Map();for(const m of serverQueue.value)map.set(String(m.requestId||m.localId),m);for(const m of outbox.active)map.set(String(m.clientRequestId||m.localId),{...map.get(String(m.clientRequestId||m.localId)),...m});return [...map.values()].sort((a,b)=>Number(a.createdAt||0)-Number(b.createdAt||0))})
function statusLabel(m){return m.status==='error'?'Не отправлено':m.status==='sending'?'Отправляется':'Стоит в очереди'}
function dateTime(value){return value?new Date(Number(value)).toLocaleString('ru-RU',{timeZone:'Europe/Moscow',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—'}
function ageMinutes(m){return Math.max(0,Math.floor((Date.now()-Number(m.createdAt||Date.now()))/60000))}
function openDialog(peerId){router.push({path:`/dialogs/${peerId}`,query:{from:route.fullPath}})}
async function load(){loading.value=true;try{const [q,s]=await Promise.all([api.outboxOverview(),api.outboxSettings()]);serverQueue.value=q.outbox||[];storage.value=q.storage||s.storage||'json';Object.assign(settings,s.settings||{})}catch(e){ui.toast(e.message,'error')}finally{loading.value=false}}
async function saveSettings(){if(!session.isAdmin)return;saving.value=true;try{const d=await api.saveOutboxSettings({...settings});Object.assign(settings,d.settings||{});ui.toast('Контроль зависших сообщений сохранён','ok')}catch(e){ui.toast(e.message,'error',7000)}finally{saving.value=false}}
async function dismiss(m){if(m.localId)outbox.remove(m.localId);else await api.outboxEvent({requestId:m.requestId,peerId:m.peerId,status:'removed'});await load()}
onMounted(()=>{outbox.init(session.loginName);load()})
</script>

<template>
  <main class="page page-with-nav notifications-page">
    <header class="page-header sticky-header"><div><small>VK · ОЧЕРЕДЬ ОТПРАВКИ</small><h1>Неотправленные</h1></div><button class="header-action" :disabled="loading" @click="load">↻</button></header>

    <section class="settings-card"><div class="section-title-row"><div><h3>Серверный контроль зависших сообщений</h3><p>Это отдельная логика и она не зависит от времени ответа менеджеров. Сервер хранит очередь и сам определяет, когда сообщение считать зависшим.</p></div><b class="storage-badge">{{storage==='postgresql'?'PostgreSQL':'JSON'}}</b></div>
      <label class="toggle-row"><input v-model="settings.enabled" type="checkbox" :disabled="!session.isAdmin"><span>Контроль включён</span></label>
      <div class="form-grid"><label>Считать зависшим через, минут<input v-model.number="settings.stuckMinutes" type="number" min="1" max="240" :disabled="!session.isAdmin"></label><label>Повтор уведомления, минут<input v-model.number="settings.repeatMinutes" type="number" min="0" max="1440" :disabled="!session.isAdmin"><small>0 — не повторять</small></label></div>
      <p class="settings-hint">После {{settings.stuckMinutes}} мин. сервер создаёт событие «Зависшее сообщение». Кому его отправлять и по каким менеджерам/статусам — задаётся отдельно в «Настройке уведомлений».</p>
      <button v-if="session.isAdmin" class="primary-btn" :disabled="saving" @click="saveSettings">{{saving?'Сохраняю…':'Сохранить контроль очереди'}}</button>
    </section>

    <section class="settings-card notification-summary"><div><b>Активных сообщений: {{queue.length}}</b><span>Список содержит только очередь исходящих. SLA и история уведомлений находятся в отдельных разделах.</span></div></section>
    <div v-if="loading" class="list-status"><span class="tiny-spinner"></span> Обновляю очередь…</div>
    <section class="notification-block">
      <article v-for="m in queue" :key="m.requestId||m.localId" class="notification-row queue-row">
        <button @click="openDialog(m.peerId)"><strong>{{m.peerName||`VK ${m.peerId}`}}</strong><span>{{m.text||m.snippet||'Сообщение с вложением'}}</span><small :class="`queue-${m.status}`">{{statusLabel(m)}} · попыток: {{m.attempts||0}} · {{m.manager||'менеджер не определён'}}</small><em>В очереди: {{ageMinutes(m)}} мин. · порог: {{settings.stuckMinutes}} мин.</em><em v-if="m.updatedAt">Обновлено: {{dateTime(m.updatedAt)}}</em><em v-if="m.error" class="queue-error">{{m.error}}</em></button>
        <div><button v-if="m.localId&&m.status!=='sending'" @click="outbox.retry(m.localId)">Повторить</button><button v-if="m.status!=='sending'" class="danger-link" @click="dismiss(m)">Убрать</button></div>
      </article>
      <div v-if="!loading&&!queue.length" class="empty-state"><b>Зависших сообщений нет</b><span>Очередь отправки сейчас чистая.</span></div>
    </section>
  </main>
</template>
