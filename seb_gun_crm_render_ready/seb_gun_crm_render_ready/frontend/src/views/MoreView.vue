<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { api } from '../services/api'
import { useSessionStore } from '../stores/session'
import { useMetaStore } from '../stores/meta'
import { useUiStore } from '../stores/ui'
import { useRouter } from 'vue-router'

const session=useSessionStore(),meta=useMetaStore(),ui=useUiStore(),router=useRouter()
const notification=ref(null),manager=ref(''),saving=ref(false)
const form=reactive({enabled:false,slaMinutes:8,workStart:'10:00',workEnd:'22:00',repeatMinutes:0,timezone:'Europe/Moscow'})
const managers=computed(()=>meta.users.map(u=>u.name||u.login))
function selectedRule(){return notification.value?.rules?.find(r=>r.manager===manager.value)}
function syncRule(){const r=selectedRule();Object.assign(form,{enabled:!!r?.enabled,slaMinutes:Number(r?.slaMinutes||8),workStart:r?.workStart||'10:00',workEnd:r?.workEnd||'22:00',repeatMinutes:Number(r?.repeatMinutes||0),timezone:r?.timezone||'Europe/Moscow'})}
async function load(){await meta.load();notification.value=await api.notificationSettings();manager.value=manager.value||managers.value[0]||'';syncRule()}
async function save(){saving.value=true;try{await api.saveNotificationSettings({manager:manager.value,...form});ui.toast('Настройки уведомлений сохранены','ok');await load()}catch(e){ui.toast(e.message,'error')}finally{saving.value=false}}
async function pair(){try{const d=await api.pairTelegram(manager.value);window.open(d.pairUrl,'_blank','noopener');ui.toast('Откройте Telegram и нажмите START','ok',6000)}catch(e){ui.toast(e.message,'error')}}
async function test(){try{await api.testTelegram(manager.value);ui.toast('Тест отправлен в Telegram','ok')}catch(e){ui.toast(e.message,'error')}}
async function logout(){await session.logout();router.replace('/dialogs')}
onMounted(()=>load().catch(e=>ui.toast(e.message,'error')))
</script>
<template>
  <main class="page page-with-nav">
    <header class="page-header sticky-header"><div><small>SEB_GUN CRM</small><h1>Ещё</h1></div><button class="header-action" @click="ui.toggleTheme()">{{ui.theme==='dark'?'☀':'☾'}}</button></header>
    <section class="settings-card"><h3>Аккаунт</h3><div class="setting-row"><span>BlueSales</span><b>{{session.account?.name||session.loginName}}</b></div><div class="setting-row"><span>VK</span><b>{{session.vk?.groupName||'Подключён'}}</b></div><div class="setting-row"><span>Версия</span><b>v28.0 Vue</b></div></section>
    <section class="settings-card"><h3>Telegram SLA</h3><label>Менеджер<select v-model="manager" @change="syncRule"><option v-for="m in managers" :key="m">{{m}}</option></select></label><label class="toggle-row"><input v-model="form.enabled" type="checkbox"><span>Уведомления включены</span></label><div class="form-grid"><label>SLA, минут<input v-model.number="form.slaMinutes" type="number" min="1"></label><label>Повтор, минут<input v-model.number="form.repeatMinutes" type="number" min="0"></label></div><div class="form-grid"><label>Начало<input v-model="form.workStart" type="time"></label><label>Конец<input v-model="form.workEnd" type="time"></label></div><button class="primary-btn" :disabled="saving||!manager" @click="save">Сохранить настройки</button><div class="button-row"><button class="secondary-btn" @click="pair">Подключить Telegram</button><button class="secondary-btn" @click="test">Тест</button></div></section>
    <section class="settings-card"><h3>Резерв</h3><p>Старый интерфейс v27 оставлен для отката и сравнения.</p><a class="secondary-btn link-btn" href="/legacy/">Открыть Legacy v27</a></section>
    <button class="danger-btn" @click="logout">Выйти</button>
  </main>
</template>
