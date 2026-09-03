<script setup>
import { computed, ref } from 'vue'
import { api } from '../services/api'
import VoiceMessage from './VoiceMessage.vue'
import { useUiStore } from '../stores/ui'
import { copyText, messageText } from '../utils/clipboard'

const props = defineProps({ message: Object, transcriptJob: Object })
const emit = defineEmits(['reply', 'forward', 'transcribe', 'retry', 'delete-pending'])
const ui = useUiStore()
const menu = ref(false)
const menuStyle = ref({})
const stamp = computed(() => new Date(Number(props.message.date || 0)*1000).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}))
async function copy() {
  try {
    await copyText(messageText(props.message))
    ui.toast('Сообщение скопировано', 'ok')
  } catch (e) { ui.toast(`Не удалось скопировать: ${e.message}`, 'error') }
  finally { menu.value = false }
}
function imgStyle(a) { return a.width && a.height ? { aspectRatio: `${a.width}/${a.height}` } : {} }
function hideBrokenImage(e) { if (e?.currentTarget) e.currentTarget.style.display = 'none' }
function toggleMenu(e){
  if(menu.value){menu.value=false;return}
  const r=e.currentTarget.getBoundingClientRect(),w=Math.min(236,window.innerWidth-16),h=props.message.pendingStatus?190:170
  menuStyle.value={left:`${Math.max(8,Math.min(window.innerWidth-w-8,r.right-w))}px`,top:`${Math.max(8,r.top>h+12?r.top-h-6:Math.min(window.innerHeight-h-8,r.bottom+6))}px`,width:`${w}px`}
  menu.value=true
}
const stateLabel=computed(()=>({queued:'В очереди',sending:'Отправляется',sent:'Доставлено',error:'Не отправлено'}[props.message.pendingStatus]||''))
</script>
<template>
  <article class="message-line" :class="{out: message.out}">
    <div class="bubble">
      <div class="message-author" v-if="!message.out || message.displayAuthor">{{ message.displayAuthor || message.author }}</div>
      <div v-if="message.reply" class="reply-quote"><b>{{ message.reply.displayAuthor || message.reply.author }}</b><span>{{ message.reply.text || 'Вложение' }}</span></div>
      <p v-if="message.text" class="message-text">{{ message.text }}</p>
      <div v-if="message.attachments?.length" class="attachments-grid">
        <template v-for="(a,i) in message.attachments" :key="`${a.type}-${i}`">
          <img v-if="a.type==='photo'" class="message-photo" :style="imgStyle(a)" :src="api.imageUrl(a.url)" alt="Фото" loading="lazy" @error="hideBrokenImage">
          <a v-else-if="a.type==='video'" class="media-card" :href="a.url" target="_blank" rel="noreferrer"><img v-if="a.preview" :src="api.imageUrl(a.preview)" loading="lazy" @error="hideBrokenImage"><span>▶ {{ a.title || 'Видео' }}</span></a>
          <a v-else-if="a.type==='doc'" class="doc-card" :href="api.mediaUrl(a.url)" target="_blank" rel="noreferrer">📎 <span>{{ a.title || 'Файл' }}</span></a>
          <img v-else-if="a.type==='sticker'" class="sticker" :src="api.imageUrl(a.url)" alt="Стикер" loading="lazy" @error="hideBrokenImage">
          <VoiceMessage v-else-if="a.type==='audio_message'" :attachment="a" :busy="['queued','processing'].includes(transcriptJob?.status)" @transcribe="$emit('transcribe', message)" />
          <a v-else-if="a.url" class="doc-card" :href="a.url" target="_blank">🔗 {{ a.title || a.type }}</a>
        </template>
      </div>
      <div class="message-foot"><span v-if="stateLabel" class="delivery-state" :class="`state-${message.pendingStatus}`"><template v-if="message.pendingStatus==='sent'">✓</template> {{stateLabel}}</span><time>{{ stamp }}</time><div v-if="!message.localId" class="quick-message-actions"><button type="button" title="Ответить" @click="$emit('reply',message)">↩</button><button type="button" title="Переслать" @click="$emit('forward',message)">↪</button></div><button type="button" class="dots" @click="toggleMenu">•••</button></div>
      <p v-if="message.pendingStatus==='error'&&message.pendingError" class="delivery-error">{{message.pendingError}}</p>
      <Teleport to="body"><div v-if="menu" class="viewport-menu-scrim" @click="menu=false"></div><div v-if="menu" class="message-menu viewport-menu" :style="menuStyle">
        <button v-if="!message.localId" type="button" @click="$emit('reply',message);menu=false">↩ Ответить</button>
        <button v-if="!message.localId" type="button" @click="$emit('forward',message);menu=false">↪ Переслать</button>
        <button type="button" @click="copy">⧉ Скопировать сообщение</button>
        <button v-if="message.attachments?.some(a=>a.type==='audio_message')&&!message.localId" type="button" @click="$emit('transcribe',message);menu=false">📝 Расшифровать</button>
        <button v-if="message.pendingStatus==='error'||message.pendingStatus==='queued'" type="button" @click="$emit('retry',message.localId);menu=false">⟳ Повторить отправку</button>
        <button v-if="message.localId&&message.pendingStatus!=='sending'" type="button" class="menu-danger" @click="$emit('delete-pending',message.localId);menu=false">× Удалить из очереди</button>
      </div></Teleport>
    </div>
  </article>
</template>
