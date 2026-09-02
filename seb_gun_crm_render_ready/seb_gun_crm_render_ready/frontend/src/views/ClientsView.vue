<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useClientsStore } from '../stores/clients'
import { useMetaStore } from '../stores/meta'
import { useUiStore } from '../stores/ui'
import MultiFilterSheet from '../components/MultiFilterSheet.vue'

const clients = useClientsStore()
const meta = useMetaStore()
const ui = useUiStore()
const router = useRouter()
const route = useRoute()
const sheet = computed(() => String(route.query.sheet || ''))
let timer
const managers = computed(() => meta.users.map(u => ({ value:u.name||u.login, label:u.name||u.login })))
const statuses = computed(() => meta.statuses.map(s => ({ value:s.name||s, label:s.name||s })))
const tags = computed(() => meta.tags.map(t => ({ value:t.name||t, label:t.name||t })))
function search(){clearTimeout(timer);timer=setTimeout(()=>clients.load().catch(e=>ui.toast(e.message,'error')),300)}
function openSheet(name){router.push({path:route.path,query:{...route.query,sheet:name}})}
function closeSheet(){if(sheet.value)router.back()}
function apply(){clients.load().catch(e=>ui.toast(e.message,'error'));closeSheet()}
function fmt(d){if(!d)return'';try{return new Date(String(d).replace(' ','T')).toLocaleDateString('ru-RU')}catch{return d}}
onMounted(async()=>{await Promise.allSettled([meta.load(),clients.load()])})
</script>
<template>
  <main class="page page-with-nav">
    <header class="page-header sticky-header"><div><small>BLUESALES</small><h1>Клиенты</h1></div><span class="count-badge">{{ clients.items.length }}</span></header>
    <section class="toolbar-card">
      <div class="search-control"><span>⌕</span><input v-model="clients.q" placeholder="ФИО, телефон, email, VK ID" @input="search"></div>
      <div class="filter-buttons three"><button @click="openSheet('manager')">Менеджер <b v-if="clients.manager.length">{{clients.manager.length}}</b><span>▾</span></button><button @click="openSheet('status')">Статус <b v-if="clients.status.length">{{clients.status.length}}</b><span>▾</span></button><button @click="openSheet('tag')">Теги <b v-if="clients.tag.length">{{clients.tag.length}}</b><span>▾</span></button></div>
    </section>
    <div v-if="clients.loading" class="list-status"><span class="tiny-spinner"></span> Загружаю клиентов…</div>
    <section class="card-list">
      <button v-for="c in clients.items" :key="c.id" type="button" class="client-row" @click="c.social?.vkId ? router.push(`/dialogs/${c.social.vkId}`) : null">
        <div class="client-main"><strong>{{c.fullName}}</strong><span v-if="c.crmStatus" class="meta-pill">{{c.crmStatus}}</span><small>{{c.phone || c.email || 'Контакты не указаны'}}</small><div class="tags"><i v-for="t in c.tags||[]" :key="t.name||t">{{t.name||t}}</i></div></div>
        <div class="client-side"><span>{{c.manager||''}}</span><time>{{fmt(c.nextContactDate)}}</time><b>{{c.social?.vkId ? 'Открыть ›' : 'Без VK'}}</b></div>
      </button>
    </section>
    <MultiFilterSheet :open="sheet==='manager'" title="Менеджеры" :options="managers" v-model="clients.manager" @apply="apply" @close="closeSheet"/>
    <MultiFilterSheet :open="sheet==='status'" title="CRM-статусы" :options="statuses" v-model="clients.status" @apply="apply" @close="closeSheet"/>
    <MultiFilterSheet :open="sheet==='tag'" title="Теги" :options="tags" v-model="clients.tag" @apply="apply" @close="closeSheet"/>
  </main>
</template>
