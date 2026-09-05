// Open the CURRENT CRM as an administrator, then run in browser DevTools Console.
// Read-only. Downloads the current journal and Telegram rules to this computer.
(async()=>{
 const get=async url=>{const r=await fetch(url,{credentials:'same-origin',cache:'no-store'});const data=await r.json();if(!r.ok||data.ok===false)throw new Error(data.message||url);return data;};
 const session=await get('/api/session');if(!session.isAdmin)throw new Error('Войдите в CRM как администратор');
 const [journal,settings,exported]=await Promise.all([get('/api/admin/notification-journal'),get('/api/notifications/settings'),get('/api/admin/notification-rules-export')]);
 if(!Array.isArray(journal.rows)||!Array.isArray(settings.rules))throw new Error('Неожиданный формат ответа — экспорт остановлен');
 const connected=JSON.parse(exported.value||'[]');
 const rules=settings.rules.map(r=>({...r,...(connected.find(x=>x.manager===r.manager)||{})}));
 const store={version:3,rules,journal:Object.fromEntries(journal.rows.map(r=>[r.id,r])),pairCodes:{},notified:{},outbox:{},deletedJournal:{},updatedAt:Date.now()};
 const url=URL.createObjectURL(new Blob([JSON.stringify(store,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='notification-settings.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
 console.info(`Экспортировано: ${journal.rows.length} записей, ${rules.length} правил. Исходящая очередь и удалённые записи в этот экспорт не входят.`);
})().catch(e=>console.error('Экспорт не выполнен:',e.message));
