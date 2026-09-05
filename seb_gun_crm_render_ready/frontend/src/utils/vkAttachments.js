export const VK_ATTACHMENT_TYPES = [
  {id:'photo',label:'Фото',icon:'🖼️',example:'https://vk.com/photo-25869828_457438050'},
  {id:'video',label:'Видео',icon:'🎬',example:'https://vk.com/video-103605906_456244025'},
  {id:'audio_message',label:'Голосовое',icon:'🎙️',example:'audmsg3138382_659705573'},
  {id:'audio',label:'Аудио',icon:'🎵',example:'audio3138382_456239028'},
  {id:'doc',label:'Документ',icon:'📄',example:'https://vk.com/doc-86155313_456239347'},
  {id:'market',label:'Товар',icon:'🛍️',example:'market-60034303_7804451'},
  {id:'wall',label:'Запись',icon:'🧱',example:'https://vk.com/wall-86155313_914'}
]

function readable(value){let text=String(value||'').trim();for(let i=0;i<2;i++){try{const decoded=decodeURIComponent(text);if(decoded===text)break;text=decoded}catch{break}}return text.replace(/&amp;/gi,'&')}
export function normalizeVkAttachment(value,expectedType=''){
  const text=readable(value).replace(/[\[\]]/g,' ')
  const re=/(photo|video|audio_message|audmsg|audio|doc|market|wall)\s*(-?\d+)_(\d+)(?:_([A-Za-z0-9]+))?/gi
  let m
  while((m=re.exec(text))){const type=m[1].toLowerCase()==='audmsg'?'audio_message':m[1].toLowerCase();if(expectedType&&type!==expectedType)continue;return `${type}${m[2]}_${m[3]}${m[4]?`_${m[4]}`:''}`}
  return ''
}
export function attachmentMeta(token){return VK_ATTACHMENT_TYPES.find(x=>String(token).startsWith(x.id))||{icon:'📎',label:'Вложение'}}
