import { defineStore } from 'pinia'
import { api } from '../services/api'

export const useClientsStore = defineStore('clients', {
  state: () => ({
    items: [], loading: false, loadingMore: false, loaded: false, hasMore: false,
    q: '', manager: [], status: [], tag: [], total: 0, generation: 0,
  }),
  actions: {
    async load({ append = false } = {}) {
      const gen = ++this.generation
      const offset = append ? this.items.length : 0
      append ? (this.loadingMore = true) : (this.loading = true)
      try {
        const d = await api.clients({
          limit: 100, offset, q: this.q.trim(), manager: this.manager.join(','), status: this.status.join(','), tag: this.tag.join(','),
        })
        if (gen !== this.generation) return
        const rows = d.clients || []
        if (append) {
          const map = new Map(this.items.map(x => [String(x.id), x]))
          for (const row of rows) map.set(String(row.id), { ...(map.get(String(row.id)) || {}), ...row })
          this.items = [...map.values()]
        } else this.items = rows
        this.total = Number(d.total || d.totalHint || this.items.length)
        this.hasMore = !!d.hasMore
        this.loaded = true
      } finally {
        if (gen === this.generation) { this.loading = false; this.loadingMore = false }
      }
    },
  },
})
