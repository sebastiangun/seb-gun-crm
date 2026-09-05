self.addEventListener('install',()=>self.skipWaiting())
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()))
self.addEventListener('notificationclick',event=>{
  event.notification.close()
  const target=new URL(event.notification.data?.url||'/#/notifications',self.location.origin).href
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true})
    for(const client of windows){
      if('navigate'in client)await client.navigate(target)
      if('focus'in client)return client.focus()
    }
    return self.clients.openWindow(target)
  })())
})
