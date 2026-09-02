<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useRemindersStore } from '../stores/reminders'
import { useMetaStore } from '../stores/meta'
import { useUiStore } from '../stores/ui'
import MultiFilterSheet from '../components/MultiFilterSheet.vue'

const reminders=useRemindersStore(), meta=useMetaStore(), ui=useUiStore(), router=useRouter(), route=useRoute()
const sheet=computed(()=>String(route.query.sheet||'')), timer=ref(null)
const managers=computed(()=>meta.users.map(u=>({value:u.name||u.login,label:u.name||u.login})))
const statuses=computed(()=>meta.statuses.map(s=>({value:s.name||s,label:s.name||s})))
const tags=computed(()=>meta.tags.map(t=>({value:t.name||t,label:t.name||t})))
const tabs=[['today','Сегодня'],['tomorrow','Завтра'],['future','Будущие'],['overdue','Просроченные']]
function fmt(v){if(!v)return'';const s=String(v).replace(' ','T');const d=new Date(s);return Number.isNaN(d.getTime())?String(v):d.toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}
function openSheet(name){router.push({path:route.path,query:{...route.query,sheet:name}})}
function closeSheet(){if(sheet.value)router.back()}
function apply(){reminders.load().catch(e=>ui.toast(e.message,'error'));closeSheet()}
async function remove(r){if(!confirm(`Убрать напоминание у ${r.fullName}?`))return;try{await reminders.remove(r.id);ui.toast('Напоминание убрано','ok')}catch(e){ui.toast(e.message,'error')}}
onMounted(async()=>{await Promise.allSettled([meta.load(),reminders.load()]);timer.value=setInterval(()=>{if(document.visibilityState==='visible')reminders.load().catch(()=>{})},60000)})
onBeforeUnmount(()=>clearInterval(timer.value))
</script>
<template>
  <main class="page page-with-nav">
    <header class="page-header sticky-header"><div><small>BLUESALES · {{reminders.clock?.timezone||'Europe/Moscow'}}</small><h1>Напоминания</h1></div><span class="clock-badge">{{reminders.clock?.localTime||'—:—'}}</span></header>
    <section class="toolbar-card">
      <div class="segmented reminder-tabs"><button v-for="[id,label] in tabs" :key="id" :class="{active:reminders.tab===id}" @click="reminders.tab=id">{{label}} <b>{{reminders.groups[id]?.length||0}}</b></button></div>
      <div class="filter-buttons three"><button @click="openSheet('manager')">Менеджер <b v-if="reminders.manager.length">{{reminders.manager.length}}</b><span>▾</span></button><button @click="openSheet('status')">Статус <b v-if="reminders.status.length">{{reminders.status.length}}</b><span>▾</span></button><button @click="openSheet('tag')">Теги <b v-if="reminders.tag.length">{{reminders.tag.length}}</b><span>▾</span></button></div>
    </section>
    <div v-if="reminders.loading" class="list-status"><span class="tiny-spinner"></span> Сверяю дату и время…</div>
    <section class="card-list">
      <article v-for="r in reminders.current" :key="r.id" class="reminder-card">
        <button type="button" class="reminder-open" @click="r.vkId && router.push(`/dialogs/${r.vkId}`)"><strong>{{r.fullName}}</strong><span class="meta-pill" v-if="r.crmStatus">{{r.crmStatus}}</span><small>{{r.manager}}</small><time>{{fmt(r.nextContactDate)}}</time></button>
        <button type="button" class="remove-reminder" @click="remove(r)">×</button>
      </article>
      <div v-if="!reminders.loading&&!reminders.current.length" class="empty-state"><b>Нет напоминаний</b><span>Для выбранного периода и фильтров.</span></div>
    </section>
    <MultiFilterSheet :open="sheet==='manager'" title="Менеджеры" :options="managers" v-model="reminders.manager" @apply="apply" @close="closeSheet"/>
    <MultiFilterSheet :open="sheet==='status'" title="CRM-статусы" :options="statuses" v-model="reminders.status" @apply="apply" @close="closeSheet"/>
    <MultiFilterSheet :open="sheet==='tag'" title="Теги" :options="tags" v-model="reminders.tag" @apply="apply" @close="closeSheet"/>
  </main>
</template>
