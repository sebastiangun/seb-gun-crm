<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { api } from '../services/api'

const props = defineProps({ attachment: Object, busy: Boolean })
const emit = defineEmits(['transcribe'])
const audio = ref(null)
const playing = ref(false)
const current = ref(0)
const duration = ref(Number(props.attachment?.duration || 0))
const failedDirect = ref(false)

const source = computed(() => failedDirect.value ? api.voicePlaybackUrl(props.attachment?.url) : api.voiceUrl(props.attachment?.url))
const pct = computed(() => duration.value > 0 ? Math.min(100, (current.value / duration.value) * 100) : 0)
function fmt(v) { const n = Math.max(0, Math.floor(Number(v)||0)); return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}` }
function toggle() {
  if (!audio.value) return
  if (audio.value.paused) audio.value.play().catch(() => { failedDirect.value = true; setTimeout(() => audio.value?.play().catch(()=>{}), 50) })
  else audio.value.pause()
}
function seek(e) {
  if (!audio.value || !duration.value) return
  const r = e.currentTarget.getBoundingClientRect()
  audio.value.currentTime = Math.max(0, Math.min(duration.value, ((e.clientX-r.left)/r.width)*duration.value))
}
function onError() { if (!failedDirect.value) failedDirect.value = true }
onBeforeUnmount(() => { try { audio.value?.pause() } catch {} })
</script>
<template>
  <div class="voice-box">
    <audio ref="audio" :src="source" preload="metadata" @play="playing=true" @pause="playing=false" @ended="playing=false" @timeupdate="current=$event.target.currentTime" @loadedmetadata="duration=$event.target.duration || duration" @error="onError"></audio>
    <button class="voice-play" type="button" @click="toggle">{{ playing ? 'Ⅱ' : '▶' }}</button>
    <div class="voice-main">
      <button type="button" class="voice-track" @click="seek"><span :style="{width:`${pct}%`}"></span><i v-for="n in 24" :key="n" :style="{height:`${8 + ((n*7)%16)}px`}"></i></button>
      <small>{{ fmt(current || duration) }} · голосовое</small>
    </div>
    <button v-if="!attachment.transcript" type="button" class="voice-text-btn" :disabled="busy" @click="$emit('transcribe')">{{ busy ? '…' : 'A⌄' }}</button>
  </div>
  <div v-if="attachment.transcript" class="voice-transcript"><b>Расшифровка</b><p>{{ attachment.transcript }}</p></div>
</template>
