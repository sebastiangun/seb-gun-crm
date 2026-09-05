import { defineStore } from 'pinia'
import { api } from '../services/api'

const ENABLED_KEY='seb-gun-v2811-browser-alerts'
const SEEN_KEY='seb-gun-v2811-browser-alerts-seen'
const POLL_MS=60_000

function readSeen(){try{return JSON.parse(localStorage.getItem(SEEN_KEY)||'{}')||{}}catch{return{}}}
function writeSeen(value){try{localStorage.setItem(SEEN_KEY,JSON.stringify(value))}catch{}}
function rowKey(row){return `${Number(row?.peerId||0)}:${Number(row?.since||0)}:${String(row?.snippet||'').slice(0,80)}`}

export const useBrowserNotificationsStore=defineStore('browserNotifications',{
  state:()=>({
    supported:typeof window!=='undefined'&&'Notification'in window&&'serviceWorker'in navigator,
    permission:typeof Notification!=='undefined'?Notification.permission:'unsupported',
    enabled:typeof localStorage!=='undefined'&&localStorage.getItem(ENABLED_KEY)==='1',
    checking:false,
    lastCheckAt:0,
    lastError:'',
    timer:0,
  }),
  actions:{
    async register(){
      if(!this.supported)return null
      return navigator.serviceWorker.register('/sw.js',{scope:'/'})
    },
    async enable(){
      if(!this.supported)throw new Error('Этот браузер не поддерживает системные уведомления')
      await this.register()
      const permission=await Notification.requestPermission();this.permission=permission
      if(permission!=='granted')throw new Error('Разрешите уведомления для сайта в настройках браузера')
      this.enabled=true;localStorage.setItem(ENABLED_KEY,'1');this.start();await this.check(true);return true
    },
    disable(){this.enabled=false;localStorage.setItem(ENABLED_KEY,'0');this.stop()},
    async show(title,body,data={}){
      if(!this.supported||this.permission!=='granted')return false
      const registration=await navigator.serviceWorker.ready
      await registration.showNotification(title,{body,icon:'/icon.svg',badge:'/icon.svg',tag:data.tag||`crm-${Date.now()}`,renotify:false,data:{url:data.url||'/#/notifications'}})
      return true
    },
    async test(){
      if(!this.enabled||this.permission!=='granted')await this.enable()
      return this.show('seb_gun CRM','Браузерные уведомления работают',{tag:'crm-browser-test'})
    },
    async check(force=false){
      if(!this.enabled||this.permission!=='granted'||this.checking)return
      this.checking=true
      try{
        const data=await api.notificationOverview(),seen=readSeen(),now=Date.now(),cutoff=now-14*24*60*60*1000
        for(const [key,at] of Object.entries(seen))if(Number(at)<cutoff)delete seen[key]
        for(const row of (data.dialogs||[]).filter(item=>item.status!=='answered'&&item.notificationDue)){
          const key=rowKey(row);if(seen[key]&&!force)continue
          const manager=row.manager||'Менеджер не назначен',status=row.crmStatus?` · ${row.crmStatus}`:''
          await this.show(`Нужно ответить: ${row.name}`,`Менеджер лида: ${manager}${status}\nБез ответа: ${row.workingWaitMinutes||row.waitMinutes||0} рабочих минут\n${row.snippet||'Входящее сообщение'}`,{tag:`crm-unanswered-${row.peerId}-${row.since||0}`,url:`/#/dialogs/${row.peerId}`})
          seen[key]=now
        }
        writeSeen(seen);this.lastCheckAt=now;this.lastError=''
      }catch(error){this.lastError=String(error?.message||error)}finally{this.checking=false}
    },
    start(){
      if(!this.enabled||!this.supported||this.permission!=='granted'||this.timer)return
      this.register().catch(()=>{});this.check();this.timer=window.setInterval(()=>this.check(),POLL_MS)
    },
    stop(){if(this.timer){clearInterval(this.timer);this.timer=0}},
  },
})
