let csrf = ''
const inflight = new Map()

export class ApiError extends Error {
  constructor(message, { status = 0, code = '', details = null } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

function query(params = {}) {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return
    q.set(k, String(v))
  })
  return q.toString()
}

async function request(path, options = {}) {
  const {
    method = 'GET',
    body,
    headers: customHeaders = {},
    timeout = 35000,
    dedupe = method === 'GET',
    raw = false,
  } = options

  const key = dedupe && method === 'GET' ? path : ''
  if (key && inflight.has(key)) return inflight.get(key)

  const job = (async () => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)
    const headers = { ...customHeaders }
    let payload = body

    if (body !== undefined && body !== null && !(body instanceof Blob) && !(body instanceof FormData) && typeof body !== 'string') {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json'
      payload = JSON.stringify(body)
    }
    if (typeof body === 'string' && !headers['Content-Type']) headers['Content-Type'] = 'application/json'
    if (csrf && !['GET', 'HEAD'].includes(method.toUpperCase())) headers['X-CSRF-Token'] = csrf

    try {
      const response = await fetch(path, {
        credentials: 'include',
        method,
        body: payload,
        headers,
        signal: controller.signal,
      })
      if (raw) {
        if (!response.ok) throw new ApiError(`HTTP ${response.status}`, { status: response.status })
        return response
      }
      let data
      try { data = await response.json() } catch { data = { ok: false, message: `HTTP ${response.status}` } }
      if (!response.ok) {
        if (response.status === 401 && data?.error === 'AUTH_REQUIRED') {
          window.dispatchEvent(new CustomEvent('crm:auth-expired'))
        }
        throw new ApiError(data?.message || `HTTP ${response.status}`, {
          status: response.status,
          code: data?.error || '',
          details: data?.details,
        })
      }
      if (data?.csrf) csrf = data.csrf
      return data
    } catch (err) {
      if (err?.name === 'AbortError') throw new ApiError('Сервер отвечает слишком долго. Повторите действие.', { code: 'TIMEOUT' })
      throw err
    } finally {
      clearTimeout(timer)
    }
  })()

  if (key) inflight.set(key, job)
  try { return await job } finally { if (key && inflight.get(key) === job) inflight.delete(key) }
}

export const api = {
  session: () => request('/api/session', { timeout: 60000 }),
  login: async (login, password) => {
    const data = await request('/api/auth/login', { method: 'POST', body: { login, password }, timeout: 60000 })
    csrf = data.csrf || csrf
    return data
  },
  logout: () => request('/api/auth/logout', { method: 'POST', body: '{}' }),
  health: () => request('/api/health'),
  meta: () => request('/api/meta', { timeout: 40000 }),
  dialogs: (params = {}) => request(`/api/vk/dialogs?${query(params)}`, { timeout: 45000, dedupe: false }),
  messages: (peerId, params = {}) => request(`/api/vk/dialogs/${encodeURIComponent(peerId)}/messages?${query(params)}`, { timeout: 45000, dedupe: false }),
  sendMessage: (peerId, payload) => request(`/api/vk/dialogs/${encodeURIComponent(peerId)}/messages`, { method: 'POST', body: payload, timeout: 50000 }),
  quickPhrases: () => request('/api/quick-phrases', { timeout: 20000 }),
  clients: (params = {}) => request(`/api/clients?${query(params)}`, { timeout: 45000, dedupe: false }),
  client: (id, fresh = false) => request(`/api/clients/${encodeURIComponent(id)}${fresh ? '?fresh=1' : ''}`, { timeout: 35000, dedupe: false }),
  updateClient: (id, payload) => request(`/api/clients/${encodeURIComponent(id)}`, { method: 'PUT', body: payload, timeout: 45000 }),
  createClientFromVk: (peerId, payload = {}) => request(`/api/vk/dialogs/${encodeURIComponent(peerId)}/create-client`, { method: 'POST', body: payload, timeout: 50000 }),
  reminders: (params = {}) => request(`/api/reminders?${query(params)}`, { timeout: 60000, dedupe: false }),
  deleteReminder: (id) => request(`/api/reminders/${encodeURIComponent(id)}`, { method: 'DELETE', body: '{}', timeout: 40000 }),
  services: (params = {}) => request(`/api/services?${query(params)}`, { timeout: 25000 }),
  orders: (customerId, fresh = false) => request(`/api/orders?${query({ customerId, fresh: fresh ? 1 : '', limit: 30 })}`, { timeout: 30000, dedupe: false }),
  transcribe: (peerId, conversationMessageId, audioUrl) => request('/api/voice/transcribe', {
    method: 'POST', body: { peerId, conversationMessageId, audioUrl }, timeout: 30000,
  }),
  transcriptStatus: (peerId, conversationMessageId) => request(`/api/voice/transcribe/status?${query({ peerId, conversationMessageId })}`, { timeout: 15000, dedupe: false }),
  uploadFile: (peerId, type, file) => request(`/api/vk/upload?${query({ binary: 1, peerId, type, filename: file?.name || 'file' })}`, {
    method: 'POST', body: file, timeout: 120000,
    headers: { 'Content-Type': file?.type || 'application/octet-stream', 'X-Upload-Mime': file?.type || '' },
  }),
  notificationSettings: () => request('/api/notifications/settings'),
  saveNotificationSettings: (payload) => request('/api/notifications/settings', { method: 'POST', body: payload }),
  pairTelegram: (manager) => request('/api/notifications/pair', { method: 'POST', body: { manager } }),
  testTelegram: (manager) => request('/api/notifications/test', { method: 'POST', body: { manager } }),
  checkNotifications: () => request('/api/notifications/check-now', { method: 'POST', body: '{}', timeout: 65000 }),
  // Images do not need CORS permission to render. Loading them directly avoids
  // routing every avatar/photo through a sleeping Render instance and removes
  // the recurring /api/media 502/424 failures from ordinary chat rendering.
  imageUrl: (url) => {
    try { const parsed = new URL(String(url || '')); return parsed.protocol === 'https:' ? parsed.href : '' } catch { return '' }
  },
  mediaUrl: (url) => url ? `/api/media?${query({ url })}` : '',
  voiceUrl: (url) => url ? `/api/voice/audio?${query({ url })}` : '',
  voicePlaybackUrl: (url) => url ? `/api/voice/playback?${query({ url })}` : '',
}

export function resetCsrf() { csrf = '' }
