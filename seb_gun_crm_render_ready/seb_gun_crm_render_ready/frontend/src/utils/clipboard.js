export async function copyText(text) {
  const value = String(text ?? '')
  if (!value) return false
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch {}
  const area = document.createElement('textarea')
  area.value = value
  area.setAttribute('readonly', '')
  area.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0'
  document.body.appendChild(area)
  area.select()
  area.setSelectionRange(0, value.length)
  let ok = false
  try { ok = document.execCommand('copy') } catch {}
  area.remove()
  if (!ok) window.prompt('Скопируйте текст:', value)
  return ok
}

export function attachmentText(attachments = []) {
  return attachments.map(a => {
    if (a.type === 'audio_message') return a.transcript ? `[Голосовое сообщение: ${a.transcript}]` : '[Голосовое сообщение]'
    if (a.type === 'photo') return '[Фото]'
    if (a.type === 'video') return `[Видео${a.title ? `: ${a.title}` : ''}]`
    if (a.type === 'doc') return `[Файл${a.title ? `: ${a.title}` : ''}]`
    if (a.type === 'sticker') return '[Стикер]'
    return `[${a.title || a.type || 'Вложение'}]`
  }).join(' ')
}

export function messageText(message) {
  return [String(message?.text || '').trim(), attachmentText(message?.attachments || [])].filter(Boolean).join('\n') || '[Пустое сообщение]'
}

export function messageLine(message) {
  const date = new Date(Number(message?.date || 0) * 1000).toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
  const author = message?.displayAuthor || message?.author || (message?.out ? 'Вы' : 'Собеседник')
  return `[${date}] ${author}: ${messageText(message)}`
}
