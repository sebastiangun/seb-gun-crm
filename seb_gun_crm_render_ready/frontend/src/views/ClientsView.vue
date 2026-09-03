<script setup>
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useClientsStore } from '../stores/clients'
import { useMetaStore } from '../stores/meta'
import { useUiStore } from '../stores/ui'
import MultiFilterSheet from '../components/MultiFilterSheet.vue'
import { arrayFromQuery, listQuery } from '../utils/navigation'
import { managerStyle, statusStyle, tagStyle } from '../utils/colors'

const clients=useClientsStore(), meta=useMetaStore(), ui=useUiStore(), router=useRouter(), route=useRoute()
const sheet=computed(()=>String(route.query.sheet||''))
let timer
clients.q=String(route.query.q||'')
clients.manager=arrayFromQuery(route.query.manager)
clients.status=arrayFromQuery(route.query.status)
clients.tag=arrayFromQuery(route.query.tag)
const managers=computed(()=>meta.users.map(u=>({value:u.login||u.name,label:u.name||u.login})))
const statuses=computed(()=>meta.statuses.map(s=>({value:s.name||s,label:s.name||s})))
const tags=computed(()=>meta.tags.map(t=>({value:t.name||t,label:t.name||t})))
function stateQuery(extra={}){return listQuery({q:clients.q,manager:clients.manager,status:clients.status,tag:clients.tag},extra)}
function sync(extra={}){return router.replace({path:'/clients',query:stateQuery(extra)})}
function search(){clearTimeout(timer);sync(sheet.value?{sheet:sheet.value}:{});timer=setTimeout(()=>clients.load().catch(e=>ui.toast(e.message,'error')),320)}
function openSheet(name){router.push({path:'/clients',query:stateQuery({sheet:name})})}
function closeSheet(){if(sheet.value)router.back()}
function apply(){sync();clients.load().catch(e=>ui.toast(e.message,'error'))}
function openClient(c){if(!c.social?.vkId)return;router.push({path:`/dialogs/${c.social.vkId}`,query:{from:route.fullPath}})}
function fmt(d){if(!d)return'';const value=new Date(String(d).replace(' ','T'));return Number.isNaN(value.getTime())?String(d):value.toLocaleDateString('ru-RU')}
onMounted(async()=>{await Promise.allSettled([meta.load(),clients.load()])})
onBeforeUnmount(()=>clearTimeout(timer))
</script>
<template>
  <main class="page page-with-nav">
    <header class="page-header sticky-header"><div><small>BLUESALES</small><h1>Клиенты</h1></div><span class="count-badge">{{ clients.items.length }}<template v-if="clients.total>clients.items.length"> / {{clients.total}}</template></span></header>
    <section class="toolbar-card">
      <div class="search-control"><span>⌕</span><input v-model="clients.q" placeholder="ФИО, телефон, email, VK ID" @input="search"></div>
      <div class="filter-buttons three"><button @click="openSheet('manager')">Менеджер <b v-if="clients.manager.length">{{clients.manager.length}}</b><span>▾</span></button><button @click="openSheet('status')">Статус <b v-if="clients.status.length">{{clients.status.length}}</b><span>▾</span></button><button @click="openSheet('tag')">Теги <b v-if="clients.tag.length">{{clients.tag.length}}</b><span>▾</span></button></div>
    </section>
    <div v-if="clients.loading" class="list-status"><span class="tiny-spinner"></span> Загружаю первые 100 клиентов…</div>
    <section class="card-list">
      <button v-for="c in clients.items" :key="c.id" type="button" class="client-row" @click="openClient(c)">
        <div class="client-main"><strong>{{c.fullName}}</strong><span v-if="c.crmStatus" class="color-chip" :style="statusStyle(meta,c.crmStatus,c.crmStatusColor)">{{c.crmStatus}}</span><small>{{c.phone || c.email || 'Контакты не указаны'}}</small><div class="tags"><i v-for="t in c.tags||[]" :key="t.name||t" class="color-chip" :style="tagStyle(meta,t)">{{t.name||t}}</i></div></div>
        <div class="client-side"><span v-if="c.manager" class="color-chip" :style="managerStyle(meta,c.manager,c.managerColor)">{{c.manager}}</span><time>{{fmt(c.nextContactDate)}}</time><b>{{c.social?.vkId ? 'Открыть ›' : 'Без VK'}}</b></div>
      </button>
      <button v-if="clients.hasMore" type="button" class="load-more-btn" :disabled="clients.loadingMore" @click="clients.load({append:true}).catch(e=>ui.toast(e.message,'error'))">{{clients.loadingMore?'Загружаю…':'Показать ещё 100'}}</button>
    </section>
    <MultiFilterSheet :open="sheet==='manager'" title="Менеджеры" :options="managers" v-model="clients.manager" @apply="apply" @close="closeSheet"/>
    <MultiFilterSheet :open="sheet==='status'" title="CRM-статусы" :options="statuses" v-model="clients.status" @apply="apply" @close="closeSheet"/>
    <MultiFilterSheet :open="sheet==='tag'" title="Теги" :options="tags" v-model="clients.tag" @apply="apply" @close="closeSheet"/>
  </main>
</template>
