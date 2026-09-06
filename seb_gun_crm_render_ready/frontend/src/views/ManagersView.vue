<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../services/api'
import { useMetaStore } from '../stores/meta'
import { useSessionStore } from '../stores/session'
import { useUiStore } from '../stores/ui'
import MultiFilterSheet from '../components/MultiFilterSheet.vue'

const route=useRoute(),router=useRouter(),meta=useMetaStore(),session=useSessionStore(),ui=useUiStore()
const loading=ref(false),saving=ref(false),filterSheet=ref(''),report=ref({rows:[],managers:[],totals:{}}),tab=ref('managers'),dialogFolder=ref('all'),dateFrom=ref(''),dateTo=ref('')
const form=reactive({managerFilters:[],statuses:[],workDays:[1,2,3,4,5,6,7],workStart:'10:00',workEnd:'22:00',slaMinutes:8,violationMinutes:20,timezone:'Europe/Moscow'})
const managerOptions=computed(()=>meta.users.map(u=>({value:u.name||u.login,label:u.name||u.login})).filter(x=>x.value))
const statusOptions=computed(()=>meta.statuses.map(s=>({value:s.name||s,label:s.name||s})).filter(x=>x.value))
const days=['Пн','Вт','Ср','Чт','Пт','Сб','Вс']
function applySettings(value={}){Object.assign(form,{managerFilters:[...(value.managerFilters||[])],statuses:[...(value.statuses||[])],workDays:[...(value.workDays||[1,2,3,4,5,6,7])],workStart:value.workStart||'10:00',workEnd:value.workEnd||'22:00',slaMinutes:Number(value.slaMinutes||8),violationMinutes:Number(value.violationMinutes||20),timezone:'Europe/Moscow'})}
function dateTime(seconds){return seconds?new Date(Number(seconds)*1000).toLocaleString('ru-RU',{timeZone:'Europe/Moscow',day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'}):'—'}
function waitLabel(minutes){const m=Math.max(0,Number(minutes||0));if(m<60)return`${m} мин`;return`${Math.floor(m/60)} ч ${m%60} мин`}
function rowDay(row){return new Date(Number(row.receivedAt||0)*1000).toLocaleDateString('en-CA',{timeZone:'Europe/Moscow'})}
function managerPath(row){const values=[row.managerAtReceipt,row.manager,...(row.managerHistory||[]).flatMap(x=>[x.fromManager,x.toManager||x.manager]),row.currentManager].map(x=>String(x||'').trim()).filter(Boolean),out=[];for(const value of values)if(!out.length||out[out.length-1]!==value)out.push(value);return out.join(' → ')||'Не назначен'}
const visibleRows=computed(()=>report.value.rows.filter(row=>(!dateFrom.value||rowDay(row)>=dateFrom.value)&&(!dateTo.value||rowDay(row)<=dateTo.value)))
const folderRows=computed(()=>visibleRows.value.filter(row=>dialogFolder.value==='all'||(dialogFolder.value==='violations'&&row.violated)||(dialogFolder.value==='waiting'&&row.waiting)||(dialogFolder.value==='on_time'&&!row.waiting&&!row.violated)))
const folderCounts=computed(()=>({all:visibleRows.value.length,violations:visibleRows.value.filter(x=>x.violated).length,on_time:visibleRows.value.filter(x=>!x.waiting&&!x.violated).length,waiting:visibleRows.value.filter(x=>x.waiting).length}))
const visibleStats=computed(()=>{
  if(!dateFrom.value&&!dateTo.value)return report.value.managers||[]
  const map=new Map();for(const row of visibleRows.value){const key=row.responsibleManager||'Не назначен',x=map.get(key)||{manager:key,total:0,answered:0,onTime:0,violations:0,waiting:0,responseTotal:0,responseCount:0,maxResponseMinutes:0};x.total++;if(row.waiting)x.waiting++;else{x.answered++;x.responseTotal+=row.workingResponseMinutes;x.responseCount++;x.maxResponseMinutes=Math.max(x.maxResponseMinutes,row.workingResponseMinutes);if(row.onTime)x.onTime++}if(row.violated)x.violations++;map.set(key,x)}return [...map.values()].map(x=>({...x,averageResponseMinutes:x.responseCount?Math.round(x.responseTotal/x.responseCount):0})).sort((a,b)=>b.violations-a.violations||b.total-a.total)
})
const visibleTotals=computed(()=>visibleStats.value.reduce((a,x)=>({total:a.total+x.total,answered:a.answered+x.answered,onTime:a.onTime+x.onTime,violations:a.violations+x.violations,waiting:a.waiting+x.waiting}),{total:0,answered:0,onTime:0,violations:0,waiting:0}))
async function load(){loading.value=true;try{await meta.load();const d=await api.slaReport();report.value=d;applySettings(d.settings)}catch(e){ui.toast(e.message,'error',7000)}finally{loading.value=false}}
async function save(){if(!form.workDays.length)return ui.toast('Выберите хотя бы один рабочий день','error');saving.value=true;try{const d=await api.saveSlaSettings({...form,timezone:'Europe/Moscow'});applySettings(d.settings);ui.toast('Фильтр и регламент сохранены в базе','ok');await load()}catch(e){ui.toast(e.message,'error',7000)}finally{saving.value=false}}
function openDialog(peerId){router.push({path:`/dialogs/${peerId}`,query:{from:route.fullPath}})}
async function removeRow(row){if(!session.isAdmin||!confirm(`Удалить запись «${row.name}» из SLA-истории и статистики?`))return;try{await api.deleteAdminNotificationJournal(row.id);ui.toast('Запись удалена из статистики','ok');await load()}catch(e){ui.toast(e.message,'error')}}
onMounted(load)
</script>

<template>
  <main class="page page-with-nav sla-page">
    <header class="page-header sticky-header"><div><small>SLA · МСК</small><h1>Менеджеры</h1></div><button class="header-action" :disabled="loading" @click="load">↻</button></header>

    <section class="settings-card sla-settings-card">
      <div class="section-title-row"><div><h3>Регламент и фильтр отчёта</h3><p>Настройки сохраняются отдельно от Telegram и используются для статистики «вовремя / нарушение».</p></div><b class="storage-badge">{{report.storage==='postgresql'?'PostgreSQL':'JSON'}}</b></div>
      <div class="filter-buttons"><button type="button" @click="filterSheet='manager'"><span>Менеджеры</span><b>{{form.managerFilters.length||'Все'}}</b><span>▾</span></button><button type="button" @click="filterSheet='status'"><span>CRM-статусы</span><b>{{form.statuses.length||'Все'}}</b><span>▾</span></button></div>
      <div class="weekday-grid"><label v-for="(day,i) in days" :key="day" :class="{active:form.workDays.includes(i+1)}"><input v-model="form.workDays" type="checkbox" :value="i+1"><span>{{day}}</span></label></div>
      <div class="form-grid"><label>Рабочий день от, МСК<input v-model="form.workStart" type="time"></label><label>Рабочий день до, МСК<input v-model="form.workEnd" type="time"></label></div>
      <div class="form-grid"><label>Время ответа / предупреждение, мин<input v-model.number="form.slaMinutes" type="number" min="1" max="240"></label><label>Нарушение регламента после, мин<input v-model.number="form.violationMinutes" type="number" min="1" max="1440"></label></div>
      <p class="settings-hint">Ответ меньше {{form.violationMinutes}} рабочих минут считается «вовремя». Начиная с {{form.violationMinutes}} — нарушение. Порог {{form.slaMinutes}} минут используется как раннее предупреждение.</p>
      <button class="primary-btn" :disabled="saving" @click="save">{{saving?'Сохраняю…':'Сохранить регламент'}}</button>
    </section>

    <section class="sla-summary-grid">
      <article><small>Диалогов</small><b>{{visibleTotals.total}}</b></article><article><small>Вовремя</small><b>{{visibleTotals.onTime}}</b></article><article class="danger-stat"><small>Нарушений</small><b>{{visibleTotals.violations}}</b></article><article><small>Ждут ответа</small><b>{{visibleTotals.waiting}}</b></article>
    </section>

    <div class="segmented two report-tabs"><button :class="{active:tab==='managers'}" @click="tab='managers'">По менеджерам</button><button :class="{active:tab==='dialogs'}" @click="tab='dialogs'">Диалоги {{visibleRows.length}}</button></div>
    <div class="journal-filters compact-date-filter"><label>Дата от<input v-model="dateFrom" type="date"></label><label>Дата до<input v-model="dateTo" type="date"></label><button v-if="dateFrom||dateTo" class="danger-link" @click="dateFrom='';dateTo=''">Сбросить даты</button></div>
    <div v-if="loading" class="list-status"><span class="tiny-spinner"></span> Считаю рабочее время и историю…</div>

    <section v-if="!loading&&tab==='managers'" class="manager-stat-list">
      <article v-for="m in visibleStats" :key="m.manager" class="manager-stat-card">
        <header><strong>{{m.manager}}</strong><b :class="m.violations?'danger-text':'connected-text'">{{m.violations}} наруш.</b></header>
        <div><span>Диалогов <b>{{m.total}}</b></span><span>Вовремя <b>{{m.onTime}}</b></span><span>Ждут <b>{{m.waiting}}</b></span><span>Средний ответ <b>{{waitLabel(m.averageResponseMinutes)}}</b></span><span>Максимум <b>{{waitLabel(m.maxResponseMinutes)}}</b></span></div>
      </article>
      <div v-if="!visibleStats.length" class="empty-state"><b>Нет данных по фильтру</b><span>Измените менеджеров, статусы или даты.</span></div>
    </section>

    <section v-if="!loading&&tab==='dialogs'" class="lead-journal-folder-wrap">
      <div class="sla-folder-tabs"><button :class="{active:dialogFolder==='all'}" @click="dialogFolder='all'">Все {{folderCounts.all}}</button><button :class="{active:dialogFolder==='violations'}" @click="dialogFolder='violations'">Нарушения {{folderCounts.violations}}</button><button :class="{active:dialogFolder==='on_time'}" @click="dialogFolder='on_time'">Вовремя {{folderCounts.on_time}}</button><button :class="{active:dialogFolder==='waiting'}" @click="dialogFolder='waiting'">Ждут {{folderCounts.waiting}}</button></div>
      <section class="notification-block lead-journal">
      <article v-for="d in folderRows" :key="d.id" class="notification-row journal-row">
        <button @click="openDialog(d.peerId)"><strong>{{d.name}}</strong><span><b>Клиент:</b> {{d.snippet||'Входящее сообщение'}}</span><span v-if="d.responseText"><b>{{d.responseAuthor||'Менеджер'}}:</b> {{d.responseText}}</span><small>Ответственный за результат: {{d.responsibleManager}}<template v-if="d.currentCrmStatus||d.crmStatus"> · Статус: {{d.currentCrmStatus||d.crmStatus}}</template></small><small v-if="managerPath(d)!==d.responsibleManager">История менеджеров: {{managerPath(d)}}</small><em>Получено: {{dateTime(d.receivedAt)}} · предупреждение: {{dateTime(d.notificationAt)}} · нарушение: {{dateTime(d.violationAt)}}</em><em v-if="d.answeredAt">Ответ: {{dateTime(d.answeredAt)}}</em></button>
        <div class="journal-state"><b :class="d.violated?'waiting-badge':'answered-badge'">{{d.violated?'Нарушение':d.waiting?'Ждёт':'Вовремя'}}</b><time>{{waitLabel(d.workingResponseMinutes)}} рабочего времени</time><button v-if="session.isAdmin" class="danger-link" @click="removeRow(d)">Удалить</button></div>
      </article>
      <div v-if="!folderRows.length" class="empty-state"><b>В этой папке нет диалогов</b><span>Первичная проверка раскладывает старые диалоги по папкам один раз; новые события добавляются уже по текущей работе CRM.</span></div>
      </section>
    </section>

    <MultiFilterSheet :open="filterSheet==='manager'" title="Менеджеры отчёта" :options="managerOptions" v-model="form.managerFilters" @apply="filterSheet=''" @close="filterSheet=''"/>
    <MultiFilterSheet :open="filterSheet==='status'" title="CRM-статусы отчёта" :options="statusOptions" v-model="form.statuses" @apply="filterSheet=''" @close="filterSheet=''"/>
  </main>
</template>
