import { defineStore } from 'pinia'
import { api } from '../services/api'

function mergeDialogRows(existing, incoming) {
  const map = new Map(existing.map(x => [String(x.peerId), x]))
  for (const row of incoming) map.set(String(row.peerId), { ...(map.get(String(row.peerId)) || {}), ...row })
  return [...map.values()].sort((a, b) => Number(b.lastMessageAt || 0) - Number(a.lastMessageAt || 0))
}

export const useDialogsStore = defineStore('dialogs', {
  state: () => ({
    items: [], total: 0, loadedAll: false, loading: false, loadingMore: false,
    filter: 'all', search: '', manager: [], status: [], generation: 0, pollTimer: null,
    backgroundError: '', nextOffset: 0,
  }),
  getters: {
    filteredItems(state) {
      const managers = new Set(state.manager)
      const statuses = new Set(state.status)
      return state.items.filter(d => {
        if (managers.size && !managers.has(String(d.crm?.manager || d.crm?.managerLogin || ''))) return false
        if (statuses.size && !statuses.has(String(d.crm?.crmStatus || ''))) return false
        return true
      })
    },
  },
  actions: {
    async load({ reset = true, all = true } = {}) {
      const gen = ++this.generation
      if (reset) {
        this.items = []
        this.total = 0
        this.loadedAll = false
        this.backgroundError = ''
        this.nextOffset = 0
      }
      this.loading = true
      try {
        const first = await api.dialogs({ count: 50, offset: 0, filter: this.filter, q: this.search.trim(), crm: 1 })
        if (gen !== this.generation) return
        this.items = first.dialogs || []
        this.total = Number(first.count || this.items.length)
        this.loadedAll = !first.hasMore || !!this.search
        this.nextOffset = this.items.length
        if (all && first.hasMore && !this.search) this.loadRemaining(gen, this.items.length).catch(() => {})
      } finally { if (gen === this.generation) this.loading = false }
    },
    async loadRemaining(gen, offset) {
      if (this.loadingMore) return
      this.loadingMore = true
      try {
        let cursor = offset
        let guard = 0
        while (gen === this.generation && guard++ < 40) {
          let d
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              d = await api.dialogs({ count: 75, offset: cursor, filter: this.filter, crm: 1 })
              break
            } catch (err) {
              if (![0, 502, 503, 504].includes(Number(err?.status || 0)) || attempt === 2) throw err
              await new Promise(r => setTimeout(r, 700 * (attempt + 1)))
            }
          }
          if (gen !== this.generation) return
          const rows = d.dialogs || []
          this.items = mergeDialogRows(this.items, rows)
          this.total = Number(d.count || this.total || this.items.length)
          cursor += rows.length
          this.nextOffset = cursor
          this.backgroundError = ''
          if (!d.hasMore || !rows.length) { this.loadedAll = true; break }
          await new Promise(r => setTimeout(r, 240))
        }
      } catch (err) {
        if (gen === this.generation) this.backgroundError = 'Не все диалоги догрузились'
      } finally { if (gen === this.generation) this.loadingMore = false }
    },
    async resumeRemaining() {
      if (this.loadedAll || this.loadingMore || this.search) return
      this.backgroundError = ''
      await this.loadRemaining(this.generation, this.nextOffset || this.items.length)
    },
    async refreshHead() {
      if (this.search) return
      try {
        const d = await api.dialogs({ count: 50, offset: 0, filter: this.filter, crm: 1 })
        this.items = mergeDialogRows(this.items, d.dialogs || [])
        this.total = Number(d.count || this.total)
      } catch {}
    },
    startPolling() {
      this.stopPolling()
      this.pollTimer = setInterval(() => {
        if (document.visibilityState === 'visible') this.refreshHead()
      }, 30000)
    },
    stopPolling() { if (this.pollTimer) clearInterval(this.pollTimer); this.pollTimer = null },
  },
})
