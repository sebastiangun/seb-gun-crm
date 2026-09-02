<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { api } from '../services/api'
import { useChatStore } from '../stores/chat'
import { useMetaStore } from '../stores/meta'
import { useUiStore } from '../stores/ui'
import { managerStyle, statusStyle, tagStyle } from '../utils/colors'

const props=defineProps({open:Boolean})
const emit=defineEmits(['close'])
const chat=useChatStore(),meta=useMetaStore(),ui=useUiStore()
const tab=ref('client'),editing=ref(false),saving=ref(false)
const orders=ref([]),ordersLoading=ref(false),ordersLoaded=ref(false)
const services=ref([]),servicesLoading=ref(false)
const form=reactive({fullName:'',phone:'',email:'',city:'',crmStatus:'',managerLogin:'',nextContactDate:'',shortNotes:'',comments:''})
const client=computed(()=>chat.crm)

function syncForm(){const c=client.value||{};Object.assign(form,{fullName:c.fullName||chat.peer?.name||'',phone:c.phone||'',email:c.email||'',city:c.city||'',crmStatus:c.crmStatus||'',managerLogin:c.managerLogin||'',nextContactDate:String(c.nextContactDate||'').slice(0,10),shortNotes:c.shortNotes||'',comments:c.comments||''})}
function fmt(value){if(!value)return'—';const d=new Date(String(value).replace(' ','T'));return Number.isNaN(d.getTime())?String(value):d.toLocaleDateString('ru-RU')}
function setQuickDate(days){const d=new Date();d.setDate(d.getDate()+days);form.nextContactDate=d.toISOString().slice(0,10);editing.value=true}
watch(()=>props.open,async open=>{if(open){syncForm();await meta.load().catch(()=>{})}},{immediate:true})
watch(client,()=>{syncForm();orders.value=[];ordersLoaded.value=false})

