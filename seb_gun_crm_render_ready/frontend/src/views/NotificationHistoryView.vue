<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../services/api'
import { useMetaStore } from '../stores/meta'
import { useUiStore } from '../stores/ui'

const route=useRoute(),router=useRouter(),meta=useMetaStore(),ui=useUiStore()
const loading=ref(false),rows=ref([]),recipient=ref(''),leadManager=ref(''),crmStatus=ref(''),eventType=ref(''),channel=ref(''),deliveryStatus=ref(''),dateFrom=ref(''),dateTo=ref(''),search=ref('')
const summary=ref({total:0,actual:0,historical:0,sent:0,partial:0,pending:0,failed:0}),backfill=ref(null),bootstrap=ref(null),storage=ref('json'),loadError=ref(''),lastLoadedAt=ref(0),pollTimer=ref(0)
const eventOptions=[['','Все события'],['sla_warning','Предупреждение по времени ответа'],['sla_violation','Нарушение регламента'],['outbox_stuck','Зависшее исходящее']]
const channelOptions=[['','Все каналы'],['telegram','Telegram'],['browser','Браузер'],['both','Telegram + браузер'],['none','Ничего не отправлено'],['historical','История до журнала доставки']]
const statusOptions=[['','Любой результат'],['sent','Отправлено'],['partial','Частично'],['pending','Ожидает'],['failed','Не отправлено'],['historical','Историческое событие']]
const recipients=computed(()=>[...new Set(rows.value.map(x=>x.recipientManager).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru')))
const leadManagers=computed(()=>[...new Set([...meta.users.map(u=>u.name||u.login),...rows.value.map(x=>x.leadManager)].filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru')))
const statuses=computed(()=>[...new Set([...meta.statuses.map(s=>s.name||s),...rows.value.map(x=>x.crmStatus)].filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru')))
const bootstrapProgress=computed(()=>{const total=Number(bootstrap.value?.totalDialogs||0),done=Number(bootstrap.value?.currentBatchEnd||bootstrap.value?.processedDialogs||0);return total?Math.min(100,Math.round(done/total*100)):0})
const bootstrapRunning=computed(()=>['running','starting'].includes(String(bootstrap.value?.status||'')))
function day(ms){return ms?new Date(Number(ms)).toLocaleDateString('en-CA',{timeZone:'Europe/Moscow'}):''}
function dateTime(ms){return ms?new Date(Number(ms)).toLocaleString('ru-RU',{timeZone:'Europe/Moscow',day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—'}
function eventLabel(type){return type==='sla_violation'?'Нарушение':type==='outbox_stuck'?'Зависшее сообщение':'Предупреждение'}
function channelStatus(row,name){return String(row?.channels?.[name]?.status||'not_requested')}
function channelStatusLabel(value){return value==='sent'?'доставлено':value==='pending'?'ожидает':value==='failed'?'ошибка':value==='blocked'?'запрещено':value==='missed'?'не получено':value==='not_available'?'нет данных':'не подключено'}
function channelLabel(row){if(row.historical)return'История до журнала';const tg=channelStatus(row,'telegram'),br=channelStatus(row,'browser'),tgSent=tg==='sent',brSent=br==='sent';if(tgSent&&brSent)return'Telegram + браузер';if(tgSent)return'Telegram';if(brSent)return'Браузер';if(tg==='pending'||br==='pending')return'Ожидает доставки';return'Не отправлено'}
function resultLabel(row){if(row.historical||row.overallStatus==='historical')return'Доставка неизвестна';return row.overallStatus==='sent'?'Отправлено':row.overallStatus==='partial'?'Частично':row.overallStatus==='pending'?'Ожидает':'Не отправлено'}
function channelMatches(row){if(!channel.value)return true;if(channel.value==='historical')return !!row.historical;const tg=channelStatus(row,'telegram'),br=channelStatus(row,'browser');if(channel.value==='telegram')return tg==='sent';if(channel.value==='browser')return br==='sent';if(channel.value==='both')return tg==='sent'&&br==='sent';if(channel.value==='none')return !row.historical&&tg!=='sent'&&br!=='sent';return true}
const filtered=computed(()=>rows.value.filter(row=>{
  const q=search.value.trim().toLocaleLowerCase('ru-RU');if(q&&!`${row.clientName||''} ${row.recipientManager||''} ${row.leadManager||''} ${row.crmStatus||''} ${row.snippet||''}`.toLocaleLowerCase('ru-RU').includes(q))return false
  if(recipient.value&&row.recipientManager!==recipient.value)return false;if(leadManager.value&&row.leadManager!==leadManager.value)return false;if(crmStatus.value&&row.crmStatus!==crmStatus.value)return false;if(eventType.value&&row.eventType!==eventType.value)return false;if(deliveryStatus.value&&String(row.overallStatus)!==deliveryStatus.value)return false;if(dateFrom.value&&day(row.createdAt)<dateFrom.value)return false;if(dateTo.value&&day(row.createdAt)>dateTo.value)return false;return channelMatches(row)
}))
function reset(){recipient.value='';leadManager.value='';crmStatus.value='';eventType.value='';channel.value='';deliveryStatus.value='';dateFrom.value='';dateTo.value='';search.value=''}
async function load({silent=false}={}){if(!silent)loading.value=true;loadError.value='';try{await meta.load();const d=await api.notificationHistory();rows.value=d.rows||[];summary.value=d.summary||summary.value;backfill.value=d.backfill||null;bootstrap.value=d.bootstrap||null;storage.value=d.storage||'json';lastLoadedAt.value=Date.now()}catch(e){loadError.value=e.message||'Не удалось загрузить историю';ui.toast(loadError.value,'error',7000)}finally{if(!silent)loading.value=false}}
async function poll(){if(bootstrapRunning.value||['waiting_for_dialog_bootstrap','running'].includes(backfill.value?.status)){await load({silent:true});pollTimer.value=window.setTimeout(poll,3500)}}
function open(row){if(row.peerId)router.push({path:`/dialogs/${row.peerId}`,query:{from:route.fullPath}})}
onMounted(async()=>{await load();poll()})
onBeforeUnmount(()=>{if(pollTimer.value)clearTimeout(pollTimer.value)})
</script>

<template>
  <main class="page page-with-nav notification-history-page">
    <header class="page-header sticky-header"><div><small>АУДИТ ДОСТАВКИ · МСК</small><h1>История уведомлений</h1></div><button class="header-action" :disabled="loading" @click="load()">↻</button></header>

    <section class="settings-card control-links-card"><button class="control-link" @click="router.push('/notifications')"><span>⚙️</span><div><b>Настройка уведомлений</b><small>Получатели, менеджеры, статусы, дни, время и каналы доставки</small></div><em>›</em></button></section>

    <section class="status-panel notification-audit-status">
      <div class="status-panel-head"><div><small>ЧТО ХРАНИТСЯ</small><h3>Фактическая доставка + восстановленная история</h3></div><b>{{storage==='postgresql'?'PostgreSQL':'JSON'}}</b></div>
      <p>Новые события фиксируются с результатом Telegram и браузера. Старые SLA-события до появления этого журнала восстанавливаются из истории диалогов, но CRM честно помечает их как «доставка неизвестна».</p>
      <div class="data-status-grid four"><span><small>Всего записей</small><b>{{summary.total}}</b></span><span><small>Фактических</small><b>{{summary.actual}}</b></span><span><small>Исторических</small><b>{{summary.historical}}</b></span><span><small>Доставлено</small><b>{{summary.sent}}</b></span></div>
      <div v-if="bootstrapRunning" class="progress-block"><div class="progress-track"><i :style="{width:`${bootstrapProgress}%`}"></i></div><div class="progress-meta"><b>{{bootstrapProgress}}%</b><span>История диалогов: {{bootstrap.currentBatchEnd||bootstrap.processedDialogs||0}} / {{bootstrap.totalDialogs||0}}</span></div></div>
      <div v-if="backfill?.status==='waiting_for_dialog_bootstrap'" class="logic-explainer"><b>Старые уведомления ещё дополняются</b><span>Сначала CRM завершит одноразовую проверку старых диалогов. После этого исторические события автоматически появятся здесь.</span></div>
      <div v-else-if="backfill?.status==='running'" class="progress-block"><div class="progress-track"><i :style="{width:`${backfill.progress||0}%`}"></i></div><div class="progress-meta"><b>{{backfill.progress||0}}%</b><span>Восстановление журнала: {{backfill.processedRows||0}} / {{backfill.sourceRows||0}} записей SLA</span></div></div>
      <div v-if="backfill?.status==='running'||backfill?.status==='completed'" class="folder-mini-stats"><span>Восстановлено предупреждений <b>{{backfill.created?.warnings||0}}</b></span><span>Нарушений <b>{{backfill.created?.violations||0}}</b></span><span>Зависших <b>{{backfill.created?.outbox||0}}</b></span></div>
      <small class="audit-note">Важно: для исторических записей нельзя достоверно определить, был ли реально отправлен Telegram или браузерная плашка. Поэтому такие записи не считаются «доставленными».</small>
    </section>

    <section v-if="loadError" class="inline-error-card"><div><b>Не удалось обновить журнал</b><span>{{loadError}}</span><small>Уже загруженные записи остаются на экране.</small></div><button class="secondary-btn" @click="load()">Повторить</button></section>

    <section class="settings-card history-filter-card"><div class="section-title-row"><div><h3>Журнал отправок</h3><p>Фильтры работают по фактическим и историческим событиям. Найдено: {{filtered.length}} из {{rows.length}}.</p></div><span class="info-chip">Обновлено {{dateTime(lastLoadedAt)}}</span></div>
      <div class="search-control"><span>⌕</span><input v-model="search" placeholder="Клиент, менеджер, статус"></div>
      <div class="history-filter-grid">
        <label>Получатель<select v-model="recipient"><option value="">Все</option><option v-for="x in recipients" :key="x">{{x}}</option></select></label>
        <label>Менеджер лида<select v-model="leadManager"><option value="">Все</option><option v-for="x in leadManagers" :key="x">{{x}}</option></select></label>
        <label>CRM-статус<select v-model="crmStatus"><option value="">Все</option><option v-for="x in statuses" :key="x">{{x}}</option></select></label>
        <label>Событие<select v-model="eventType"><option v-for="x in eventOptions" :key="x[0]" :value="x[0]">{{x[1]}}</option></select></label>
        <label>Канал<select v-model="channel"><option v-for="x in channelOptions" :key="x[0]" :value="x[0]">{{x[1]}}</option></select></label>
        <label>Результат<select v-model="deliveryStatus"><option v-for="x in statusOptions" :key="x[0]" :value="x[0]">{{x[1]}}</option></select></label>
        <label>Дата от<input v-model="dateFrom" type="date"></label><label>Дата до<input v-model="dateTo" type="date"></label>
      </div><button class="secondary-btn" @click="reset">Сбросить фильтр</button>
    </section>
    <div v-if="loading" class="list-status"><span class="tiny-spinner"></span> Читаю журнал доставки из базы…</div>
    <section v-else class="notification-block delivery-history-list">
      <article v-for="row in filtered" :key="row.id" class="notification-row delivery-history-row" :class="{historical:row.historical}">
        <button @click="open(row)"><div class="row-title-line"><strong>{{eventLabel(row.eventType)}} · {{row.clientName||`VK ${row.peerId}`}}</strong><span class="source-badge" :class="row.historical?'historical':'actual'">{{row.historical?'История до журнала':'Фактическая доставка'}}</span></div><span>{{row.snippet||'Без текста'}}</span><small>Получатель: {{row.historical?'не фиксировался':(row.recipientManager||'—')}} · Менеджер лида: {{row.leadManager||'—'}} · {{row.crmStatus||'статус не указан'}}</small><em>{{dateTime(row.createdAt)}} · {{channelLabel(row)}} · {{resultLabel(row)}}</em><small v-if="row.filterSnapshot&&!row.historical">Фильтр: {{(row.filterSnapshot.managerFilters||[]).join(', ')||'—'}} · {{(row.filterSnapshot.statuses||[]).join(', ')||'—'}} · {{row.filterSnapshot.workStart||'—'}}–{{row.filterSnapshot.workEnd||'—'}} МСК</small><small v-if="row.historical" class="historical-explanation">{{row.explanation}}</small></button>
        <div v-if="!row.historical" class="delivery-channel-badges"><b :class="channelStatus(row,'telegram')==='sent'?'answered-badge':'waiting-badge'">TG: {{channelStatusLabel(channelStatus(row,'telegram'))}}</b><b :class="channelStatus(row,'browser')==='sent'?'answered-badge':'waiting-badge'">Браузер: {{channelStatusLabel(channelStatus(row,'browser'))}}</b></div>
        <div v-else class="delivery-channel-badges"><b class="neutral-badge">TG: нет данных</b><b class="neutral-badge">Браузер: нет данных</b></div>
      </article>
      <div v-if="!filtered.length" class="empty-state"><b>{{bootstrapRunning?'История ещё собирается':'Записей нет'}}</b><span>{{bootstrapRunning?'CRM продолжает первичную проверку диалогов. Старые события появятся автоматически.':'По выбранному фильтру уведомления не найдены.'}}</span></div>
    </section>
  </main>
</template>
