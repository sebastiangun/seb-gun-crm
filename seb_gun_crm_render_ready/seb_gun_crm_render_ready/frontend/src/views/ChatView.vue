<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useChatStore } from '../stores/chat'
import { useDraftsStore } from '../stores/drafts'
import { useSessionStore } from '../stores/session'
import { useUiStore } from '../stores/ui'
import { api } from '../services/api'
import MessageBubble from '../components/MessageBubble.vue'
import Composer from '../components/Composer.vue'
import PhraseDrawer from '../components/PhraseDrawer.vue'
import ClientDrawer from '../components/ClientDrawer.vue'

const route = useRoute()
const router = useRouter()
const chat = useChatStore()
const drafts = useDraftsStore()
const session = useSessionStore()
const ui = useUiStore()
const scroller = ref(null)
const avatarFailed = ref(false)
const nearBottom = ref(true)
const userControlled = ref(false)
const swipe = { x:0, y:0, side:'', active:false }

const panel = computed(() => String(route.query.panel || ''))
const phraseOpen = computed(() => panel.value === 'phrases')
const clientOpen = computed(() => panel.value === 'client')

function openPanel(name) {
  if (panel.value === name) return
  router.push({ path: route.path, query: { ...route.query, panel: name } })
}
function closePanel() {
  if (!panel.value) return
  router.back()
}
function updateNearBottom() {
  const el = scroller.value
  if (!el) return
  nearBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 120
  if (nearBottom.value) chat.newMessageCount = 0
}
function onUserScroll() { userControlled.value = true; updateNearBottom() }
function scrollBottom(smooth=false) {
  nextTick(() => {
    const el = scroller.value
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
    nearBottom.value = true
    chat.newMessageCount = 0
  })
}
async function loadOlder() {
  const el = scroller.value
  if (!el) return
  const beforeHeight = el.scrollHeight
  const beforeTop = el.scrollTop
  const added = await chat.loadOlder()
  if (added) await nextTick(() => { el.scrollTop = el.scrollHeight - beforeHeight + beforeTop })
}
async function transcribe(m) {
  try { await chat.transcribe(m); ui.toast('Расшифровка готова', 'ok') } catch(e) { ui.toast(e.message, 'error', 6000) }
}
function onPointerDown(e) {
  if (e.pointerType === 'mouse') return
  const w = window.innerWidth
  swipe.x = e.clientX; swipe.y = e.clientY; swipe.active = true
  swipe.side = (e.clientX >= 24 && e.clientX < 140) ? 'left' : (e.clientX <= w-24 && e.clientX > w-140) ? 'right' : ''
}
function onPointerUp(e) {
  if (!swipe.active || !swipe.side) { swipe.active=false; return }
  const dx=e.clientX-swipe.x, dy=e.clientY-swipe.y
  if (Math.abs(dx)>45 && Math.abs(dx)>Math.abs(dy)*1.05) {
    if (swipe.side==='left' && dx>0) openPanel('phrases')
    if (swipe.side==='right' && dx<0) openPanel('client')
  }
  swipe.active=false
}

watch(() => chat.forceBottomToken, () => scrollBottom(true))
watch(() => chat.messages.length, () => { if (!userControlled.value || nearBottom.value) scrollBottom(false) })
watch(() => route.params.peerId, async id => { if (id) { avatarFailed.value=false; userControlled.value=false; await chat.open(id); scrollBottom(false) } })

onMounted(async () => {
  drafts.init(session.loginName)
  await chat.open(route.params.peerId)
  scrollBottom(false)
})
onBeforeUnmount(() => chat.close())
</script>

<template>
  <main class="chat-page" @pointerdown.passive="onPointerDown" @pointerup.passive="onPointerUp">
    <header class="chat-header">
      <button type="button" class="icon-circle" @click="router.push('/dialogs')">‹</button>
      <img v-if="chat.peer?.avatar && !avatarFailed" class="chat-avatar" :src="api.imageUrl(chat.peer.avatar)" alt="" @error="avatarFailed=true">
      <div v-else class="chat-avatar avatar-fallback">{{ (chat.peer?.name||'?').slice(0,1) }}</div>
      <div class="chat-heading"><strong>{{ chat.peer?.name || 'Диалог' }}</strong><small>{{ chat.crm?.crmStatus || (chat.loading ? 'Загрузка…' : 'VK') }}</small></div>
      <button type="button" class="header-action" @click="openPanel('phrases')">⚡</button>
      <button type="button" class="header-action crm-header-btn" @click="openPanel('client')">CRM</button>
    </header>

    <section ref="scroller" class="message-scroller" @scroll.passive="onUserScroll" @wheel.passive="userControlled=true" @touchstart.passive="userControlled=true">
      <div class="history-top">
        <button v-if="chat.hasOlder" type="button" class="secondary-btn" :disabled="chat.loadingOlder" @click="loadOlder">{{ chat.loadingOlder ? 'Загружаю…' : 'Загрузить более ранние сообщения' }}</button>
        <span v-else-if="chat.messages.length">Начало загруженной истории</span>
      </div>
      <div v-if="chat.loading && !chat.messages.length" class="chat-loading"><div class="spinner"></div><span>Открываю диалог…</span></div>
      <MessageBubble v-for="m in chat.messages" :key="m.id || m.conversationMessageId" :message="m" :transcript-job="chat.transcriptJobs[String(m.id||m.conversationMessageId)]" @reply="chat.replyTo=$event" @transcribe="transcribe" />
      <div class="bottom-space"></div>
    </section>

    <button v-if="chat.newMessageCount && !nearBottom" type="button" class="new-message-fab" @click="scrollBottom(true)">↓ {{ chat.newMessageCount }} новых</button>
    <button type="button" class="edge-handle left" @click="openPanel('phrases')">⚡</button>
    <button type="button" class="edge-handle right" @click="openPanel('client')">CRM</button>
    <Composer v-if="chat.peerId" :peer-id="chat.peerId" @open-phrases="openPanel('phrases')" />
    <PhraseDrawer :open="phraseOpen" @close="closePanel" />
    <ClientDrawer :open="clientOpen" @close="closePanel" />
  </main>
</template>
