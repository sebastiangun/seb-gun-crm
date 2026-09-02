import { defineStore } from 'pinia'
import { api, resetCsrf } from '../services/api'

export const useSessionStore = defineStore('session', {
  state: () => ({
    ready: false,
    authenticated: false,
    loginName: '',
    account: null,
    vk: null,
    version: '',
    isAdmin: false,
    loading: false,
  }),
  actions: {
    async bootstrap() {
      this.loading = true
      try {
        const data = await api.session()
        this.setSession(data)
      } catch {
        this.authenticated = false
      } finally {
        this.ready = true
        this.loading = false
      }
    },
    setSession(data) {
      this.authenticated = !!data?.authenticated
      this.loginName = data?.login || ''
      this.account = data?.account || null
      this.vk = data?.vk || null
      this.version = data?.version || ''
      this.isAdmin = !!data?.isAdmin
    },
    async login(login, password) {
      this.loading = true
      try {
        const data = await api.login(login, password)
        this.setSession(data)
        this.authenticated = true
        return data
      } finally { this.loading = false }
    },
    async logout() {
      try { await api.logout() } catch {}
      resetCsrf()
      this.$reset()
      this.ready = true
    },
  },
})
