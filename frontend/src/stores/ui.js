import { defineStore } from 'pinia'

export const useUiStore = defineStore('ui', {
  state: () => ({
    theme: localStorage.getItem('seb-gun-v28-theme') || 'dark',
    toasts: [],
  }),
  actions: {
    applyTheme() {
      document.documentElement.dataset.theme = this.theme
      document.documentElement.style.colorScheme = this.theme
    },
    toggleTheme() {
      this.theme = this.theme === 'dark' ? 'light' : 'dark'
      localStorage.setItem('seb-gun-v28-theme', this.theme)
      this.applyTheme()
    },
    toast(message, type = 'info', timeout = 3200) {
      const id = `${Date.now()}-${Math.random()}`
      this.toasts.push({ id, message: String(message), type })
      setTimeout(() => this.removeToast(id), timeout)
    },
    removeToast(id) { this.toasts = this.toasts.filter(t => t.id !== id) },
  },
})
