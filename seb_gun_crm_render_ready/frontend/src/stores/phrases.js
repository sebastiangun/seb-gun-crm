import { defineStore } from 'pinia'
import { api } from '../services/api'

const CACHE_KEY = 'seb-gun-v28-phrases'
export function normalizePhraseSearch(value) {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}
function searchText(value) { return normalizePhraseSearch(value) }
export const usePhrasesStore = defineStore('phrases', {
  state: () => ({ groups: [], loading: false, loaded: false, query: '', lastId: localStorage.getItem('seb-gun-v28-last-phrase') || '' }),
  getters: {
    all(state) {
      return state.groups.flatMap(g => (g.phrases || []).map(p => ({ ...p, groupName: g.name })))
    },
    filtered() {
      const q = normalizePhraseSearch(this.query)
      if (!q) return this.groups
      const tokens = q.split(/\s+/).filter(Boolean)
      return this.groups.map(g => ({ ...g, phrases: (g.phrases || []).filter(p => {
        const hay = normalizePhraseSearch([g.name,p.name,p.title,p.text,p.phrase,p.hotkey,...(p.managers||[]),...(p.attachments||[])].join(' '))
        return tokens.every(t => hay.includes(t))
      }) })).filter(g => g.phrases.length)
    },
  },
  actions: {
    async load(force = false) {
      if (this.loading || (this.loaded && !force)) return
      this.loading = true
      let hasCache = false
      try {
        const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]')
        if (Array.isArray(cached) && cached.length) { this.groups = cached; this.loaded = true; hasCache = true }
      } catch {}
      try {
        const d = await api.quickPhrases()
        this.groups = d.groups || d.quickPhrases || []
        this.loaded = true
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(this.groups)) } catch {}
      } catch (err) {
        if (hasCache) return
        throw err
      } finally { this.loading = false }
    },
    invalidate() { this.loaded = false; try { localStorage.removeItem(CACHE_KEY) } catch {} },
    remember(id) { this.lastId = String(id); localStorage.setItem('seb-gun-v28-last-phrase', this.lastId) },
  },
})
