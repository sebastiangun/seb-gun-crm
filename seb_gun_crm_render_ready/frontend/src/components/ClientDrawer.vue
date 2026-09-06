<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { api } from '../services/api'
import { useChatStore } from '../stores/chat'
import { useMetaStore } from '../stores/meta'
import { useUiStore } from '../stores/ui'
import { managerStyle, statusStyle, tagStyle } from '../utils/colors'
import SingleSelectSheet from './SingleSelectSheet.vue'

const props=defineProps({open:Boolean})
const emit=defineEmits(['close'])
const chat=useChatStore(),meta=useMetaStore(),ui=useUiStore()
const tab=ref('client'),editing=ref(false),saving=ref(false),picker=ref('')
const sections=reactive({main:true,contacts:false,next:true,notes:false})
const orders=ref([]),ordersLoading=ref(false),ordersLoaded=ref(false)
const services=ref([]),servicesLoading=ref(false),serviceQuery=ref(''),newOrder=ref(null)
const form=reactive({fullName:'',phone:'',email:'',city:'',crmStatus:'',managerLogin:'',nextContactDate:'',shortNotes:'',comments:''})
const client=computed(()=>chat.crm)
const statusOptions=computed(()=>meta.statuses.map(s=>({value:s.name||s,label:s.name||s})))
const managerOptions=computed(()=>meta.users.map(u=>({value:u.login||u.name,label:u.name||u.login})))
const managerLabel=computed(()=>managerOptions.value.find(x=>String(x.value)===String(form.managerLogin))?.label||form.managerLogin||'Не менять')
const filteredServices=computed(()=>{const q=serviceQuery.value.trim().toLocaleLowerCase('ru-RU').replace(/ё/g,'е');return q?services.value.filter(s=>`${s.name} ${s.marking}`.toLocaleLowerCase('ru-RU').replace(/ё/g,'е').includes(q)):services.value})
const orderSubtotal=computed(()=>(newOrder.value?.positions||[]).reduce((n,p)=>n+Number(p.price||0)*Number(p.quantity||1),0))
const orderTotal=computed(()=>Math.max(0,orderSubtotal.value*(1-Math.min(100,Math.max(0,Number(newOrder.value?.discount||0)))/100)))
const orderStatusOptions=['Новый','В работе','Оплачен','Выполнен','Отменён']
const nextDateOptions=[
  {value:'today',label:'Сегодня'},
  {value:'tomorrow',label:'Завтра'},
  {value:'3',label:'+3 дня'},
  {value:'7',label:'+7 дней'},
  {value:'14',label:'+14 дней'},
  {value:'clear',label:'Очистить дату'},
]

