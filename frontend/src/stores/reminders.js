import { defineStore } from 'pinia'
import { api } from '../services/api'

export const useRemindersStore = defineStore('reminders', {
  state: () => ({ groups: { today: [], tomorrow: [], future: [], overdue: [] }, clock: null, loading: false, tab: 'today', manager: [], status: [], tag: [] }),
  getters: { current: s => s.groups[s.tab] || [] },
  actions: {
    async load() {
      this.loading = true
      try {
        const d = await api.reminders({ manager: this.manager.join(','), status: this.status.join(','), tag: this.tag.join(',') })
        this.groups = d.reminders || this.groups
        this.clock = d.clock || null
      } finally { this.loading = false }
    },
    async remove(id) { await api.deleteReminder(id); await this.load() },
  },
})
