import { defineStore } from 'pinia'
import { api } from '../services/api'

const ENABLED_KEY='seb-gun-v2819-browser-alerts'
const POLL_MS=60_000

function titleFor(row={}){
  if(row.eventType==='sla_violation')return `Нарушен регламент: ${row.clientName||'клиент'}`
  if(row.eventType==='outbox_stuck')return `Сообщение зависло: ${row.clientName||'клиент'}`
  return `Нужно ответить: ${row.clientName||'клиент'}`
}
function bodyFor(row={}){
  const manager=row.leadManager||'Менеджер не назначен',status=row.crmStatus?` · ${row.crmStatus}`:''
  if(row.eventType==='outbox_stuck')return `Менеджер лида: ${manager}${status}\nИсходящее сообщение не отправлено.\n${row.snippet||''}`
  if(row.eventType==='sla_violation')return `Менеджер: ${manager}${status}\nНарушено время ответа.\n${row.snippet||''}`
  return `Менеджер: ${manager}${status}\nПора ответить клиенту.\n${row.snippet||''}`
}

export const useBrowserNotificationsStore=defineStore('browserNotifications',{
  state:()=>({
    supported:typeof window!=='undefined'&&'Notification'in window&&'serviceWorker'in navigator,
    permission:typeof Notification!=='undefined'?Notification.permission:'unsupported',
    enabled:typeof localStorage!=='undefined'&&localStorage.getItem(ENABLED_KEY)==='1',
    checking:false,lastCheckAt:0,lastError:'',timer:0,
  }),
  actions:{
    async register(){if(!this.supported)return null;return navigator.serviceWorker.register('/sw.js',{scope:'/'})},
    async enable(){
      if(!this.supported)throw new Error('Этот браузер не поддерживает системные уведомления')
      await this.register();const permission=await Notification.requestPermission();this.permission=permission
      if(permission!=='granted')throw new Error('Разрешите уведомления для сайта в настройках браузера')
      this.enabled=true;localStorage.setItem(ENABLED_KEY,'1');this.start(false);return true
    },
    disable(){this.enabled=false;localStorage.setItem(ENABLED_KEY,'0');this.stop()},
    async show(title,body,data={}){
      if(!this.supported||this.permission!=='granted')return false
      const registration=await navigator.serviceWorker.ready
      await registration.showNotification(title,{body,icon:'/icon.svg',badge:'/icon.svg',tag:data.tag||`crm-${Date.now()}`,renotify:false,data:{url:data.url||'/#/notification-history'}})
      return true
    },
    async test(){if(!this.enabled||this.permission!=='granted')await this.enable();return this.show('seb_gun CRM','Браузерные уведомления работают',{tag:'crm-browser-test'})},
    async check(){
      if(!this.enabled||this.permission!=='granted'||this.checking)return
      this.checking=true
      try{
        const data=await api.browserPendingNotifications()
        for(const row of (data.rows||[])){
          try{
            const shown=await this.show(titleFor(row),bodyFor(row),{tag:`crm-${row.id}`,url:row.peerId?`/#/dialogs/${row.peerId}`:'/#/notification-history'})
            await api.browserDelivery(row.id,shown?'sent':'failed',shown?'':'Браузер не показал уведомление')
          }catch(error){await api.browserDelivery(row.id,this.permission==='denied'?'blocked':'failed',String(error?.message||error)).catch(()=>{})}
        }
        this.lastCheckAt=Date.now();this.lastError=''
      }catch(error){this.lastError=String(error?.message||error)}finally{this.checking=false}
    },
    start(immediate=true){if(!this.enabled||!this.supported||this.permission!=='granted'||this.timer)return;this.register().catch(()=>{});if(immediate)this.check();this.timer=window.setInterval(()=>this.check(),POLL_MS)},
    stop(){if(this.timer){clearInterval(this.timer);this.timer=0}},
  },
})
