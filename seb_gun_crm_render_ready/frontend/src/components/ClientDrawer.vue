<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { api } from '../services/api'
import { useChatStore } from '../stores/chat'
import { useMetaStore } from '../stores/meta'
import { useUiStore } from '../stores/ui'
import { useSessionStore } from '../stores/session'
import { managerStyle, statusStyle, tagStyle } from '../utils/colors'
import SingleSelectSheet from './SingleSelectSheet.vue'

const props=defineProps({open:Boolean})
const emit=defineEmits(['close'])
const chat=useChatStore(),meta=useMetaStore(),ui=useUiStore(),session=useSessionStore()
const tab=ref('client'),editing=ref(false),saving=ref(false),picker=ref('')
const orders=ref([]),ordersLoading=ref(false),ordersLoaded=ref(false)
const history=ref({events:[],journal:[]}),historyLoading=ref(false),historyLoaded=ref(false)
const services=ref([]),servicesLoading=ref(false),serviceQuery=ref(''),newOrder=ref(null)
const form=reactive({fullName:'',phone:'',email:'',city:'',crmStatus:'',managerLogin:'',nextContactDate:'',shortNotes:'',comments:''})
const client=computed(()=>chat.crm)
const statusOptions=computed(()=>meta.statuses.map(s=>({value:s.name||s,label:s.name||s})))
const managerOptions=computed(()=>meta.users.map(u=>({value:u.login||u.name,label:u.name||u.login})))
const managerLabel=computed(()=>managerOptions.value.find(x=>String(x.value)===String(form.managerLogin))?.label||form.managerLogin||'Не менять')
const filteredServices=computed(()=>{const q=serviceQuery.value.trim().toLocaleLowerCase('ru-RU').replace(/ё/g,'е');return q?services.value.filter(s=>`${s.name} ${s.marking}`.toLocaleLowerCase('ru-RU').replace(/ё/g,'е').includes(q)):services.value})
const orderSubtotal=computed(()=>(newOrder.value?.positions||[]).reduce((n,p)=>n+Number(p.price||0)*Number(p.quantity||1),0))
const orderTotal=computed(()=>Math.max(0,orderSubtotal.value*(1-Math.min(100,Math.max(0,Number(newOrder.value?.discount||0)))/100)))

function dateTimeInput(value){if(!value)return'';const raw=String(value).replace(' ','T');return raw.length>=16?raw.slice(0,16):raw.slice(0,10)}
function syncForm(){const c=client.value||{};Object.assign(form,{fullName:c.fullName||chat.peer?.name||'',phone:c.phone||'',email:c.email||'',city:c.city||'',crmStatus:c.crmStatus||(!c.id?'Запустил воронку':''),managerLogin:c.managerLogin||(!c.id?(session.account?.login||session.loginName):''),nextContactDate:dateTimeInput(c.nextContactDate),shortNotes:c.shortNotes||'',comments:c.comments||''})}
function fmt(value){if(!value)return'—';const d=new Date(String(value).replace(' ','T'));return Number.isNaN(d.getTime())?String(value):d.toLocaleDateString('ru-RU')}
function money(v){return Number(v||0).toLocaleString('ru-RU',{maximumFractionDigits:2})}
function setQuickDate(days){const d=new Date();d.setDate(d.getDate()+days);form.nextContactDate=d.toISOString().slice(0,10);editing.value=true}
watch(()=>props.open,async open=>{if(open){syncForm();await meta.load().catch(()=>{});if(!client.value?.id){form.crmStatus='Запустил воронку';form.managerLogin=session.account?.login||session.loginName||form.managerLogin}}},{immediate:true})
watch(client,()=>{syncForm();orders.value=[];ordersLoaded.value=false;history.value={events:[],journal:[]};historyLoaded.value=false;newOrder.value=null})

