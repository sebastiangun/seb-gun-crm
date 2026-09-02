<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { api } from '../services/api'
import { useChatStore } from '../stores/chat'
import { useMetaStore } from '../stores/meta'
import { useUiStore } from '../stores/ui'

const props = defineProps({ open: Boolean })
const emit = defineEmits(['close'])
const chat = useChatStore()
const meta = useMetaStore()
const ui = useUiStore()
const tab = ref('client')
const saving = ref(false)
const orders = ref([])
const ordersLoading = ref(false)
const services = ref([])
const servicesLoading = ref(false)
const form = reactive({ fullName:'', phone:'', email:'', city:'', crmStatus:'', managerLogin:'', nextContactDate:'', shortNotes:'', comments:'' })

const client = computed(() => chat.crm)
function syncForm() {
  const c = client.value || {}
  Object.assign(form, {
    fullName: c.fullName || chat.peer?.name || '', phone: c.phone || '', email: c.email || '', city: c.city || '', crmStatus: c.crmStatus || '',
    managerLogin: c.managerLogin || '', nextContactDate: String(c.nextContactDate || '').slice(0,10), shortNotes: c.shortNotes || '', comments: c.comments || '',
  })
}
watch(() => props.open, async open => { if (open) { syncForm(); await meta.load().catch(()=>{}) } })
watch(client, syncForm)
async function save() {
  if (!client.value?.id) return
  saving.value = true
  try {
    const d = await api.updateClient(client.value.id, { ...form })
    chat.crm = d.client
    ui.toast('Карточка BlueSales сохранена', 'ok')
  } catch (e) { ui.toast(e.message, 'error', 6000) } finally { saving.value = false }
}
async function create() {
  saving.value = true
  try {
    const d = await api.createClientFromVk(chat.peerId, { fullName: form.fullName, city: form.city, crmStatus: form.crmStatus, phone: form.phone, email: form.email })
    chat.crm = d.client || d.customer || d
    syncForm()
    ui.toast('Клиент создан в BlueSales', 'ok')
  } catch (e) { ui.toast(e.message, 'error', 6000) } finally { saving.value = false }
}
async function openTab(next) {
  tab.value = next
  if (next==='orders' && client.value?.id && !orders.value.length) {
    ordersLoading.value = true
    try { orders.value = (await api.orders(client.value.id)).orders || [] } catch(e){ ui.toast(e.message,'error') } finally { ordersLoading.value=false }
  }
  if (next==='services' && !services.value.length) {
    servicesLoading.value = true
    try { services.value = (await api.services()).services || [] } catch(e){ ui.toast(e.message,'error') } finally { servicesLoading.value=false }
  }
}
function userValue(u){return u.login || u.name || ''}
function userLabel(u){return u.name || u.login || ''}
function statusValue(s){return s.name || s}
</script>
<template>
  <Teleport to="body">
    <div v-if="open" class="drawer-backdrop" @pointerdown.self="$emit('close')">
      <aside class="side-drawer right-drawer">
        <header><div><small>BLUESALES</small><h3>{{ chat.peer?.name || 'Карточка клиента' }}</h3></div><button type="button" @click="$emit('close')">×</button></header>
        <div class="drawer-tabs"><button :class="{active:tab==='client'}" @click="openTab('client')">Клиент</button><button :disabled="!client?.id" :class="{active:tab==='orders'}" @click="openTab('orders')">Заказы</button><button :class="{active:tab==='services'}" @click="openTab('services')">Услуги</button></div>
        <div class="drawer-content">
          <form v-if="tab==='client'" class="client-form" @submit.prevent="client?.id ? save() : create()">
            <div v-if="!client?.id" class="notice-card">Карточка BlueSales ещё не привязана. Данные VK уже подставлены — можно создать клиента.</div>
            <label>ФИО<input v-model="form.fullName"></label>
            <div class="form-grid"><label>Телефон<input v-model="form.phone" inputmode="tel"></label><label>Email<input v-model="form.email" inputmode="email"></label></div>
            <label>Город<input v-model="form.city"></label>
            <label>CRM-статус<select v-model="form.crmStatus"><option value="">Без статуса</option><option v-for="s in meta.statuses" :key="statusValue(s)" :value="statusValue(s)">{{ statusValue(s) }}</option></select></label>
            <label>Менеджер<select v-model="form.managerLogin"><option value="">Не менять</option><option v-for="u in meta.users" :key="userValue(u)" :value="userValue(u)">{{ userLabel(u) }}</option></select></label>
            <label>Следующий контакт<input v-model="form.nextContactDate" type="date"></label>
            <label>Краткая заметка<textarea v-model="form.shortNotes" rows="2"></textarea></label>
            <label>Комментарий<textarea v-model="form.comments" rows="4"></textarea></label>
            <button class="primary-btn" :disabled="saving">{{ saving ? 'Сохраняю…' : client?.id ? 'Сохранить в BlueSales' : 'Создать клиента' }}</button>
          </form>
          <div v-else-if="tab==='orders'" class="drawer-list">
            <div v-if="ordersLoading" class="drawer-loading">Загружаю заказы отдельно от чата…</div>
            <article v-for="o in orders" :key="o.id" class="data-card"><b>Заказ {{ o.internalNumber || o.id }}</b><span>{{ o.orderStatus || o.status || 'Без статуса' }}</span><strong v-if="o.sum">{{ Number(o.sum).toLocaleString('ru-RU') }} ₽</strong></article>
            <div v-if="!ordersLoading&&!orders.length" class="empty-mini">Заказов нет</div>
          </div>
          <div v-else class="drawer-list">
            <div v-if="servicesLoading" class="drawer-loading">Загружаю каталог услуг…</div>
            <article v-for="s in services" :key="s.id||s.marking||s.name" class="data-card"><b>{{ s.name }}</b><span>{{ s.marking }}</span><strong v-if="s.price">{{ Number(s.price).toLocaleString('ru-RU') }} ₽</strong></article>
          </div>
        </div>
      </aside>
    </div>
  </Teleport>
</template>
