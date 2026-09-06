<script setup>
import { onMounted, onBeforeUnmount, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useSessionStore } from './stores/session'
import { useUiStore } from './stores/ui'
import LoginView from './views/LoginView.vue'
import BottomNav from './components/BottomNav.vue'
import { rememberListRoute } from './utils/navigation'
import { useOutboxStore } from './stores/outbox'
import MoscowClock from './components/MoscowClock.vue'
import { useBrowserNotificationsStore } from './stores/browserNotifications'
import { api } from './services/api'

const session = useSessionStore()
const ui = useUiStore()
const router = useRouter()
const route = useRoute()
const outbox = useOutboxStore()
const browserNotifications = useBrowserNotificationsStore()
watch(() => route.fullPath, () => rememberListRoute(route), { immediate: true })
watch(() => session.authenticated, value => { if(value){browserNotifications.start();api.bootstrapDialogsOnce().catch(()=>{})}else browserNotifications.stop() })

async function authExpired() {
  ui.toast('Сессия BlueSales завершилась. Войдите снова.', 'error', 5000)
  session.authenticated = false
  session.ready = true
}

onMounted(async () => {
  window.addEventListener('crm:auth-expired', authExpired)
  await session.bootstrap()
  if(session.authenticated){outbox.init(session.loginName);browserNotifications.start();api.bootstrapDialogsOnce().catch(()=>{})}
  if (session.authenticated && route.path === '/') router.replace('/dialogs')
})
onBeforeUnmount(() => {window.removeEventListener('crm:auth-expired', authExpired);browserNotifications.stop()})
</script>

<template>
  <div class="app-root">
    <div v-if="!session.ready" class="boot-screen">
      <div class="boot-logo">seb_gun CRM</div>
      <div class="spinner"></div>
      <small>Подключаем VK и BlueSales…</small>
    </div>
    <LoginView v-else-if="!session.authenticated" />
    <template v-else>
      <MoscowClock />
      <router-view />
      <BottomNav v-if="!$route.path.startsWith('/dialogs/') && !$route.path.startsWith('/admin')" />
    </template>

    <div class="toast-stack" aria-live="polite">
      <button v-for="t in ui.toasts" :key="t.id" class="toast" :class="`toast-${t.type}`" @click="ui.removeToast(t.id)">
        {{ t.message }}
      </button>
    </div>
  </div>
</template>