async function save(){if(!client.value?.id)return;saving.value=true;try{const d=await api.updateClient(client.value.id,{...form});chat.crm=d.client;editing.value=false;ui.toast('Карточка BlueSales сохранена','ok')}catch(e){ui.toast(e.message,'error',6000)}finally{saving.value=false}}
async function create(){saving.value=true;try{const d=await api.createClientFromVk(chat.peerId,{...form});chat.crm=d.client||d.customer||d;syncForm();ui.toast(d.recoveredFromUpstreamError?'Клиент создан — ответ BlueSales восстановлен':'Клиент создан в BlueSales','ok')}catch(e){ui.toast(e.message,'error',9000)}finally{saving.value=false}}
async function ensureServices(){if(services.value.length)return;servicesLoading.value=true;try{services.value=(await api.services()).services||[]}catch(e){ui.toast(e.message,'error')}finally{servicesLoading.value=false}}
async function loadOrders(fresh=false){if(!client.value?.id)return;ordersLoading.value=true;try{orders.value=(await api.orders(client.value.id,fresh)).orders||[];ordersLoaded.value=true}catch(e){ui.toast(e.message,'error')}finally{ordersLoading.value=false}}
async function loadHistory(){if(!client.value?.id)return;historyLoading.value=true;try{history.value=await api.clientHistory(client.value.id);historyLoaded.value=true}catch(e){ui.toast(e.message,'error')}finally{historyLoading.value=false}}
async function openTab(next){tab.value=next;if(next==='orders'&&!ordersLoaded.value)await loadOrders();if(next==='services')await ensureServices();if(next==='history'&&!historyLoaded.value)await loadHistory()}
function historyDate(value,seconds=false){const n=Number(value||0),d=seconds?new Date(n*1000):new Date(n);return Number.isNaN(d.getTime())?'—':d.toLocaleString('ru-RU',{timeZone:'Europe/Moscow'})}
async function beginOrder(service=null){await ensureServices();tab.value='orders';if(!newOrder.value)newOrder.value={orderStatus:'Новый',date:new Date().toISOString().slice(0,10),managerLogin:form.managerLogin||'',discount:0,prepay:0,internalComments:'',positions:[]};if(service)addService(service)}
function addService(s){if(!newOrder.value)return beginOrder(s);const key=String(s.id||s.marking||s.name);const existing=newOrder.value.positions.find(p=>String(p.id||p.marking||p.name)===key);if(existing)existing.quantity++;else newOrder.value.positions.push({id:s.id,marking:s.marking||'',name:s.name||'Услуга',price:Number(s.price||0),quantity:1});ui.toast('Услуга добавлена в заказ','ok',1200)}
function removeService(i){newOrder.value?.positions.splice(i,1)}
async function saveOrder(){if(!newOrder.value?.positions.length)return ui.toast('Добавьте услугу в заказ','error');saving.value=true;try{const d=newOrder.value;const result=await api.createOrder({customerId:client.value.id,orderStatus:d.orderStatus||'Новый',date:d.date,managerLogin:d.managerLogin,discount:Number(d.discount||0),prepay:Number(d.prepay||0),internalComments:d.internalComments,goodsPositions:d.positions.map(p=>({goods:p.id?{id:Number(p.id)}:{marking:p.marking,name:p.name},price:Number(p.price||0),quantity:Math.max(1,Number(p.quantity||1))}))});if(result.order)orders.value=[result.order,...orders.value.filter(o=>String(o.id)!==String(result.order.id))];newOrder.value=null;ordersLoaded.value=true;ui.toast('Заказ сохранён в BlueSales','ok');loadOrders(true).catch(()=>{})}catch(e){ui.toast(e.message,'error',6000)}finally{saving.value=false}}
</script>
<template>
  <Teleport to="body"><div v-if="open" class="drawer-backdrop client-drawer-backdrop" @pointerdown.self="$emit('close')"><aside class="side-drawer right-drawer">
    <header><div><small>BLUESALES</small><h3>CRM</h3><em>{{chat.peer?.name||'Карточка клиента'}}</em></div><button type="button" class="drawer-close" @click="$emit('close')">×</button></header>
    <div class="drawer-tabs"><button :class="{active:tab==='client'}" @click="openTab('client')">Клиент</button><button :disabled="!client?.id" :class="{active:tab==='history'}" @click="openTab('history')">История</button><button :disabled="!client?.id" :class="{active:tab==='orders'}" @click="openTab('orders')">Заказы</button><button :class="{active:tab==='services'}" @click="openTab('services')">Услуги</button></div>
    <div class="drawer-content">
      <div v-if="tab==='client'&&client?.id&&!editing" class="crm-classic-stack">
        <section class="crm-section-card"><div class="crm-section-title"><b>КЛИЕНТ</b><button @click="editing=true">редактировать</button></div>
          <div class="crm-field"><span>ФИО</span><strong>{{client.fullName||'—'}}</strong></div><div class="crm-field"><span>Город</span><strong>{{client.city||'—'}}</strong></div>
          <div class="crm-field"><span>CRM-статус</span><strong><i v-if="client.crmStatus" class="color-chip" :style="statusStyle(meta,client.crmStatus,client.crmStatusColor)">{{client.crmStatus}}</i><template v-else>—</template></strong></div>
          <div class="crm-field"><span>Дата послед.</span><strong>{{fmt(client.lastContactDate)}}</strong></div><div class="crm-field"><span>След. конт.</span><strong>{{fmt(client.nextContactDate)}}</strong></div>
          <div class="crm-field"><span>Моб. тел.</span><strong><a v-if="client.phone" :href="`tel:${client.phone}`">{{client.phone}}</a><template v-else>—</template></strong></div><div class="crm-field"><span>E-mail</span><strong><a v-if="client.email" :href="`mailto:${client.email}`">{{client.email}}</a><template v-else>—</template></strong></div>
          <div class="crm-field"><span>VK ID</span><strong><a v-if="client.social?.vkId||client.vkId" :href="`https://vk.com/id${client.social?.vkId||client.vkId}`" target="_blank">{{client.social?.vkId||client.vkId}}</a><template v-else>—</template></strong></div>
          <div class="crm-field"><span>Менеджер</span><strong><i v-if="client.manager" class="color-chip" :style="managerStyle(meta,client.manager,client.managerColor)">{{client.manager}}</i><template v-else>—</template></strong></div>
          <div class="crm-field crm-tags-field"><span>Тэги</span><strong class="tags"><i v-for="t in client.tags||[]" :key="t.name||t" class="color-chip" :style="tagStyle(meta,t)">{{t.name||t}}</i><template v-if="!client.tags?.length">—</template></strong></div>
          <div class="crm-link-row"><a :href="`https://bluesales.ru/app/Customers/Customer.aspx?id=${client.id}`" target="_blank">🔗 Ссылка клиента</a><a :href="`/api/clients/${client.id}`" target="_blank">JSON</a></div><div class="crm-note"><span>Примечания</span><p>{{client.shortNotes||client.comments||'—'}}</p></div>
        </section>
        <section class="crm-section-card next-contact-card"><div class="crm-section-title"><b>Следующий контакт</b></div><strong>{{fmt(client.nextContactDate)}}</strong><div class="quick-dates"><button @click="setQuickDate(0)">Сегодня</button><button @click="setQuickDate(1)">Завтра</button><button @click="setQuickDate(7)">+7 дней</button></div></section>
        <section class="crm-section-card compact-preview"><div class="crm-section-title"><b>ЗАКАЗ</b><button @click="beginOrder()">Новый</button></div><div class="empty-mini">{{ordersLoaded&&orders.length?`Заказов: ${orders.length}`:'Откройте вкладку «Заказы»'}}</div></section>
        <section class="crm-section-card compact-preview"><div class="crm-section-title"><b>УСЛУГА</b></div><div class="empty-mini">Нажмите «Новый» и выберите услугу.</div></section>
      </div>
      <form v-else-if="tab==='client'" class="client-form" @submit.prevent="client?.id?save():create()">
        <div v-if="!client?.id" class="notice-card vk-create-preview"><img v-if="chat.peer?.avatar" :src="chat.peer.avatar" alt=""><span><b>Данные получены из VK</b><small>VK ID {{chat.peerId}} · менеджер и статус назначатся автоматически</small></span></div><label>ФИО<input v-model="form.fullName"></label><div class="form-grid"><label>Телефон<input v-model="form.phone" inputmode="tel"></label><label>Email<input v-model="form.email" inputmode="email"></label></div><label>Город<input v-model="form.city"></label>
        <label>CRM-статус<button type="button" class="select-sheet-trigger" @click="picker='status'"><span>{{form.crmStatus||'Без статуса'}}</span><b>▾</b></button></label><label>Менеджер<button type="button" class="select-sheet-trigger" @click="picker='manager'"><span>{{managerLabel}}</span><b>▾</b></button></label>
        <label>Следующий контакт<input v-model="form.nextContactDate" type="datetime-local"></label><label>Краткая заметка<textarea v-model="form.shortNotes" rows="2"></textarea></label><label>Комментарий<textarea v-model="form.comments" rows="4"></textarea></label><div class="form-action-row"><button v-if="client?.id" type="button" class="secondary-btn" @click="editing=false;syncForm()">Отмена</button><button class="primary-btn" :disabled="saving">{{saving?'Сохраняю…':client?.id?'Сохранить':'Создать клиента'}}</button></div>
      </form>
      <div v-else-if="tab==='orders'" class="drawer-list order-workspace">
        <div class="crm-section-title standalone"><b>ЗАКАЗЫ</b><button v-if="!newOrder" @click="beginOrder()">Новый</button></div><div v-if="ordersLoading" class="drawer-loading">Загружаю заказы…</div>
        <form v-if="newOrder" class="new-order-card" @submit.prevent="saveOrder"><div class="form-grid"><label>Статус<input v-model="newOrder.orderStatus"></label><label>Дата<input v-model="newOrder.date" type="date"></label></div><div class="service-search"><input v-model="serviceQuery" placeholder="Найти услугу…"></div><div class="service-picker-list"><button v-for="s in filteredServices.slice(0,40)" :key="s.id||s.marking||s.name" type="button" @click="addService(s)"><span><b>{{s.name}}</b><small>{{s.marking}}</small></span><strong>{{money(s.price)}} ₽ ＋</strong></button></div>
          <div v-for="(p,i) in newOrder.positions" :key="`${p.id||p.marking}-${i}`" class="order-position"><b>{{p.name}}</b><input v-model.number="p.quantity" type="number" min="1" aria-label="Количество"><input v-model.number="p.price" type="number" min="0" aria-label="Цена"><button type="button" @click="removeService(i)">×</button></div>
          <div class="form-grid"><label>Скидка, %<input v-model.number="newOrder.discount" type="number" min="0" max="100"></label><label>Предоплата<input v-model.number="newOrder.prepay" type="number" min="0"></label></div><label>Комментарий<textarea v-model="newOrder.internalComments" rows="2"></textarea></label><div class="order-total"><span>Итого</span><b>{{money(orderTotal)}} ₽</b></div><div class="form-action-row"><button type="button" class="secondary-btn" @click="newOrder=null">Отмена</button><button class="primary-btn" :disabled="saving||!newOrder.positions.length">{{saving?'Сохраняю…':'Сохранить заказ'}}</button></div>
        </form>
        <template v-else><article v-for="o in orders" :key="o.id" class="data-card order-card"><div><b>Заказ {{o.internalNumber||o.id}}</b><span>{{o.orderStatus||o.status||'Без статуса'}}</span></div><strong v-if="o.sum">{{money(o.sum)}} ₽</strong></article><div v-if="!ordersLoading&&!orders.length" class="empty-mini">Нет заказа</div></template>
      </div>
      <div v-else-if="tab==='services'" class="drawer-list"><div class="service-search"><input v-model="serviceQuery" placeholder="Найти услугу по названию…"></div><div v-if="servicesLoading" class="drawer-loading">Загружаю каталог услуг…</div><article v-for="s in filteredServices" :key="s.id||s.marking||s.name" class="data-card service-card"><div><b>{{s.name}}</b><span>{{s.marking}}</span></div><strong v-if="s.price">{{money(s.price)}} ₽</strong><button type="button" @click="beginOrder(s)">Добавить в заказ</button></article></div>
      <div v-else class="drawer-list client-history"><div v-if="historyLoading" class="drawer-loading">Загружаю историю…</div><template v-else><h4>Действия с карточкой</h4><article v-for="event in history.events" :key="event.id" class="data-card"><b>{{event.text||event.type}}</b><span v-if="event.from||event.to">{{event.from||'—'}} → {{event.to||'—'}}</span><small>{{event.actor||'Система'}} · {{historyDate(event.at)}}</small></article><h4>Переписка и SLA</h4><article v-for="row in history.journal" :key="row.id" class="data-card"><b>{{row.snippet}}</b><span v-if="row.responseText">Ответ: {{row.responseText}}</span><small>{{historyDate(row.receivedAt,true)}} · {{row.status==='answered'?'Ответ получен':'Без ответа'}}</small></article><div v-if="!history.events.length&&!history.journal.length" class="empty-mini">История пока пуста</div></template></div>
    </div>
  </aside></div></Teleport>
  <SingleSelectSheet :open="picker==='status'" title="CRM-статус" :options="statusOptions" :model-value="form.crmStatus" empty-label="Без статуса" @update:model-value="form.crmStatus=$event" @close="picker=''"/>
  <SingleSelectSheet :open="picker==='manager'" title="Менеджер" :options="managerOptions" :model-value="form.managerLogin" empty-label="Не менять" @update:model-value="form.managerLogin=$event" @close="picker=''"/>
</template>
