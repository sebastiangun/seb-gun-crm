<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionStore } from '../stores/session'
import { useUiStore } from '../stores/ui'

const session = useSessionStore()
const ui = useUiStore()
const router = useRouter()
const login = ref(localStorage.getItem('seb-gun-v28-login') || '')
const password = ref('')

async function submit() {
  try {
    await session.login(login.value.trim(), password.value)
    localStorage.setItem('seb-gun-v28-login', login.value.trim())
    password.value = ''
    router.replace('/dialogs')
  } catch (err) { ui.toast(err.message, 'error', 5000) }
}
</script>
<template>
  <main class="login-screen">
    <section class="login-card">
      <div class="brand-mark">SG</div>
      <h1>seb_gun CRM</h1>
      <p>VK Messenger + BlueSales</p>
      <form @submit.prevent="submit">
        <label>Логин BlueSales<input v-model="login" autocomplete="username" required /></label>
        <label>Пароль<input v-model="password" type="password" autocomplete="current-password" required /></label>
        <button class="primary-btn" :disabled="session.loading">{{ session.loading ? 'Подключаем…' : 'Войти' }}</button>
      </form>
      <small>Новый интерфейс v28.2. Старый интерфейс доступен по <a href="/legacy/">/legacy/</a>.</small>
    </section>
  </main>
</template>
