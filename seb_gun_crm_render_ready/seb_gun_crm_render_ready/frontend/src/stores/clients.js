import { defineStore } from 'pinia'
import { api } from '../services/api'

export const useClientsStore = defineStore('clients', {
  state: () => ({ items: [], loading: false, loaded: false, q: '', manager: [], status: [], tag: [], total: 0 }),
  actions: {
    async load() {
      this.loading = true
      try {
        let offset = 0
        let all = []
        let guard = 0
        do {
          const d = await api.clients({ limit: 100, offset, q: this.q.trim(), manager: this.manager.join(','), status: this.status.join(','), tag: this.tag.join(',') })
          all.push(...(d.clients || []))
          offset += (d.clients || []).length
          this.total = Number(d.total || d.totalHint || all.length)
          if (!d.hasMore || !(d.clients || []).length || this.q) break
        } while (++guard < 30)
        this.items = all
        this.loaded = true
      } finally { this.loading = false }
    },
  },
})
