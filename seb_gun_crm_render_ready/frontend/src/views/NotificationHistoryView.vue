<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../services/api'
import { useMetaStore } from '../stores/meta'
import { useUiStore } from '../stores/ui'

const route=useRoute(),router=useRouter(),meta=useMetaStore(),ui=useUiStore()
const loading=ref(false),rows=ref([]),recipient=ref(''),leadManager=ref(''),crmStatus=ref(''),eventType=ref(''),channel=ref(''),deliveryStatus=ref(''),dateFrom=ref(''),dateTo=ref(''),search=ref('')
const eventOptions=[['','Все события'],['sla_warning','Предупреждение по времени ответа'],['sla_violation','Нарушение регламента'],['outbox_stuck','Зависшее исходящее']]
const channelOptions=[['','Все каналы'],['telegram','Telegram'],['browser','Браузер'],['both','Telegram + браузер'],['none','Ничего не отправлено']]
const statusOptions=[['','Любой результат'],['sent','Отправлено'],['partial','Частично'],['pending','Ожидает'],['failed','Не отправлено']]
const recipients=computed(()=>[...new Set(rows.value.map(x=>x.recipientManager).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru')))
const leadManagers=computed(()=>[...new Set([...meta.users.map(u=>u.name||u.login),...rows.value.map(x=>x.leadManager)].filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru')))
const statuses=computed(()=>[...new Set([...meta.statuses.map(s=>s.name||s),...rows.value.map(x=>x.crmStatus)].filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru')))
function day(ms){return ms?new Date(Number(ms)).toLocaleDateString('en-CA',{timeZone:'Europe/Moscow'}):''}
function dateTime(ms){return ms?new Date(Number(ms)).toLocaleString('ru-RU',{timeZone:'Europe/Moscow',day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—'}
function eventLabel(type){return type==='sla_violation'?'Нарушение':type==='outbox_stuck'?'Зависшее сообщение':'Предупреждение'}
function channelStatus(row,name){return String(row?.channels?.[name]?.status||'not_requested')}
function channelStatusLabel(value){return value==='sent'?'доставлено':value==='pending'?'ожидает':value==='failed'?'ошибка':value==='blocked'?'запрещено':value==='missed'?'не получено':'не подключено'}
function channelLabel(row){const tg=channelStatus(row,'telegram'),br=channelStatus(row,'browser'),tgSent=tg==='sent',brSent=br==='sent';if(tgSent&&brSent)return'Telegram + браузер';if(tgSent)return'Telegram';if(brSent)return'Браузер';if(tg==='pending'||br==='pending')return'Ожидает доставки';return'Не отправлено'}
function resultLabel(row){return row.overallStatus==='sent'?'Отправлено':row.overallStatus==='partial'?'Частично':row.overallStatus==='pending'?'Ожидает':'Не отправлено'}
function channelMatches(row){if(!channel.value)return true;const tg=channelStatus(row,'telegram'),br=channelStatus(row,'browser');if(channel.value==='telegram')return tg==='sent';if(channel.value==='browser')return br==='sent';if(channel.value==='both')return tg==='sent'&&br==='sent';if(channel.value==='none')return tg!=='sent'&&br!=='sent';return true}
const filtered=computed(()=>rows.value.filter(row=>{
  const q=search.value.trim().toLocaleLowerCase('ru-RU');if(q&&!`${row.clientName||''} ${row.recipientManager||''} ${row.leadManager||''} ${row.crmStatus||''} ${row.snippet||''}`.toLocaleLowerCase('ru-RU').includes(q))return false
  if(recipient.value&&row.recipientManager!==recipient.value)return false;if(leadManager.value&&row.leadManager!==leadManager.value)return false;if(crmStatus.value&&row.crmStatus!==crmStatus.value)return false;if(eventType.value&&row.eventType!==eventType.value)return false;if(deliveryStatus.value&&row.overallStatus!==deliveryStatus.value)return false;if(dateFrom.value&&day(row.createdAt)<dateFrom.value)return false;if(dateTo.value&&day(row.createdAt)>dateTo.value)return false;return channelMatches(row)
}))
function reset(){recipient.value='';leadManager.value='';crmStatus.value='';eventType.value='';channel.value='';deliveryStatus.value='';dateFrom.value='';dateTo.value='';search.value=''}
async function load(){loading.value=true;try{await meta.load();const d=await api.notificationHistory();rows.value=d.rows||[]}catch(e){ui.toast(e.message,'error',7000)}finally{loading.value=false}}
function open(row){if(row.peerId)router.push({path:`/dialogs/${row.peerId}`,query:{from:route.fullPath}})}
onMounted(load)
</script>

<template>
  <main class="page page-with-nav notification-history-page">
    <header class="page-header sticky-header"><div><small>АУДИТ ДОСТАВКИ · МСК</small><h1>История уведомлений</h1></div><button class="header-action" :disabled="loading" @click="load">↻</button></header>
    <section class="settings-card control-links-card"><button @click="router.push('/notifications')"><span>⚙️</span><div><b>Настройка уведомлений</b><small>Получатели, менеджеры, статусы, дни, время и каналы доставки</small></div><em>›</em></button></section>
    <section class="settings-card"><div class="section-title-row"><div><h3>Отдельный журнал отправок</h3><p>Здесь видно, кому и когда CRM пыталась отправить уведомление, по какому менеджеру/статусу и каким каналом: Telegram, браузер, оба сразу или ни одним.</p></div><b>{{filtered.length}}</b></div>
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
    <div v-if="loading" class="list-status"><span class="tiny-spinner"></span> Загружаю журнал доставки…</div>
    <section v-else class="notification-block delivery-history-list">
      <article v-for="row in filtered" :key="row.id" class="notification-row delivery-history-row">
        <button @click="open(row)"><strong>{{eventLabel(row.eventType)}} · {{row.clientName||`VK ${row.peerId}`}}</strong><span>{{row.snippet||'Без текста'}}</span><small>Получатель: {{row.recipientManager||'—'}} · Менеджер лида: {{row.leadManager||'—'}} · {{row.crmStatus||'статус не указан'}}</small><em>{{dateTime(row.createdAt)}} · {{channelLabel(row)}} · {{resultLabel(row)}}</em><small v-if="row.filterSnapshot">Фильтр: {{(row.filterSnapshot.managerFilters||[]).join(', ')||'—'}} · {{(row.filterSnapshot.statuses||[]).join(', ')||'—'}} · {{row.filterSnapshot.workStart||'—'}}–{{row.filterSnapshot.workEnd||'—'}} МСК</small></button>
        <div class="delivery-channel-badges"><b :class="channelStatus(row,'telegram')==='sent'?'answered-badge':'waiting-badge'">TG: {{channelStatusLabel(channelStatus(row,'telegram'))}}</b><b :class="channelStatus(row,'browser')==='sent'?'answered-badge':'waiting-badge'">Браузер: {{channelStatusLabel(channelStatus(row,'browser'))}}</b></div>
      </article>
      <div v-if="!filtered.length" class="empty-state"><b>Записей нет</b><span>По выбранному фильтру уведомления не найдены.</span></div>
    </section>
  </main>
</template>
