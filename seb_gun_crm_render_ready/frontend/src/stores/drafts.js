import { defineStore } from 'pinia'

const PREFIX = 'seb-gun-v28-drafts:'
function storageKey(login) { return `${PREFIX}${String(login || 'guest').toLowerCase()}` }
function newRequestId() { return crypto.randomUUID?.() || `${Date.now()}-${Math.random()}` }

export const useDraftsStore = defineStore('drafts', {
  state: () => ({ login: '', items: {} }),
  actions: {
    init(login) {
      const next = String(login || 'guest')
      if (this.login === next) return
      this.login = next
      try { this.items = JSON.parse(localStorage.getItem(storageKey(next)) || '{}') || {} } catch { this.items = {} }
    },
    persist() {
      try { localStorage.setItem(storageKey(this.login), JSON.stringify(this.items)) } catch {}
    },
    get(peerId) {
      const key = String(peerId)
      return this.items[key] || { text: '', attachments: [], updatedAt: 0, requestId: '' }
    },
    ensure(peerId) {
      const key = String(peerId)
      if (!this.items[key]) this.items[key] = { text: '', attachments: [], updatedAt: Date.now(), requestId: newRequestId() }
      return this.items[key]
    },
    setText(peerId, text) {
      const d = this.ensure(peerId)
      d.text = String(text ?? '')
      d.updatedAt = Date.now()
      d.requestId = newRequestId()
      this.persist()
    },
    replaceWithPhrase(peerId, { text = '', attachments = [] }) {
      const d = this.ensure(peerId)
      d.text = String(text)
      d.attachments = [...new Set((attachments || []).filter(Boolean))].map(a => typeof a === 'string' ? { attachment: a, name: a, kind: a.split(/\d/)[0] || 'file' } : a)
      d.updatedAt = Date.now()
      d.requestId = newRequestId()
      this.persist()
    },
    addAttachment(peerId, row) {
      const d = this.ensure(peerId)
      if (!d.attachments.some(a => a.attachment === row.attachment)) d.attachments.push(row)
      d.updatedAt = Date.now()
      d.requestId = newRequestId()
      this.persist()
    },
    removeAttachment(peerId, attachment) {
      const d = this.ensure(peerId)
      d.attachments = d.attachments.filter(a => a.attachment !== attachment)
      d.updatedAt = Date.now()
      d.requestId = newRequestId()
      this.persist()
    },
    clear(peerId) {
      delete this.items[String(peerId)]
      this.persist()
    },
    clearIfRequestId(peerId, requestId) {
      const key = String(peerId)
      if (!this.items[key] || this.items[key].requestId !== requestId) return false
      delete this.items[key]
      this.persist()
      return true
    },
    takeForQueue(peerId) {
      const key = String(peerId)
      const row = this.items[key]
      if (!row) return null
      const snapshot = { ...row, attachments: [...(row.attachments || [])] }
      delete this.items[key]
      this.persist()
      return snapshot
    },
  },
})