async function save(){if(!client.value?.id)return;saving.value=true;try{const d=await api.updateClient(client.value.id,{...form});chat.crm=d.client;editing.value=false;ui.toast('Карточка BlueSales сохранена','ok')}catch(e){ui.toast(e.message,'error',6000)}finally{saving.value=false}}
async function create(){saving.value=true;try{const d=await api.createClientFromVk(chat.peerId,{fullName:form.fullName,city:form.city,crmStatus:form.crmStatus,phone:form.phone,email:form.email});chat.crm=d.client||d.customer||d;syncForm();ui.toast('Клиент создан в BlueSales','ok')}catch(e){ui.toast(e.message,'error',6000)}finally{saving.value=false}}
async function openTab(next){tab.value=next;if(next==='orders'&&client.value?.id&&!ordersLoaded.value){ordersLoading.value=true;try{orders.value=(await api.orders(client.value.id)).orders||[];ordersLoaded.value=true}catch(e){ui.toast(e.message,'error')}finally{ordersLoading.value=false}}if(next==='services'&&!services.value.length){servicesLoading.value=true;try{services.value=(await api.services()).services||[]}catch(e){ui.toast(e.message,'error')}finally{servicesLoading.value=false}}}
function userValue(u){return u.login||u.name||''}function userLabel(u){return u.name||u.login||''}function statusValue(s){return s.name||s}
</script>
<template>
  <Teleport to="body">
    <div v-if="open" class="drawer-backdrop client-drawer-backdrop" @pointerdown.self="$emit('close')">
      <aside class="side-drawer right-drawer">
        <header><div><small>BLUESALES</small><h3>CRM</h3><em>{{chat.peer?.name||'Карточка клиента'}}</em></div><button type="button" class="drawer-close" @click="$emit('close')">×</button></header>
        <div class="drawer-tabs"><button :class="{active:tab==='client'}" @click="openTab('client')">Клиент</button><button :disabled="!client?.id" :class="{active:tab==='orders'}" @click="openTab('orders')">Заказы</button><button :class="{active:tab==='services'}" @click="openTab('services')">Услуги</button></div>
        <div class="drawer-content">
          <div v-if="tab==='client'&&client?.id&&!editing" class="crm-classic-stack">
            <section class="crm-section-card">
              <div class="crm-section-title"><b>КЛИЕНТ</b><button type="button" @click="editing=true">редактировать</button></div>
              <div class="crm-field"><span>ФИО</span><strong>{{client.fullName||'—'}}</strong></div>
              <div class="crm-field"><span>Город</span><strong>{{client.city||'—'}}</strong></div>
              <div class="crm-field"><span>CRM-статус</span><strong><i v-if="client.crmStatus" class="color-chip" :style="statusStyle(meta,client.crmStatus,client.crmStatusColor)">{{client.crmStatus}}</i><template v-else>—</template></strong></div>
              <div class="crm-field"><span>Дата послед.</span><strong>{{fmt(client.lastContactDate)}}</strong></div>
              <div class="crm-field"><span>След. конт.</span><strong>{{fmt(client.nextContactDate)}}</strong></div>
              <div class="crm-field"><span>Моб. тел.</span><strong><a v-if="client.phone" :href="`tel:${client.phone}`">{{client.phone}}</a><template v-else>—</template></strong></div>
              <div class="crm-field"><span>E-mail</span><strong><a v-if="client.email" :href="`mailto:${client.email}`">{{client.email}}</a><template v-else>—</template></strong></div>
              <div class="crm-field"><span>VK ID</span><strong><a v-if="client.social?.vkId||client.vkId" :href="`https://vk.com/id${client.social?.vkId||client.vkId}`" target="_blank" rel="noreferrer">{{client.social?.vkId||client.vkId}}</a><template v-else>—</template></strong></div>
              <div class="crm-field"><span>Менеджер</span><strong><i v-if="client.manager" class="color-chip" :style="managerStyle(meta,client.manager,client.managerColor)">{{client.manager}}</i><template v-else>—</template></strong></div>
              <div class="crm-field crm-tags-field"><span>Тэги</span><strong class="tags"><i v-for="t in client.tags||[]" :key="t.name||t" class="color-chip" :style="tagStyle(meta,t)">{{t.name||t}}</i><template v-if="!client.tags?.length">—</template></strong></div>
              <div class="crm-note"><span>Примечания</span><p>{{client.shortNotes||client.comments||'—'}}</p></div>
            </section>
            <section class="crm-section-card next-contact-card"><div class="crm-section-title"><b>Следующий контакт</b></div><strong>{{fmt(client.nextContactDate)}}</strong><div class="quick-dates"><button type="button" @click="setQuickDate(0)">Сегодня</button><button type="button" @click="setQuickDate(1)">Завтра</button><button type="button" @click="setQuickDate(7)">+7 дней</button></div></section>
          </div>
          <form v-else-if="tab==='client'" class="client-form" @submit.prevent="client?.id?save():create()">
            <div v-if="!client?.id" class="notice-card">Карточка BlueSales ещё не привязана. Данные VK уже подставлены — можно создать клиента.</div>
            <label>ФИО<input v-model="form.fullName"></label>
            <div class="form-grid"><label>Телефон<input v-model="form.phone" inputmode="tel"></label><label>Email<input v-model="form.email" inputmode="email"></label></div>
            <label>Город<input v-model="form.city"></label>
            <label>CRM-статус<select v-model="form.crmStatus"><option value="">Без статуса</option><option v-for="s in meta.statuses" :key="statusValue(s)" :value="statusValue(s)">{{statusValue(s)}}</option></select></label>
            <label>Менеджер<select v-model="form.managerLogin"><option value="">Не менять</option><option v-for="u in meta.users" :key="userValue(u)" :value="userValue(u)">{{userLabel(u)}}</option></select></label>
            <label>Следующий контакт<input v-model="form.nextContactDate" type="date"></label>
            <label>Краткая заметка<textarea v-model="form.shortNotes" rows="2"></textarea></label><label>Комментарий<textarea v-model="form.comments" rows="4"></textarea></label>
            <div class="form-action-row"><button v-if="client?.id" type="button" class="secondary-btn" @click="editing=false;syncForm()">Отмена</button><button class="primary-btn" :disabled="saving">{{saving?'Сохраняю…':client?.id?'Сохранить в BlueSales':'Создать клиента'}}</button></div>
          </form>
          <div v-else-if="tab==='orders'" class="drawer-list"><div v-if="ordersLoading" class="drawer-loading">Загружаю заказы отдельно от чата…</div><article v-for="o in orders" :key="o.id" class="data-card"><b>Заказ {{o.internalNumber||o.id}}</b><span>{{o.orderStatus||o.status||'Без статуса'}}</span><strong v-if="o.sum">{{Number(o.sum).toLocaleString('ru-RU')}} ₽</strong></article><div v-if="!ordersLoading&&!orders.length" class="empty-mini">Заказов нет</div></div>
          <div v-else class="drawer-list"><div v-if="servicesLoading" class="drawer-loading">Загружаю каталог услуг…</div><article v-for="s in services" :key="s.id||s.marking||s.name" class="data-card"><b>{{s.name}}</b><span>{{s.marking}}</span><strong v-if="s.price">{{Number(s.price).toLocaleString('ru-RU')}} ₽</strong></article></div>
        </div>
      </aside>
    </div>
  </Teleport>
</template>
