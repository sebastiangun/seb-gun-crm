const fallbackStatusColors = {
  'Не учитывать в лидах':'#848B8C','Вступил в группу':'#3B3B3B','Запустил воронку':'#3B3B3B','Заявка':'#0165B0',
  'Диагностика':'#FF99CC','Отправлен урок':'#008000','Рассказ про курс':'#FF9900','Цена озвучена':'#FF9900',
  'Принимает решение':'#FF9900','Оплатил':'#0165B0','Допродажа':'#008000','Отказ':'#FF003A',
  'Черный список':'#000000','Работа с игнором':'#848B8C','Отложил покупку':'#FF99CC',
}
const fallbackManagerColors = {
  '0.0 Даша Алексеева':'#737373','Даша Алексеева':'#737373','0.1 Расиль М.':'#86BA67','Расиль М.':'#86BA67',
  '0.1 Гульназ У':'#FF9BA9','Гульназ У':'#FF9BA9','0.2 Юлия':'#B80206','Юлия':'#B80206',
  '0.1 Ильгиз Ш.':'#00A83B','Ильгиз Ш.':'#00A83B','0.1 Сергей К.':'#5319e7','Сергей К.':'#5319e7',
}

function validColor(value) {
  const v = String(value || '').trim()
  return /^#[0-9a-f]{3,8}$/i.test(v) || /^rgba?\(/i.test(v) || /^hsla?\(/i.test(v) ? v : ''
}
export function textOnColor(color = '') {
  const v = validColor(color)
  const m = v.match(/^#([0-9a-f]{6})/i)
  if (!m) return '#fff'
  const n = Number.parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return (.299*r + .587*g + .114*b) > 155 ? '#111' : '#fff'
}
export function statusStyle(meta, name, explicit = '') {
  const color = validColor(explicit) || validColor(meta?.colors?.status?.[name]) || fallbackStatusColors[name] || '#2B638C'
  return { '--chip-bg': color, '--chip-text': textOnColor(color) }
}
export function managerStyle(meta, name, explicit = '') {
  const color = validColor(explicit) || validColor(meta?.colors?.manager?.[name]) || fallbackManagerColors[name] || '#737373'
  return { '--chip-bg': color, '--chip-text': textOnColor(color) }
}
export function tagStyle(meta, tag) {
  const name = tag?.name || tag || ''
  const color = validColor(tag?.color) || validColor(meta?.colors?.tag?.[name]) || '#dce9e2'
  const explicit = String(tag?.textColor || meta?.colors?.tagText?.[name] || '').toLowerCase()
  return { '--chip-bg': color, '--chip-text': explicit === 'black' ? '#111' : explicit === 'white' ? '#fff' : textOnColor(color) }
}
