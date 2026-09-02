<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { usePhrasesStore } from '../stores/phrases'
import { useDraftsStore } from '../stores/drafts'
import { useChatStore } from '../stores/chat'
import { useUiStore } from '../stores/ui'

const props = defineProps({ open: Boolean })
const emit = defineEmits(['close'])
const phrases = usePhrasesStore()
const drafts = useDraftsStore()
const chat = useChatStore()
const ui = useUiStore()
const scrollEl = ref(null)
const POSITION_KEY = 'seb-gun-v28-phrase-scroll'

function firstName() { return String(chat.crm?.fullName || chat.peer?.name || '').trim().split(/\s+/)[0] || '' }
function expand(text) {
  const c = chat.crm || {}
  const map = { 'Имя': firstName(), 'ФИО': c.fullName || chat.peer?.name || '', 'Телефон': c.phone || '', 'E-mail': c.email || '', 'Email': c.email || '', 'Город': c.city || '', 'CRM-статус': c.crmStatus || '', 'Менеджер': c.manager || '' }
  let out = String(text || '')
  for (const [k,v] of Object.entries(map)) out = out.replace(new RegExp(`\\[${k}\\]|\\{${k}\\}`, 'gi'), String(v || ''))
  return out
}
function selectPhrase(p) {
  phrases.remember(p.id)
  drafts.replaceWithPhrase(chat.peerId, { text: expand(p.text), attachments: p.attachments || [] })
  try { localStorage.setItem(POSITION_KEY, String(scrollEl.value?.scrollTop || 0)) } catch {}
  ui.toast('Скрипт сохранён в черновике', 'ok')
  emit('close')
}
function onScroll() { try { localStorage.setItem(POSITION_KEY, String(scrollEl.value?.scrollTop || 0)) } catch {} }
onMounted(async () => {
  try { await phrases.load() } catch (e) { ui.toast(e.message, 'error') }
})
watch(() => props.open, async (open) => {
  if (!open) return
  if (!phrases.loaded) { try { await phrases.load() } catch (e) { ui.toast(e.message, 'error') } }
  await nextTick()
  if (scrollEl.value) scrollEl.value.scrollTop = Number(localStorage.getItem(POSITION_KEY) || 0)
})
</script>
<template>
  <Teleport to="body">
    <div v-if="open" class="drawer-backdrop" @pointerdown.self="$emit('close')">
      <aside class="side-drawer left-drawer">
        <header><div><small>BLUE SALES</small><h3>Быстрые фразы</h3></div><button type="button" @click="$emit('close')">×</button></header>
        <div class="drawer-search"><span>⌕</span><input v-model="phrases.query" placeholder="Название или текст скрипта"></div>
        <div ref="scrollEl" class="phrase-scroll" @scroll.passive="onScroll">
          <div v-if="phrases.loading" class="drawer-loading">Загружаю скрипты…</div>
          <section v-for="g in phrases.filtered" :key="g.id" class="phrase-group">
            <h4>{{ g.name }}</h4>
            <button v-for="p in g.phrases" :key="p.id" type="button" class="phrase-row" :class="{last: p.id===phrases.lastId}" @click="selectPhrase(p)">
              <span>{{ p.name }}</span><small v-if="p.attachments?.length">📎 {{ p.attachments.length }}</small>
            </button>
          </section>
        </div>
      </aside>
    </div>
  </Teleport>
</template>
