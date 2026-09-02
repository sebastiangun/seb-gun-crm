const PREFIX = 'seb-gun-v28-route:'
const listRoots = ['/dialogs', '/clients', '/reminders', '/more']

export function rememberListRoute(route) {
  const path = String(route?.path || '')
  const root = listRoots.find(x => path === x)
  if (!root) return
  try { sessionStorage.setItem(PREFIX + root, String(route.fullPath || root)) } catch {}
}

export function rememberedListRoute(path) {
  try { return sessionStorage.getItem(PREFIX + path) || path } catch { return path }
}

export function arrayFromQuery(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(',')
  return [...new Set(values.map(x => String(x).trim()).filter(Boolean))]
}

export function listQuery(values, extra = {}) {
  const query = { ...extra }
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) { if (value.length) query[key] = value.join(',') }
    else if (value !== '' && value !== null && value !== undefined && value !== 'all' && value !== 'today') query[key] = String(value)
  }
  return query
}
