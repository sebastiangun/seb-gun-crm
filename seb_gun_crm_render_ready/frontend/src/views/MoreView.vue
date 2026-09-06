<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../services/api'
import { useSessionStore } from '../stores/session'
import { useUiStore } from '../stores/ui'
import { useBrowserNotificationsStore } from '../stores/browserNotifications'

const session=useSessionStore(),ui=useUiStore(),router=useRouter()
const browserNotifications=useBrowserNotificationsStore()
const databaseSyncing=ref(false),bootstrap=ref(null),pollTimer=ref(0),notificationSummary=ref(null),pollCount=ref(0)
const bootstrapProgress=computed(()=>{const total=Number(bootstrap.value?.totalDialogs||0),done=Number(bootstrap.value?.currentBatchEnd||bootstrap.value?.processedDialogs||0);return total?Math.min(100,Math.round(done/total*100)):0})
const bootstrapRunning=computed(()=>['running','starting'].includes(String(bootstrap.value?.status||'')))

async function enableBrowserNotifications(){try{await browserNotifications.enable();await browserNotifications.test();ui.toast('Браузерные уведомления включены, тестовая плашка отправлена','ok')}catch(e){ui.toast(e.message,'error',7000)}}
async function testBrowserNotifications(){try{await browserNotifications.test();ui.toast('Тестовое уведомление отправлено','ok')}catch(e){ui.toast(e.message,'error',7000)}}
async function syncDatabase(){databaseSyncing.value=true;try{const d=await api.syncDatabase();ui.toast(`Сохранено карточек: ${d.clients}`,'ok')}catch(e){ui.toast(e.message,'error')}finally{databaseSyncing.value=false}}
async function loadStatus({withHistory=false}={}){try{const b=await api.bootstrapDialogsStatus();bootstrap.value=b.state||null;if(withHistory){const h=await api.notificationHistory().catch(()=>null);notificationSummary.value=h?.summary||notificationSummary.value}}catch{}}
async function poll(){pollCount.value++;await loadStatus({withHistory:pollCount.value%4===0});if(bootstrapRunning.value||bootstrap.value?.status==='paused_rate_limit')pollTimer.value=window.setTimeout(poll,15000)}
async function logout(){await session.logout();router.replace('/dialogs')}
onMounted(async()=>{await loadStatus({withHistory:true});if(bootstrapRunning.value||bootstrap.value?.status==='paused_rate_limit')pollTimer.value=window.setTimeout(poll,12000)})
onBeforeUnmount(()=>{if(pollTimer.value)clearTimeout(pollTimer.value)})
</script>

