<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../services/api'
import { useSessionStore } from '../stores/session'
import { useUiStore } from '../stores/ui'
import { useBrowserNotificationsStore } from '../stores/browserNotifications'

const session=useSessionStore(),ui=useUiStore(),router=useRouter()
const browserNotifications=useBrowserNotificationsStore()
const databaseSyncing=ref(false),bootstrap=ref(null)

async function enableBrowserNotifications(){try{await browserNotifications.enable();await browserNotifications.test();ui.toast('Браузерные уведомления включены, тестовая плашка отправлена','ok')}catch(e){ui.toast(e.message,'error',7000)}}
async function testBrowserNotifications(){try{await browserNotifications.test();ui.toast('Тестовое уведомление отправлено','ok')}catch(e){ui.toast(e.message,'error',7000)}}
async function syncDatabase(){databaseSyncing.value=true;try{const d=await api.syncDatabase();ui.toast(`Сохранено карточек: ${d.clients}`,'ok')}catch(e){ui.toast(e.message,'error')}finally{databaseSyncing.value=false}}
async function loadBootstrap(){try{bootstrap.value=(await api.bootstrapDialogsStatus()).state||null}catch{}}
async function logout(){await session.logout();router.replace('/dialogs')}
onMounted(loadBootstrap)
</script>

<template>
  <main class="page page-with-nav">
    <header class="page-header sticky-header"><div><small>SEB_GUN CRM</small><h1>Ещё</h1></div><button class="header-action" @click="ui.toggleTheme()">{{ui.theme==='dark'?'☀':'☾'}}</button></header>

    <section class="settings-card">
      <h3>Аккаунт</h3>
      <div class="setting-row"><span>BlueSales</span><b>{{session.account?.name||session.loginName}}</b></div>
      <div class="setting-row"><span>VK</span><b>{{session.vk?.groupName||'Подключён'}}</b></div>
      <div class="setting-row"><span>Права</span><b>{{session.isAdmin?'Администратор':'Менеджер'}}</b></div>
      <div class="setting-row"><span>Версия</span><b>v28.19 Vue</b></div>
      <div class="setting-row timezone-row"><span>Время проекта</span><b>Москва (МСК)</b></div>
    </section>

    <section v-if="session.isAdmin" class="settings-card admin-entry">
      <div><h3>Админка</h3><p>Быстрые фразы, пользователи, CRM-статусы и общий журнал лидов. Доступ администратора теперь восстанавливается и при пустой PostgreSQL-базе из встроенной конфигурации.</p></div>
      <button class="primary-btn" @click="router.push('/admin/phrases')">Открыть админку</button>
    </section>

    <section class="settings-card control-links-card">
      <h3>Контроль работы</h3>
      <p>Разделы полностью разделены: зависшие сообщения, SLA/нарушения, настройка доставки и история фактически отправленных уведомлений.</p>
      <button class="control-link" @click="router.push('/outbox')"><span>📤</span><div><b>Неотправленные сообщения</b><small>Только зависшие исходящие VK</small></div><strong>›</strong></button>
      <button class="control-link" @click="router.push('/sla')"><span>📊</span><div><b>Менеджеры и SLA</b><small>Вовремя, нарушения, рабочие часы и статистика</small></div><strong>›</strong></button>
      <button class="control-link" @click="router.push('/notifications')"><span>🔔</span><div><b>Настройка уведомлений</b><small>Кому, по каким менеджерам и статусам отправлять</small></div><strong>›</strong></button><button class="control-link" @click="router.push('/notification-history')"><span>🧾</span><div><b>Уведомления</b><small>История доставки: Telegram, браузер, оба или не доставлено</small></div><strong>›</strong></button>
    </section>

    <section class="settings-card browser-alert-settings">
      <h3>Системные уведомления браузера</h3>
      <p>Используют тот же строгий серверный фильтр, что и правило получателя. Если в правиле не выбраны менеджеры и статусы, уведомления по этому правилу не рассылаются.</p>
      <div class="setting-row"><span>Поддержка браузером</span><b :class="browserNotifications.supported?'connected-text':'muted-text'">{{browserNotifications.supported?'Есть':'Нет'}}</b></div>
      <div class="setting-row"><span>Разрешение</span><b :class="browserNotifications.permission==='granted'?'connected-text':'muted-text'">{{browserNotifications.permission==='granted'?'Разрешено':browserNotifications.permission==='denied'?'Запрещено':'Не запрошено'}}</b></div>
      <div class="button-row"><button v-if="!browserNotifications.enabled" class="primary-btn" @click="enableBrowserNotifications">Включить</button><button v-else class="secondary-btn" @click="browserNotifications.disable()">Выключить</button><button class="secondary-btn" :disabled="!browserNotifications.supported" @click="testBrowserNotifications">Тест</button></div>
      <small>При полностью закрытом браузере локальная проверка не работает; серверный Telegram продолжает работать независимо.</small>
    </section>

    <section v-if="session.isAdmin" class="settings-card">
      <h3>PostgreSQL</h3>
      <p>Карточки, SLA, очередь, журнал нарушений и история доставки v28.19 сохраняются в PostgreSQL.</p><div class="setting-row"><span>Первичная проверка диалогов</span><b>{{bootstrap?.status||'не запускалась'}}<template v-if="bootstrap?.totalDialogs"> · {{bootstrap.processedDialogs||0}}/{{bootstrap.totalDialogs}}</template></b></div>
      <button class="secondary-btn" :disabled="databaseSyncing" @click="syncDatabase">{{databaseSyncing?'Синхронизация…':'Синхронизировать клиентов'}}</button>
    </section>

    <section class="settings-card"><h3>Резерв</h3><p>Старый интерфейс v27 оставлен для отката и сравнения.</p><a class="secondary-btn link-btn" href="/legacy/">Открыть Legacy v27</a></section>
    <button class="danger-btn" @click="logout">Выйти</button>
  </main>
</template>