function pad2(v){return String(v).padStart(2,'0')}
function localIsoDate(d){return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`}
function dateInputValue(value=''){
  const s=String(value||'').trim()
  let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if(m)return `${m[1]}-${m[2]}-${m[3]}`
  m=s.match(/^(\d{2})\.(\d{2})\.(\d{4})/)
  if(m)return `${m[3]}-${m[2]}-${m[1]}`
  const d=new Date(s.replace(' ','T'))
  return Number.isNaN(d.getTime())?'':localIsoDate(d)
}
function displayDate(value=''){
  const normalized=dateInputValue(value)
  if(!normalized)return value?String(value):'—'
  const [y,m,d]=normalized.split('-')
  return `${d}.${m}.${y}`
}
function syncForm(){const c=client.value||{};Object.assign(form,{fullName:c.fullName||chat.peer?.name||'',phone:c.phone||'',email:c.email||'',city:c.city||'',crmStatus:c.crmStatus||'',managerLogin:c.managerLogin||'',nextContactDate:dateInputValue(c.nextContactDate),shortNotes:c.shortNotes||'',comments:c.comments||''})}
function fmt(value){return displayDate(value)}
function money(v){return Number(v||0).toLocaleString('ru-RU',{maximumFractionDigits:2})}
function setQuickDate(days){const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+Number(days||0));form.nextContactDate=localIsoDate(d);editing.value=true}
function applyDatePreset(value){if(value==='clear'){form.nextContactDate='';editing.value=true;return}if(value==='today')return setQuickDate(0);if(value==='tomorrow')return setQuickDate(1);if(/^\d+$/.test(String(value)))return setQuickDate(Number(value))}
function toggleSection(name){sections[name]=!sections[name]}
function editClient(){syncForm();editing.value=true;tab.value='client'}
function cancelEdit(){editing.value=false;syncForm()}
watch(()=>props.open,async open=>{if(open){syncForm();await meta.load().catch(()=>{})}},{immediate:true})
watch(client,()=>{syncForm();orders.value=[];ordersLoaded.value=false;newOrder.value=null})

async function save(){if(!client.value?.id)return;saving.value=true;try{const d=await api.updateClient(client.value.id,{...form});chat.crm=d.client;editing.value=false;ui.toast('Карточка BlueSales сохранена','ok')}catch(e){ui.toast(e.message,'error',6000)}finally{saving.value=false}}
async function create(){saving.value=true;try{const d=await api.createClientFromVk(chat.peerId,{...form});chat.crm=d.client||d.customer||d;syncForm();ui.toast(d.recoveredFromUpstreamError?'Клиент создан — ответ BlueSales восстановлен':'Клиент создан в BlueSales','ok')}catch(e){ui.toast(e.message,'error',9000)}finally{saving.value=false}}
async function ensureServices(){if(services.value.length)return;servicesLoading.value=true;try{services.value=(await api.services()).services||[]}catch(e){ui.toast(e.message,'error')}finally{servicesLoading.value=false}}
async function loadOrders(fresh=false){if(!client.value?.id)return;ordersLoading.value=true;try{orders.value=(await api.orders(client.value.id,fresh)).orders||[];ordersLoaded.value=true}catch(e){ui.toast(e.message,'error')}finally{ordersLoading.value=false}}
async function openTab(next){tab.value=next;if(next==='orders'&&!ordersLoaded.value)await loadOrders();if(next==='services')await ensureServices()}
async function beginOrder(service=null){await ensureServices();tab.value='orders';if(!newOrder.value)newOrder.value={orderStatus:'Новый',date:localIsoDate(new Date()),managerLogin:form.managerLogin||'',discount:0,prepay:0,internalComments:'',positions:[]};if(service)addService(service)}
function addService(s){if(!newOrder.value)return beginOrder(s);const key=String(s.id||s.marking||s.name);const existing=newOrder.value.positions.find(p=>String(p.id||p.marking||p.name)===key);if(existing)existing.quantity++;else newOrder.value.positions.push({id:s.id,marking:s.marking||'',name:s.name||'Услуга',price:Number(s.price||0),quantity:1});ui.toast('Услуга добавлена в заказ','ok',1200)}
function removeService(i){newOrder.value?.positions.splice(i,1)}
async function saveOrder(){if(!newOrder.value?.positions.length)return ui.toast('Добавьте услугу в заказ','error');saving.value=true;try{const d=newOrder.value;const result=await api.createOrder({customerId:client.value.id,orderStatus:d.orderStatus||'Новый',date:d.date,managerLogin:d.managerLogin,discount:Number(d.discount||0),prepay:Number(d.prepay||0),internalComments:d.internalComments,goodsPositions:d.positions.map(p=>({goods:p.id?{id:Number(p.id)}:{marking:p.marking,name:p.name},price:Number(p.price||0),quantity:Math.max(1,Number(p.quantity||1))}))});if(result.order)orders.value=[result.order,...orders.value.filter(o=>String(o.id)!==String(result.order.id))];newOrder.value=null;ordersLoaded.value=true;ui.toast('Заказ сохранён в BlueSales','ok');loadOrders(true).catch(()=>{})}catch(e){ui.toast(e.message,'error',6000)}finally{saving.value=false}}
</script>

<template>
  <Teleport to="body"><div v-if="open" class="drawer-backdrop client-drawer-backdrop" @pointerdown.self="$emit('close')"><aside class="side-drawer right-drawer client-card-v2826">
    <header class="client-panel-head"><div><small>BLUESALES · КАРТОЧКА</small><h3>{{chat.peer?.name||'CRM'}}</h3><em>{{client?.crmStatus||'Клиент и сделки'}}</em></div><button type="button" class="drawer-close" aria-label="Закрыть" @click="$emit('close')">×</button></header>
    <div class="drawer-tabs client-panel-tabs"><button :class="{active:tab==='client'}" @click="openTab('client')">Клиент</button><button :disabled="!client?.id" :class="{active:tab==='orders'}" @click="openTab('orders')">Заказы</button><button :class="{active:tab==='services'}" @click="openTab('services')">Услуги</button></div>
    <div class="drawer-content client-panel-content">
      <div v-if="tab==='client'&&client?.id&&!editing" class="crm-classic-stack client-overview-v2826">
        <section class="client-hero-card">
          <div class="client-avatar-letter">{{(client.fullName||chat.peer?.name||'?').trim().charAt(0).toUpperCase()}}</div>
          <div class="client-hero-main"><small>КЛИЕНТ</small><strong>{{client.fullName||chat.peer?.name||'Без имени'}}</strong><div class="client-hero-chips"><i v-if="client.crmStatus" class="color-chip" :style="statusStyle(meta,client.crmStatus,client.crmStatusColor)">{{client.crmStatus}}</i><i v-if="client.manager" class="color-chip" :style="managerStyle(meta,client.manager,client.managerColor)">{{client.manager}}</i></div></div>
          <button class="client-edit-button" type="button" @click="editClient">✎</button>
        </section>

        <section class="crm-section-card crm-accordion-card" :class="{open:sections.main}">
          <button class="crm-accordion-head" type="button" @click="toggleSection('main')"><span><b>Основное</b><small>Статус, менеджер, город</small></span><strong>{{sections.main?'⌃':'⌄'}}</strong></button>
          <div v-show="sections.main" class="crm-accordion-body">
            <div class="crm-field"><span>ФИО</span><strong>{{client.fullName||'—'}}</strong></div>
            <div class="crm-field"><span>Город</span><strong>{{client.city||'—'}}</strong></div>
            <div class="crm-field"><span>CRM-статус</span><strong><i v-if="client.crmStatus" class="color-chip" :style="statusStyle(meta,client.crmStatus,client.crmStatusColor)">{{client.crmStatus}}</i><template v-else>—</template></strong></div>
            <div class="crm-field"><span>Менеджер</span><strong><i v-if="client.manager" class="color-chip" :style="managerStyle(meta,client.manager,client.managerColor)">{{client.manager}}</i><template v-else>—</template></strong></div>
            <div class="crm-field"><span>Последний контакт</span><strong>{{fmt(client.lastContactDate)}}</strong></div>
          </div>
        </section>

        <section class="crm-section-card crm-accordion-card" :class="{open:sections.contacts}">
          <button class="crm-accordion-head" type="button" @click="toggleSection('contacts')"><span><b>Контакты и теги</b><small>Телефон, email, VK</small></span><strong>{{sections.contacts?'⌃':'⌄'}}</strong></button>
          <div v-show="sections.contacts" class="crm-accordion-body">
            <div class="crm-field"><span>Телефон</span><strong><a v-if="client.phone" :href="`tel:${client.phone}`">{{client.phone}}</a><template v-else>—</template></strong></div>
            <div class="crm-field"><span>E-mail</span><strong><a v-if="client.email" :href="`mailto:${client.email}`">{{client.email}}</a><template v-else>—</template></strong></div>
            <div class="crm-field"><span>VK ID</span><strong><a v-if="client.social?.vkId||client.vkId" :href="`https://vk.com/id${client.social?.vkId||client.vkId}`" target="_blank">{{client.social?.vkId||client.vkId}}</a><template v-else>—</template></strong></div>
            <div class="crm-field crm-tags-field"><span>Теги</span><strong class="tags"><i v-for="t in client.tags||[]" :key="t.name||t" class="color-chip" :style="tagStyle(meta,t)">{{t.name||t}}</i><template v-if="!client.tags?.length">—</template></strong></div>
            <div class="crm-link-row"><a :href="`https://bluesales.ru/app/Customers/Customer.aspx?id=${client.id}`" target="_blank">↗ BlueSales</a><a :href="`/api/clients/${client.id}`" target="_blank">JSON</a></div>
          </div>
        </section>

        <section class="crm-section-card crm-accordion-card next-contact-card" :class="{open:sections.next}">
          <button class="crm-accordion-head" type="button" @click="toggleSection('next')"><span><b>Следующий контакт</b><small>{{fmt(client.nextContactDate)}}</small></span><strong>{{sections.next?'⌃':'⌄'}}</strong></button>
          <div v-show="sections.next" class="crm-accordion-body next-contact-body"><strong class="next-contact-date">{{fmt(client.nextContactDate)}}</strong><div class="quick-dates"><button @click="setQuickDate(0)">Сегодня</button><button @click="setQuickDate(1)">Завтра</button><button @click="setQuickDate(7)">+7 дней</button></div><button class="date-more-button" type="button" @click="picker='date'">Другой срок ▾</button></div>
        </section>

        <section class="crm-section-card crm-accordion-card" :class="{open:sections.notes}">
          <button class="crm-accordion-head" type="button" @click="toggleSection('notes')"><span><b>Примечания</b><small>{{client.shortNotes||client.comments?'Есть заметка':'Нет заметок'}}</small></span><strong>{{sections.notes?'⌃':'⌄'}}</strong></button>
          <div v-show="sections.notes" class="crm-accordion-body"><div class="crm-note"><p>{{client.shortNotes||client.comments||'—'}}</p></div></div>
        </section>

        <div class="client-shortcuts-grid">
          <button type="button" @click="openTab('orders')"><span>▤</span><b>Заказы</b><small>{{ordersLoaded?`${orders.length} шт.`:'Открыть список'}}</small></button>
          <button type="button" @click="openTab('services')"><span>＋</span><b>Услуги</b><small>Добавить в заказ</small></button>
        </div>
      </div>

      <form v-else-if="tab==='client'" class="client-form client-form-v2826" @submit.prevent="client?.id?save():create()">
        <div v-if="!client?.id" class="notice-card">Карточка BlueSales ещё не привязана. Данные VK уже подставлены.</div>
        <details class="client-edit-group" open><summary><span>Основные данные</span><b>⌄</b></summary><div class="client-edit-body"><label>ФИО<input v-model="form.fullName" autocomplete="name"></label><label>Город<input v-model="form.city" autocomplete="address-level2"></label></div></details>
        <details class="client-edit-group" open><summary><span>CRM и ответственный</span><b>⌄</b></summary><div class="client-edit-body"><label>CRM-статус<button type="button" class="select-sheet-trigger" @click="picker='status'"><span>{{form.crmStatus||'Без статуса'}}</span><b>▾</b></button></label><label>Менеджер<button type="button" class="select-sheet-trigger" @click="picker='manager'"><span>{{managerLabel}}</span><b>▾</b></button></label><label>Следующий контакт<div class="date-picker-row"><input v-model="form.nextContactDate" type="date"><button type="button" class="date-dropdown-trigger" @click="picker='date'">▾</button></div></label></div></details>
        <details class="client-edit-group"><summary><span>Контакты</span><b>⌄</b></summary><div class="client-edit-body"><label>Телефон<input v-model="form.phone" inputmode="tel" autocomplete="tel"></label><label>Email<input v-model="form.email" inputmode="email" autocomplete="email"></label></div></details>
        <details class="client-edit-group"><summary><span>Заметки</span><b>⌄</b></summary><div class="client-edit-body"><label>Краткая заметка<textarea v-model="form.shortNotes" rows="2"></textarea></label><label>Комментарий<textarea v-model="form.comments" rows="4"></textarea></label></div></details>
        <div class="form-action-row client-form-actions"><button v-if="client?.id" type="button" class="secondary-btn" @click="cancelEdit">Отмена</button><button class="primary-btn" :disabled="saving">{{saving?'Сохраняю…':client?.id?'Сохранить изменения':'Создать клиента'}}</button></div>
      </form>

      <div v-else-if="tab==='orders'" class="drawer-list order-workspace">
        <div class="crm-section-title standalone"><b>ЗАКАЗЫ</b><button v-if="!newOrder" @click="beginOrder()">Новый</button></div><div v-if="ordersLoading" class="drawer-loading">Загружаю заказы…</div>
        <form v-if="newOrder" class="new-order-card" @submit.prevent="saveOrder"><div class="form-grid"><label>Статус<select v-model="newOrder.orderStatus"><option v-if="newOrder.orderStatus&&!orderStatusOptions.includes(newOrder.orderStatus)" :value="newOrder.orderStatus">{{newOrder.orderStatus}}</option><option v-for="s in orderStatusOptions" :key="s" :value="s">{{s}}</option></select></label><label>Дата<input v-model="newOrder.date" type="date"></label></div><div class="service-search"><input v-model="serviceQuery" placeholder="Найти услугу…"></div><div class="service-picker-list"><button v-for="s in filteredServices.slice(0,40)" :key="s.id||s.marking||s.name" type="button" @click="addService(s)"><span><b>{{s.name}}</b><small>{{s.marking}}</small></span><strong>{{money(s.price)}} ₽ ＋</strong></button></div>
          <div v-for="(p,i) in newOrder.positions" :key="`${p.id||p.marking}-${i}`" class="order-position"><b>{{p.name}}</b><input v-model.number="p.quantity" type="number" min="1" aria-label="Количество"><input v-model.number="p.price" type="number" min="0" aria-label="Цена"><button type="button" @click="removeService(i)">×</button></div>
          <div class="form-grid"><label>Скидка, %<input v-model.number="newOrder.discount" type="number" min="0" max="100"></label><label>Предоплата<input v-model.number="newOrder.prepay" type="number" min="0"></label></div><label>Комментарий<textarea v-model="newOrder.internalComments" rows="2"></textarea></label><div class="order-total"><span>Итого</span><b>{{money(orderTotal)}} ₽</b></div><div class="form-action-row"><button type="button" class="secondary-btn" @click="newOrder=null">Отмена</button><button class="primary-btn" :disabled="saving||!newOrder.positions.length">{{saving?'Сохраняю…':'Сохранить заказ'}}</button></div>
        </form>
        <template v-else><article v-for="o in orders" :key="o.id" class="data-card order-card"><div><b>Заказ {{o.internalNumber||o.id}}</b><span>{{o.orderStatus||o.status||'Без статуса'}}</span></div><strong v-if="o.sum">{{money(o.sum)}} ₽</strong></article><div v-if="!ordersLoading&&!orders.length" class="empty-mini">Нет заказов</div></template>
      </div>
      <div v-else class="drawer-list"><div class="service-search"><input v-model="serviceQuery" placeholder="Найти услугу по названию…"></div><div v-if="servicesLoading" class="drawer-loading">Загружаю каталог услуг…</div><article v-for="s in filteredServices" :key="s.id||s.marking||s.name" class="data-card service-card"><div><b>{{s.name}}</b><span>{{s.marking}}</span></div><strong v-if="s.price">{{money(s.price)}} ₽</strong><button type="button" @click="beginOrder(s)">Добавить в заказ</button></article></div>
    </div>
    <div v-if="tab==='client'" class="client-mobile-actions"><button type="button" @click="editClient">✎ Изменить</button><button type="button" @click="beginOrder()">＋ Заказ</button><button type="button" @click="$emit('close')">Закрыть</button></div>
  </aside></div></Teleport>
  <SingleSelectSheet :open="picker==='status'" title="CRM-статус" :options="statusOptions" :model-value="form.crmStatus" empty-label="Без статуса" @update:model-value="form.crmStatus=$event" @close="picker=''"/>
  <SingleSelectSheet :open="picker==='manager'" title="Менеджер" :options="managerOptions" :model-value="form.managerLogin" empty-label="Не менять" @update:model-value="form.managerLogin=$event" @close="picker=''"/>
  <SingleSelectSheet :open="picker==='date'" title="Следующий контакт" :options="nextDateOptions" model-value="" empty-label="Оставить текущую дату" :searchable="false" @update:model-value="applyDatePreset" @close="picker=''"/>
</template>
