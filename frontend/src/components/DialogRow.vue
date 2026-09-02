<script setup>
import { ref, watch } from 'vue'
import { api } from '../services/api'
import { useMetaStore } from '../stores/meta'
import { managerStyle, statusStyle, tagStyle } from '../utils/colors'
const props = defineProps({ dialog: Object })
const meta = useMetaStore()
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
        <span v-if="dialog.crm.crmStatus" class="color-chip" :style="statusStyle(meta,dialog.crm.crmStatus,dialog.crm.crmStatusColor)">{{ dialog.crm.crmStatus }}</span>
        <span v-if="dialog.crm.manager" class="color-chip" :style="managerStyle(meta,dialog.crm.manager,dialog.crm.managerColor)">{{ dialog.crm.manager }}</span>
        <span v-for="t in (dialog.crm.tags||[]).slice(0,2)" :key="t.name||t" class="color-chip" :style="tagStyle(meta,t)">{{t.name||t}}</span>
      </div>
    </div>
  </article>
</template>
