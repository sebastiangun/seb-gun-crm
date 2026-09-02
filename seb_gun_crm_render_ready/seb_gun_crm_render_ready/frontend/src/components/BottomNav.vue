<script setup>
import { useRoute, useRouter } from 'vue-router'
import { rememberedListRoute } from '../utils/navigation'
const route = useRoute()
const router = useRouter()
const items = [
  ['/dialogs', '💬', 'Диалоги'],
  ['/clients', '👥', 'Клиенты'],
  ['/reminders', '⏰', 'Напоминания'],
  ['/more', '☰', 'Ещё'],
]
</script>
<template>
  <nav class="bottom-nav">
    <button v-for="[path, icon, label] in items" :key="path" type="button" :class="{active: route.path.startsWith(path)}" @click="router.push(rememberedListRoute(path))">
      <span>{{ icon }}</span><small>{{ label }}</small>
    </button>
  </nav>
</template>