<template>
  <main class="page page-with-nav">
    <header class="page-header sticky-header"><div><small>SEB_GUN CRM</small><h1>Ещё</h1></div><button class="header-action" @click="ui.toggleTheme()">{{ui.theme==='dark'?'☀':'☾'}}</button></header>

    <section class="settings-card account-card">
      <h3>Аккаунт</h3>
      <div class="setting-row"><span>BlueSales</span><b>{{session.account?.name||session.loginName}}</b></div>
      <div class="setting-row"><span>VK</span><b>{{session.vk?.groupName||'Подключён'}}</b></div>
      <div class="setting-row"><span>Права</span><b>{{session.isAdmin?'Администратор':'Менеджер'}}</b></div>
      <div class="setting-row"><span>Версия</span><b>v28.21 Vue</b></div>
      <div class="setting-row timezone-row"><span>Время проекта</span><b>Москва (МСК)</b></div>
    </section>

    <section v-if="session.isAdmin" class="settings-card admin-entry">
      <div><h3>Админка</h3><p>Пользователи, CRM-статусы, журнал лидов, нарушения, удаление ошибочных записей и контроль первичной проверки.</p></div>
      <button class="primary-btn" @click="router.push('/admin/phrases')">Открыть админку</button>
    </section>

    <section class="settings-card control-links-card">
      <h3>Контроль работы</h3>
      <p>Каждый раздел отвечает только за свою задачу. Настройки доставки не смешиваются с SLA и очередью сообщений.</p>
      <button class="control-link" @click="router.push('/outbox')"><span>📤</span><div><b>Неотправленные сообщения</b><small>Зависшие исходящие VK, порог зависания и повтор уведомления</small></div><strong>›</strong></button>
      <button class="control-link" @click="router.push('/sla')"><span>📊</span><div><b>Менеджеры и SLA</b><small>Вовремя, нарушения, рабочие часы, прогресс проверки и статистика</small></div><strong>›</strong></button>
      <button class="control-link" @click="router.push('/notifications')"><span>⚙️</span><div><b>Настройка уведомлений</b><small>Кому, по каким менеджерам/статусам, когда и какими каналами отправлять</small></div><strong>›</strong></button>
      <button class="control-link" @click="router.push('/notification-history')"><span>🔔</span><div><b>Уведомления</b><small>Фактическая доставка + восстановленная история старых SLA-событий</small></div><strong>›</strong><b v-if="notificationSummary?.total" class="nav-count">{{notificationSummary.total}}</b></button>
    </section>

    <section class="settings-card browser-alert-settings">
      <div class="section-title-row"><div><h3>Системные уведомления браузера</h3><p>Браузерный канал работает только на устройствах, где пользователь дал разрешение. Telegram работает независимо от открытого браузера.</p></div><span class="info-chip">Канал устройства</span></div>
      <div class="setting-row"><span>Поддержка браузером</span><b :class="browserNotifications.supported?'connected-text':'muted-text'">{{browserNotifications.supported?'Есть':'Нет'}}</b></div>
      <div class="setting-row"><span>Разрешение</span><b :class="browserNotifications.permission==='granted'?'connected-text':'muted-text'">{{browserNotifications.permission==='granted'?'Разрешено':browserNotifications.permission==='denied'?'Запрещено':'Не запрошено'}}</b></div>
      <div class="button-row"><button v-if="!browserNotifications.enabled" class="primary-btn" @click="enableBrowserNotifications">Включить</button><button v-else class="secondary-btn" @click="browserNotifications.disable()">Выключить</button><button class="secondary-btn" :disabled="!browserNotifications.supported" @click="testBrowserNotifications">Тест</button></div>
      <small>Если браузер полностью закрыт, системная плашка может не появиться. В истории доставки это будет видно отдельно; Telegram при этом может быть доставлен успешно.</small>
    </section>

    <section v-if="session.isAdmin" class="settings-card bootstrap-dashboard">
      <div class="section-title-row"><div><h3>Первичная проверка диалогов</h3><p>Запускается автоматически один раз. После завершения полный исторический проход больше не повторяется.</p></div><b :class="bootstrap?.status==='completed'?'connected-text':bootstrap?.status==='failed'?'danger-text':'muted-text'">{{bootstrap?.status||'не запускалась'}}</b></div>
      <div v-if="bootstrap?.totalDialogs" class="progress-block"><div class="progress-track"><i :style="{width:`${bootstrapProgress}%`}"></i></div><div class="progress-meta"><b>{{bootstrapProgress}}%</b><span>{{bootstrap.currentBatchEnd||bootstrap.processedDialogs||0}} / {{bootstrap.totalDialogs}} диалогов</span><span v-if="bootstrap.failedDialogs">Ошибок: {{bootstrap.failedDialogs}}</span></div></div>
      <div class="data-status-grid"><span><small>Обработано успешно</small><b>{{bootstrap?.processedDialogs||0}}</b></span><span><small>Ошибок</small><b>{{bootstrap?.failedDialogs||0}}</b></span><span><small>История уведомлений</small><b>{{notificationSummary?.historical||0}} старых событий</b></span></div>
      <div v-if="bootstrap?.folders" class="folder-mini-stats"><span>Нарушения <b>{{bootstrap.folders.violations||0}}</b></span><span>Вовремя <b>{{bootstrap.folders.onTime||0}}</b></span><span>Ждут <b>{{bootstrap.folders.waiting||0}}</b></span></div>
      <div v-if="bootstrap?.lastError" class="inline-error">{{bootstrap.lastError}}</div>
    </section>

    <section v-if="session.isAdmin" class="settings-card">
      <h3>PostgreSQL</h3>
      <p>Карточки, SLA, очередь, журнал нарушений и история доставки сохраняются в PostgreSQL.</p>
      <button class="secondary-btn" :disabled="databaseSyncing" @click="syncDatabase">{{databaseSyncing?'Синхронизация…':'Синхронизировать клиентов'}}</button>
    </section>

    <section class="settings-card"><h3>Резерв</h3><p>Старый интерфейс v27 оставлен только для отката и сравнения.</p><a class="secondary-btn link-btn" href="/legacy/">Открыть Legacy v27</a></section>
    <button class="danger-btn" @click="logout">Выйти</button>
  </main>
</template>
