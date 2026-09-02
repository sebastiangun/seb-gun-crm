import { defineStore } from 'pinia'
import { api } from '../services/api'
import { useDraftsStore } from './drafts'

function msgKey(m) { return String(m.id || m.conversationMessageId || '') }
function sortMessages(rows) { return [...rows].sort((a, b) => Number(a.date || 0) - Number(b.date || 0) || Number(a.conversationMessageId || 0) - Number(b.conversationMessageId || 0)) }

export const useChatStore = defineStore('chat', {
  state: () => ({
    peerId: 0, peer: null, crm: null, messages: [], total: 0,
    loading: false, loadingOlder: false, sending: false, uploading: false,
    pollTimer: null, generation: 0, replyTo: null,
    forceBottomToken: 0, newMessageCount: 0,
    transcriptJobs: {},
  }),
  getters: { hasOlder: s => s.messages.length < s.total },
  actions: {
    async open(peerId) {
      const id = Number(peerId)
      if (!id) return
      const gen = ++this.generation
      this.peerId = id
      this.loading = true
      this.messages = []
      this.total = 0
      this.peer = null
      this.crm = null
      this.replyTo = null
      try {
        const d = await api.messages(id, { count: 100, offset: 0, crm: 1 })
        if (gen !== this.generation) return
        this.peer = d.peer
        this.crm = d.crm
        this.messages = d.messages || []
        this.total = Number(d.total || this.messages.length)
        this.forceBottomToken++
      } finally { if (gen === this.generation) this.loading = false }
      this.startPolling()
    },
    close() { this.stopPolling(); this.generation++; this.peerId = 0; this.peer = null; this.crm = null; this.messages = [] },
    async loadOlder() {
      if (!this.peerId || this.loadingOlder || !this.hasOlder) return 0
      this.loadingOlder = true
      try {
        const d = await api.messages(this.peerId, { count: 100, offset: this.messages.length, crm: 0 })
        const rows = d.messages || []
        const map = new Map(this.messages.map(m => [msgKey(m), m]))
        for (const m of rows) if (!map.has(msgKey(m))) map.set(msgKey(m), m)
        this.messages = sortMessages([...map.values()])
        this.total = Number(d.total || this.total)
        return rows.length
      } finally { this.loadingOlder = false }
    },
    async refreshLatest() {
      if (!this.peerId || this.sending) return
      const id = this.peerId
      try {
        const d = await api.messages(id, { count: 100, offset: 0, crm: 0 })
        if (id !== this.peerId) return
        const oldMap = new Map(this.messages.map(m => [msgKey(m), m]))
        let added = 0
        for (const row of d.messages || []) {
          const key = msgKey(row)
          if (!oldMap.has(key)) added++
          oldMap.set(key, { ...(oldMap.get(key) || {}), ...row })
        }
        this.messages = sortMessages([...oldMap.values()])
        this.total = Number(d.total || this.total)
        if (added) this.newMessageCount += added
      } catch {}
    },
    startPolling() {
      this.stopPolling()
      this.pollTimer = setInterval(() => {
        if (document.visibilityState === 'visible') this.refreshLatest()
      }, 20000)
    },
    stopPolling() { if (this.pollTimer) clearInterval(this.pollTimer); this.pollTimer = null },
    async send() {
      const drafts = useDraftsStore()
      const draft = drafts.get(this.peerId)
      if (this.sending || (!draft.text.trim() && !draft.attachments.length)) return
      this.sending = true
      try {
        const attachment = draft.attachments.map(a => a.attachment || a).filter(Boolean).join(',')
        const clientRequestId = draft.requestId || (crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`)
        await api.sendMessage(this.peerId, {
          message: draft.text,
          attachment,
          replyTo: this.replyTo?.conversationMessageId || 0,
          clientRequestId,
        })
        // Do not erase text typed while this request was in flight.
        drafts.clearIfRequestId(this.peerId, clientRequestId)
        this.replyTo = null
        await this.refreshLatest()
        this.forceBottomToken++
        this.newMessageCount = 0
      } finally { this.sending = false }
    },
    async upload(type, file) {
      if (!file || !this.peerId) return
      this.uploading = true
      try {
        const result = await api.uploadFile(this.peerId, type, file)
        useDraftsStore().addAttachment(this.peerId, {
          attachment: result.attachment,
          kind: result.kind || type,
          name: file.name || type,
          size: file.size || 0,
          fallback: !!result.fallback,
        })
        return result
      } finally { this.uploading = false }
    },
    async transcribe(message) {
      const voice = (message.attachments || []).find(a => a.type === 'audio_message')
      if (!voice?.url || !message.conversationMessageId) return
      const key = msgKey(message)
      this.transcriptJobs[key] = { status: 'queued', error: '' }
      try {
        const start = await api.transcribe(this.peerId, message.conversationMessageId, voice.url)
        if (start?.transcript) {
          voice.transcript = start.transcript
          this.transcriptJobs[key] = { status: 'done' }
          return
        }
        for (let i = 0; i < 35; i++) {
          await new Promise(r => setTimeout(r, 1800))
          const st = await api.transcriptStatus(this.peerId, message.conversationMessageId)
          this.transcriptJobs[key] = { status: st.status, error: st.error || '' }
          if (st.status === 'done') { voice.transcript = st.transcript || ''; return }
          if (st.status === 'error') throw new Error(st.error || 'Ошибка расшифровки')
        }
        throw new Error('Расшифровка занимает слишком много времени')
      } catch (err) {
        this.transcriptJobs[key] = { status: 'error', error: err.message }
        throw err
      }
    },
  },
})
