<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useDraftsStore } from '../stores/drafts'
import { useChatStore } from '../stores/chat'
import { useUiStore } from '../stores/ui'
import { normalizePhraseSearch, usePhrasesStore } from '../stores/phrases'

const props = defineProps({ peerId: Number })
const emit = defineEmits(['open-phrases'])
const drafts = useDraftsStore()
const chat = useChatStore()
const ui = useUiStore()
const phrases = usePhrasesStore()
const photoInput = ref(null)
const docInput = ref(null)
const videoInput = ref(null)
const audioInput = ref(null)
const textInput = ref(null)
const suggestionsHidden = ref(false)
const draft = computed(() => drafts.ensure(props.peerId))
const phraseQuery=computed(()=>normalizePhraseSearch(String(draft.value.text||'').split(/[\n.!?]+/).pop()))
const phraseSuggestions=computed(()=>{
  const q=phraseQuery.value;if(q.length<2||suggestionsHidden.value)return[]
  const tokens=q.split(/\s+/).filter(Boolean)
  return phrases.all.map(p=>{
    const name=normalizePhraseSearch(p.name||p.title),group=normalizePhraseSearch(p.groupName),body=normalizePhraseSearch(p.text||p.phrase),hay=`${group} ${name} ${body}`
    const score=name.startsWith(q)?0:name.includes(q)?1:group.includes(q)?2:3
    return{p,hay,score}
  }).filter(x=>tokens.every(t=>x.hay.includes(t))).sort((a,b)=>a.score-b.score||String(a.p.name||'').localeCompare(String(b.p.name||''),'ru')).slice(0,14).map(x=>x.p)
})

function resizeInput() {
  const el = textInput.value
  if (!el) return
  el.style.height = 'auto'
  const max = Math.min(220, Math.max(132, Math.round(window.innerHeight * .28)))
  const height = Math.min(el.scrollHeight, max)
  el.style.height = `${Math.max(42, height)}px`
  el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden'
}
function updateText(e) { suggestionsHidden.value=false;drafts.setText(props.peerId, e.target.value); resizeInput() }
function firstName(){return String(chat.crm?.fullName||chat.peer?.name||'').trim().split(/\s+/)[0]||''}
function expandPhrase(text){const c=chat.crm||{},map={'Имя':firstName(),'ФИО':c.fullName||chat.peer?.name||'','Телефон':c.phone||'','E-mail':c.email||'','Email':c.email||'','Город':c.city||'','CRM-статус':c.crmStatus||'','Менеджер':c.manager||''};let out=String(text||'');for(const[k,v]of Object.entries(map))out=out.replace(new RegExp(`\\[${k}\\]|\\{${k}\\}`,'gi'),String(v||''));return out}
function selectSuggestedPhrase(p){phrases.remember(p.id);drafts.replaceWithPhrase(props.peerId,{text:expandPhrase(p.text||p.phrase),attachments:p.attachments||[]});suggestionsHidden.value=true;nextTick(()=>{resizeInput();textInput.value?.focus()})}
async function chooseFile(type, e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  try { await chat.upload(type, file); ui.toast('Файл прикреплён', 'ok') } catch (err) { ui.toast(err.message, 'error', 6000) }
}
async function send() {
  try { const row=await chat.send();if(row){ui.toast('Сообщение поставлено в очередь','ok',1800);await nextTick();resizeInput()} } catch (err) { ui.toast(err.message, 'error', 6000) }
}
function keydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); send() }
}
watch(() => [props.peerId, draft.value.text], () => nextTick(resizeInput))
onMounted(() => {phrases.load().catch(()=>{});nextTick(resizeInput)})
</script>
<template>
  <div class="composer-area">
    <div v-if="chat.replyTo" class="composer-reply"><div><b>Ответ {{ chat.replyTo.displayAuthor || chat.replyTo.author }}</b><span>{{ chat.replyTo.text || 'Вложение' }}</span></div><button type="button" @click="chat.replyTo=null">×</button></div>
    <div v-if="draft.attachments.length" class="pending-attachments">
      <span v-for="a in draft.attachments" :key="a.attachment">📎 {{ a.name || a.kind }} <button type="button" @click="drafts.removeAttachment(peerId,a.attachment)">×</button></span>
    </div>
    <div v-if="phraseSuggestions.length" class="composer-phrase-suggestions"><header><b>Быстрые фразы</b><button type="button" @click="suggestionsHidden=true">×</button></header><button v-for="p in phraseSuggestions" :key="p.id" type="button" @click="selectSuggestedPhrase(p)"><strong>{{p.name||p.title}}</strong><span>{{p.groupName}}</span><small>{{p.text||p.phrase}}</small></button></div>
    <form class="composer" @submit.prevent="send">
      <button type="button" class="composer-icon" @click="photoInput.click()">＋</button>
      <button type="button" class="composer-icon bolt" @click="$emit('open-phrases')">⚡</button>
      <textarea ref="textInput" :value="draft.text" placeholder="Напишите сообщение…" rows="1" @input="updateText" @keydown="keydown"></textarea>
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
