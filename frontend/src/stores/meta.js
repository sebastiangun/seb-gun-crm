import { defineStore } from 'pinia'
import { api } from '../services/api'

export const useMetaStore = defineStore('meta', {
  state: () => ({ loaded: false, loading: false, users: [], statuses: [], tags: [], colors: {}, capabilities: {} }),
  actions: {
    async load(force = false) {
      if (this.loading || (this.loaded && !force)) return
      this.loading = true
      try {
        const d = await api.meta()
        this.users = d.users || []
        this.statuses = d.statuses || []
        this.tags = d.tags || []
        this.colors = {
          status: d.statusColors || {}, manager: d.managerColors || {}, tag: d.tagColors || {}, tagText: d.tagTextColors || {},
        }
        this.capabilities = d.capabilities || {}
        this.loaded = true
      } finally { this.loading = false }
    },
  },
})
