<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDialogsStore } from '../stores/dialogs'
import { useMetaStore } from '../stores/meta'
import { useUiStore } from '../stores/ui'
import DialogRow from '../components/DialogRow.vue'
import MultiFilterSheet from '../components/MultiFilterSheet.vue'

const dialogs = useDialogsStore()
const meta = useMetaStore()
const ui = useUiStore()
const router = useRouter()
const route = useRoute()
const activeSheet = computed(() => String(route.query.sheet || ''))
let searchTimer

const managerOptions = computed(() => meta.users.map(u => ({ value: u.name || u.login, label: u.name || u.login })))
const statusOptions = computed(() => meta.statuses.map(s => ({ value: s.name || s, label: s.name || s })))
const visible = computed(() => dialogs.filteredItems)

async function reload() {
  try { await dialogs.load({ reset: true, all: true }) } catch (e) { ui.toast(e.message, 'error') }
}
function openSheet(name) { router.push({ path: route.path, query: { ...route.query, sheet: name } }) }
function closeSheet() { if (activeSheet.value) router.back() }
function applyFilter() { closeSheet() }
function onSearch() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(reload, 320)
}

onMounted(async () => {
  await Promise.allSettled([meta.load(), reload()])
  dialogs.startPolling()
})
onBeforeUnmount(() => { dialogs.stopPolling(); clearTimeout(searchTimer) })
watch(() => dialogs.filter, reload)
</script>

<template>
  <main class="page page-with-nav">
    <header class="page-header sticky-header">
      <div><small>VK + BLUESALES</small><h1>Диалоги</h1></div>
      <button type="button" class="header-action" @click="ui.toggleTheme()">{{ ui.theme === 'dark' ? '☀' : '☾' }}</button>
    </header>

    <section class="toolbar-card">
      <div class="search-control"><span>⌕</span><input v-model="dialogs.search" placeholder="Имя, VK ID, телефон, email" @input="onSearch"></div>
      <div class="segmented">
        <button v-for="f in [['all','Все'],['unread','Непрочитанные'],['unanswered','Неотвеченные']]" :key="f[0]" :class="{active: dialogs.filter===f[0]}" @click="dialogs.filter=f[0]">{{ f[1] }}</button>
      </div>
      <div class="filter-buttons">
        <button type="button" @click="openSheet('manager')">Менеджеры <b v-if="dialogs.manager.length">{{ dialogs.manager.length }}</b><span>▾</span></button>
        <button type="button" @click="openSheet('status')">Статусы <b v-if="dialogs.status.length">{{ dialogs.status.length }}</b><span>▾</span></button>
      </div>
    </section>

    <div class="list-status" v-if="dialogs.loading"><span class="tiny-spinner"></span> Загружаю диалоги…</div>
    <div class="list-status" v-else-if="dialogs.loadingMore"><span class="tiny-spinner"></span> Уже показано {{ dialogs.items.length }} · догружаю остальные…</div>
    <div class="list-status success" v-else-if="dialogs.loadedAll">Загружено {{ dialogs.items.length }} диалогов</div>

    <section class="dialog-list">
      <button v-for="d in visible" :key="d.peerId" type="button" class="dialog-button" @click="router.push(`/dialogs/${d.peerId}`)">
        <DialogRow :dialog="d" />
      </button>
      <div v-if="!dialogs.loading && !visible.length" class="empty-state"><b>Диалогов нет</b><span>Измените фильтр или поиск.</span></div>
    </section>

    <MultiFilterSheet :open="activeSheet==='manager'" title="Менеджеры" :options="managerOptions" v-model="dialogs.manager" @apply="applyFilter" @close="closeSheet" />
    <MultiFilterSheet :open="activeSheet==='status'" title="CRM-статусы" :options="statusOptions" v-model="dialogs.status" @apply="applyFilter" @close="closeSheet" />
  </main>
</template>
