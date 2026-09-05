<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../services/api'
import { useRemindersStore } from '../stores/reminders'
import { useMetaStore } from '../stores/meta'
import { useUiStore } from '../stores/ui'
import MultiFilterSheet from '../components/MultiFilterSheet.vue'
import { arrayFromQuery, listQuery } from '../utils/navigation'
import { managerStyle, statusStyle } from '../utils/colors'

const reminders=useRemindersStore(), meta=useMetaStore(), ui=useUiStore(), router=useRouter(), route=useRoute()
const sheet=computed(()=>String(route.query.sheet||'')), timer=ref(null),viewMode=ref('list'),reschedule=ref(null)
const rescheduleForm=reactive({nextContactDate:'',note:''})
const calendarMonth=ref(new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Moscow'}).slice(0,7))
reminders.tab=['today','tomorrow','future','overdue'].includes(String(route.query.bucket||'today'))?String(route.query.bucket||'today'):'today'
reminders.manager=arrayFromQuery(route.query.manager)
reminders.status=arrayFromQuery(route.query.status)
reminders.tag=arrayFromQuery(route.query.tag)
const managers=computed(()=>meta.users.map(u=>({value:u.login||u.name,label:u.name||u.login})))
const statuses=computed(()=>meta.statuses.map(s=>({value:s.name||s,label:s.name||s})))
const tags=computed(()=>meta.tags.map(t=>({value:t.name||t,label:t.name||t})))
const tabs=[['today','Сегодня'],['tomorrow','Завтра'],['future','Будущие'],['overdue','Просроченные']]
const allReminders=computed(()=>{const map=new Map();for(const rows of Object.values(reminders.groups))for(const row of rows)map.set(String(row.id),row);return[...map.values()]})
const calendarGroups=computed(()=>{const map=new Map();for(const row of allReminders.value){const day=String(row.nextContactDate||'').slice(0,10);if(!day||!day.startsWith(calendarMonth.value))continue;if(!map.has(day))map.set(day,[]);map.get(day).push(row)}return[...map.entries()].sort((a,b)=>a[0].localeCompare(b[0]))})
function fmt(v){if(!v)return'';const s=String(v).replace(' ','T');const d=new Date(s);return Number.isNaN(d.getTime())?String(v):d.toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}
function stateQuery(extra={}){return listQuery({bucket:reminders.tab,manager:reminders.manager,status:reminders.status,tag:reminders.tag},extra)}
function sync(extra={}){return router.replace({path:'/reminders',query:stateQuery(extra)})}
function openSheet(name){router.push({path:'/reminders',query:stateQuery({sheet:name})})}
function closeSheet(){if(sheet.value)router.back()}
function apply(){sync();reminders.load().catch(e=>ui.toast(e.message,'error'))}
async function remove(r){if(!confirm(`Убрать напоминание у ${r.fullName}?`))return;try{await reminders.remove(r.id);ui.toast('Напоминание убрано','ok')}catch(e){ui.toast(e.message,'error')}}
function toInput(value){const raw=String(value||'').replace(' ','T');return raw.length>=16?raw.slice(0,16):`${raw.slice(0,10)}T10:00`}
function openReschedule(row){reschedule.value=row;rescheduleForm.nextContactDate=toInput(row.nextContactDate);rescheduleForm.note=''}
async function saveReschedule(){if(!rescheduleForm.nextContactDate||!rescheduleForm.note.trim())return ui.toast('Укажите дату, время и что пообещали клиенту','error');try{await api.rescheduleReminder(reschedule.value.id,{...rescheduleForm});ui.toast('Контакт перенесён и записан в историю клиента','ok');reschedule.value=null;await reminders.load()}catch(e){ui.toast(e.message,'error',6000)}}
onMounted(async()=>{await Promise.allSettled([meta.load(),reminders.load()]);timer.value=setInterval(()=>{if(document.visibilityState==='visible')reminders.load().catch(()=>{})},60000)})
onBeforeUnmount(()=>clearInterval(timer.value))
watch(()=>reminders.tab,()=>sync())
</script>
<template>
  <main class="page page-with-nav">
    <header class="page-header sticky-header"><div><small>BLUESALES · {{reminders.clock?.timezone||'Europe/Moscow'}}</small><h1>Календарь</h1></div><span class="clock-badge">{{reminders.clock?.localTime||'—:—'}}</span></header>
    <section class="toolbar-card">
      <div class="segmented two"><button :class="{active:viewMode==='list'}" @click="viewMode='list'">Список</button><button :class="{active:viewMode==='calendar'}" @click="viewMode='calendar'">Календарь</button></div><div v-if="viewMode==='list'" class="segmented reminder-tabs"><button v-for="[id,label] in tabs" :key="id" :class="{active:reminders.tab===id}" @click="reminders.tab=id">{{label}} <b>{{reminders.groups[id]?.length||0}}</b></button></div><label v-else class="calendar-month">Месяц<input v-model="calendarMonth" type="month"></label>
      <div class="filter-buttons three"><button @click="openSheet('manager')">Менеджер <b v-if="reminders.manager.length">{{reminders.manager.length}}</b><span>▾</span></button><button @click="openSheet('status')">Статус <b v-if="reminders.status.length">{{reminders.status.length}}</b><span>▾</span></button><button @click="openSheet('tag')">Теги <b v-if="reminders.tag.length">{{reminders.tag.length}}</b><span>▾</span></button></div>
    </section>
    <div v-if="reminders.loading" class="list-status"><span class="tiny-spinner"></span> Сверяю дату и время…</div>
    <section v-if="viewMode==='list'" class="card-list">
      <article v-for="r in reminders.current" :key="r.id" class="reminder-card">
        <button type="button" class="reminder-open" @click="r.vkId && router.push({path:`/dialogs/${r.vkId}`,query:{from:route.fullPath}})"><strong>{{r.fullName}}</strong><span class="color-chip" v-if="r.crmStatus" :style="statusStyle(meta,r.crmStatus,r.crmStatusColor)">{{r.crmStatus}}</span><small><span v-if="r.manager" class="color-chip" :style="managerStyle(meta,r.manager,r.managerColor)">{{r.manager}}</span></small><time>{{fmt(r.nextContactDate)}}</time></button>
        <div class="reminder-actions"><button type="button" @click="openReschedule(r)">Перенести</button><a :href="`https://bluesales.ru/app/Customers/Customer.aspx?id=${r.id}`" target="_blank">BlueSales</a><button type="button" class="remove-reminder" @click="remove(r)">×</button></div>
      </article>
      <div v-if="!reminders.loading&&!reminders.current.length" class="empty-state"><b>Нет напоминаний</b><span>Для выбранного периода и фильтров.</span></div>
    </section>
    <section v-else class="calendar-board"><article v-for="[day,items] in calendarGroups" :key="day" class="calendar-day"><h3>{{new Date(`${day}T12:00:00`).toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long'})}} <b>{{items.length}}</b></h3><button v-for="r in items" :key="r.id" @click="openReschedule(r)"><time>{{fmt(r.nextContactDate)}}</time><strong>{{r.fullName}}</strong><span>{{r.manager||'Без менеджера'}} · {{r.crmStatus||'Без статуса'}}</span></button></article><div v-if="!calendarGroups.length" class="empty-state"><b>На этот месяц записей нет</b><span>Выберите другой месяц или назначьте следующий контакт.</span></div></section>
    <MultiFilterSheet :open="sheet==='manager'" title="Менеджеры" :options="managers" v-model="reminders.manager" @apply="apply" @close="closeSheet"/>
    <MultiFilterSheet :open="sheet==='status'" title="CRM-статусы" :options="statuses" v-model="reminders.status" @apply="apply" @close="closeSheet"/>
    <MultiFilterSheet :open="sheet==='tag'" title="Теги" :options="tags" v-model="reminders.tag" @apply="apply" @close="closeSheet"/>
    <Teleport to="body"><div v-if="reschedule" class="sheet-backdrop" @pointerdown.self="reschedule=null"><section class="bottom-sheet compact-editor-sheet"><header class="sheet-head"><div><small>КАЛЕНДАРЬ</small><h3>Перенести контакт</h3></div><button class="icon-circle" @click="reschedule=null">×</button></header><div class="admin-editor-scroll"><b>{{reschedule.fullName}}</b><label>Новая дата и время<input v-model="rescheduleForm.nextContactDate" type="datetime-local"></label><label>Что пообещали клиенту<textarea v-model="rescheduleForm.note" rows="4" placeholder="Например: договорились созвониться после работы"></textarea></label><p class="settings-hint">Старая дата, новая дата, менеджер и комментарий сохранятся в истории клиента.</p></div><footer class="sheet-actions"><button class="secondary-btn" @click="reschedule=null">Отмена</button><button class="primary-btn" @click="saveReschedule">Сохранить перенос</button></footer></section></div></Teleport>
  </main>
</template>
