<script setup>
import { computed, nextTick, ref } from 'vue'
import { useDraftsStore } from '../stores/drafts'
import { useChatStore } from '../stores/chat'
import { useUiStore } from '../stores/ui'

const props = defineProps({ peerId: Number })
const emit = defineEmits(['open-phrases'])
const drafts = useDraftsStore()
const chat = useChatStore()
const ui = useUiStore()
const photoInput = ref(null)
const docInput = ref(null)
const videoInput = ref(null)
const audioInput = ref(null)
const draft = computed(() => drafts.ensure(props.peerId))

function updateText(e) { drafts.setText(props.peerId, e.target.value) }
async function chooseFile(type, e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  try { await chat.upload(type, file); ui.toast('Файл прикреплён', 'ok') } catch (err) { ui.toast(err.message, 'error', 6000) }
}
async function send() {
  try { const row=await chat.send();if(row)ui.toast('Сообщение поставлено в очередь','ok',1800) } catch (err) { ui.toast(err.message, 'error', 6000) }
}
function keydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); send() }
}
</script>
<template>
  <div class="composer-area">
    <div v-if="chat.replyTo" class="composer-reply"><div><b>Ответ {{ chat.replyTo.displayAuthor || chat.replyTo.author }}</b><span>{{ chat.replyTo.text || 'Вложение' }}</span></div><button type="button" @click="chat.replyTo=null">×</button></div>
    <div v-if="draft.attachments.length" class="pending-attachments">
      <span v-for="a in draft.attachments" :key="a.attachment">📎 {{ a.name || a.kind }} <button type="button" @click="drafts.removeAttachment(peerId,a.attachment)">×</button></span>
    </div>
    <form class="composer" @submit.prevent="send">
      <button type="button" class="composer-icon" @click="photoInput.click()">＋</button>
      <button type="button" class="composer-icon bolt" @click="$emit('open-phrases')">⚡</button>
      <textarea :value="draft.text" placeholder="Напишите сообщение…" rows="1" @input="updateText" @keydown="keydown"></textarea>
      <button class="send-button" :disabled="chat.uploading || (!draft.text.trim() && !draft.attachments.length)">➤</button>
      <input ref="photoInput" class="hidden-input" type="file" accept="image/*" @change="chooseFile('photo',$event)">
      <input ref="videoInput" class="hidden-input" type="file" accept="video/*" @change="chooseFile('video',$event)">
      <input ref="audioInput" class="hidden-input" type="file" accept="audio/*" @change="chooseFile('audio_message',$event)">
      <input ref="docInput" class="hidden-input" type="file" @change="chooseFile('doc',$event)">
    </form>
    <div class="attachment-shortcuts">
      <button type="button" @click="photoInput.click()">Фото</button><button type="button" @click="videoInput.click()">Видео</button><button type="button" @click="audioInput.click()">ГС</button><button type="button" @click="docInput.click()">Файл</button>
    </div>
  </div>
</template>
