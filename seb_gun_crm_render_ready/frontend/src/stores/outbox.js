import { defineStore } from 'pinia'
import { api } from '../services/api'

const PREFIX = 'seb-gun-v283-outbox:' // keep v28.3 queues during the upgrade
const RETRY_DELAYS = [0, 3000, 10000, 30000, 60000]
const nowSeconds = () => Math.floor(Date.now() / 1000)
const newId = () => crypto.randomUUID?.() || `out-${Date.now()}-${Math.random().toString(36).slice(2)}`

function storageKey(login) { return `${PREFIX}${String(login || 'guest').toLowerCase()}` }
function publicError(error) { return String(error?.message || error || 'Не удалось отправить сообщение').slice(0, 300) }

export const useOutboxStore = defineStore('outbox', {
  state: () => ({ login: '', items: [], processing: false, timer: null, initialized: false }),
  getters: {
    active: state => state.items.filter(x => ['queued', 'sending', 'error'].includes(x.status)),
    forPeer: state => peerId => state.items.filter(x => String(x.peerId) === String(peerId) && x.status !== 'removed'),
    pendingCount: state => state.items.filter(x => ['queued', 'sending', 'error'].includes(x.status)).length,
  },
  actions: {
    init(login) {
      const next = String(login || 'guest')
      if (this.initialized && this.login === next) return
      this.login = next
      this.initialized = true
      try { this.items = JSON.parse(localStorage.getItem(storageKey(next)) || '[]') || [] } catch { this.items = [] }
      for (const row of this.items) if (row.status === 'sending') row.status = 'queued'
      this.prune()
      this.persist()
      window.addEventListener('online', this.process)
      for (const row of this.active) this.report(row)
      this.process()
    },
    report(row, status = row?.status) {
      if (!row) return
      api.outboxEvent({ requestId: row.clientRequestId || row.localId, peerId: row.peerId, peerName: row.peerName, text: row.text, status, attempts: row.attempts, error: row.error, createdAt: row.createdAt }).catch(() => {})
    },
    persist() {
      try { localStorage.setItem(storageKey(this.login), JSON.stringify(this.items)) } catch {}
    },
    prune() {
      const cutoff = Date.now() - 24 * 60 * 60 * 1000
      this.items = this.items.filter(x => x.status !== 'removed' && !(x.status === 'sent' && Number(x.updatedAt || 0) < cutoff))
    },
    enqueue({ peerId, peerName = '', text = '', attachments = [], replyTo = 0, forwardMessageIds = [] }) {
      const row = {
        localId: newId(), clientRequestId: newId(), peerId: Number(peerId), peerName: String(peerName || ''),
        text: String(text || ''), attachments: [...attachments], replyTo: Number(replyTo || 0),
        forwardMessageIds: [...forwardMessageIds].map(Number).filter(Boolean), status: 'queued', attempts: 0,
        error: '', createdAt: Date.now(), updatedAt: Date.now(), nextAttemptAt: 0, messageId: 0, alerted: false,
      }
      this.items.push(row)
      this.persist()
      this.report(row)
      this.process()
      return row
    },
    async process() {
      if (this.processing || !this.initialized || !navigator.onLine) return
      this.processing = true
      try {
        while (true) {
          const row = this.items.find(x => x.status === 'queued' && Number(x.nextAttemptAt || 0) <= Date.now())
          if (!row) break
          row.status = 'sending'; row.attempts++; row.updatedAt = Date.now(); this.persist(); this.report(row)
          try {
            const attachment = row.attachments.map(a => a.attachment || a).filter(Boolean).join(',')
            const result = await api.sendMessage(row.peerId, {
              message: row.text, attachment, replyTo: row.replyTo,
              forwardMessageIds: row.forwardMessageIds, clientRequestId: row.clientRequestId,
            })
            row.status = 'sent'; row.messageId = Number(result?.messageId || 0); row.error = ''; row.updatedAt = Date.now()
            this.report(row)
            window.dispatchEvent(new CustomEvent('crm:outbox-sent', { detail: { ...row } }))
          } catch (error) {
            row.error = publicError(error); row.updatedAt = Date.now()
            const retryable = !error?.status || error.status >= 500 || error.code === 'TIMEOUT'
            if (retryable && row.attempts < RETRY_DELAYS.length) {
              row.status = 'queued'; row.nextAttemptAt = Date.now() + RETRY_DELAYS[row.attempts]
              this.schedule()
            } else row.status = 'error'
            this.report(row)
            if (!row.alerted && row.attempts >= 2) {
              row.alerted = true
              api.queueAlert({ peerId: row.peerId, peerName: row.peerName, requestId: row.clientRequestId, error: row.error, attempts: row.attempts }).catch(() => {})
            }
          }
          this.persist()
        }
      } finally { this.processing = false; this.schedule() }
    },
    schedule() {
      clearTimeout(this.timer)
      const times = this.items.filter(x => x.status === 'queued').map(x => Number(x.nextAttemptAt || 0)).filter(Boolean)
      if (!times.length) return
      this.timer = setTimeout(() => this.process(), Math.max(250, Math.min(...times) - Date.now()))
    },
    retry(localId) {
      const row = this.items.find(x => x.localId === localId)
      if (!row || row.status === 'sending') return
      row.status = 'queued'; row.error = ''; row.nextAttemptAt = 0; row.alerted = false; row.updatedAt = Date.now()
      this.persist(); this.report(row); this.process()
    },
    remove(localId) {
      const row = this.items.find(x => x.localId === localId)
      if (!row || row.status === 'sending') return false
      this.report(row, 'removed')
      this.items = this.items.filter(x => x.localId !== localId)
      this.persist(); return true
    },
    optimisticMessage(row) {
      return {
        id: row.messageId || `local:${row.localId}`, conversationMessageId: 0, localId: row.localId,
        date: Math.floor(Number(row.createdAt || Date.now()) / 1000) || nowSeconds(), out: true,
        text: row.text, attachments: row.attachments.map(a => ({ ...a, type: a.type || a.kind || 'doc' })),
        pendingStatus: row.status, pendingError: row.error, messageId: row.messageId,
      }
    },
  },
})
