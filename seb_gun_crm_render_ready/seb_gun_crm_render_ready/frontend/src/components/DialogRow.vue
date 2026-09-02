<script setup>
import { ref, watch } from 'vue'
import { api } from '../services/api'
const props = defineProps({ dialog: Object })
const avatarFailed = ref(false)
watch(() => props.dialog?.avatar, () => { avatarFailed.value = false })
function fmt(ts) {
  if (!ts) return ''
  const d = new Date(Number(ts) * 1000)
  const today = new Date()
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
}
</script>
<template>
  <article class="dialog-row">
    <img v-if="dialog.avatar && !avatarFailed" class="avatar" :src="api.imageUrl(dialog.avatar)" alt="" loading="lazy" @error="avatarFailed=true">
    <div v-else class="avatar avatar-fallback">{{ (dialog.name || '?').slice(0,1).toUpperCase() }}</div>
    <div class="dialog-body">
      <div class="dialog-title-line"><strong>{{ dialog.name }}</strong><time>{{ fmt(dialog.lastMessageAt) }}</time></div>
      <div class="dialog-preview"><span>{{ dialog.lastMessageOut ? 'Вы: ' : '' }}{{ dialog.lastMessage || 'Без текста' }}</span><b v-if="dialog.unreadCount">{{ dialog.unreadCount }}</b></div>
      <div class="dialog-meta" v-if="dialog.crm">
        <span v-if="dialog.crm.crmStatus" class="meta-pill">{{ dialog.crm.crmStatus }}</span>
        <span v-if="dialog.crm.manager" class="meta-muted">{{ dialog.crm.manager }}</span>
      </div>
    </div>
  </article>
</template>
