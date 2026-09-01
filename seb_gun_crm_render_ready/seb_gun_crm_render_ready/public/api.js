(() => {
  let csrf = '';
  const inflightGet=new Map(),shortCache=new Map();
  async function request(path, options={}) {
    const {timeout=22000,cacheMs=0,staleMs=0,...fetchOptions}=options;
    const method=String(fetchOptions.method||'GET').toUpperCase(),getKey=method==='GET'?String(path):'';
    if(getKey&&cacheMs>0){const row=shortCache.get(getKey);if(row&&row.until>Date.now())return row.data}
    if(getKey&&inflightGet.has(getKey))return inflightGet.get(getKey);
    const run=(async()=>{
    const headers={...(fetchOptions.headers||{})};
    if(fetchOptions.body && !headers['Content-Type']) headers['Content-Type']='application/json';
    if(csrf && !['GET','HEAD'].includes(String(fetchOptions.method||'GET').toUpperCase())) headers['X-CSRF-Token']=csrf;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
    let response;
    try{response=await fetch(path,{credentials:'include',...fetchOptions,headers,signal:controller.signal})}
    catch(e){if(e?.name==='AbortError')throw new Error('Сервер отвечает слишком долго. Попробуйте ещё раз через несколько секунд.');throw e}
    finally{clearTimeout(timer)}
    let data=null;try{data=await response.json()}catch{data={ok:false,message:`HTTP ${response.status}`}}
    if(!response.ok){const e=new Error(data?.message||`HTTP ${response.status}`);e.status=response.status;e.code=data?.error;e.details=data?.details;throw e}
    if(data?.csrf)csrf=data.csrf;if(getKey&&cacheMs>0)shortCache.set(getKey,{data,until:Date.now()+cacheMs,staleUntil:Date.now()+cacheMs+Math.max(0,Number(staleMs||0))});return data;
    })();
    if(getKey)inflightGet.set(getKey,run);
    try{return await run}
    catch(err){
      if(getKey&&staleMs>0){
        const row=shortCache.get(getKey);
        if(row&&Number(row.staleUntil||0)>Date.now()){
          console.warn('[API stale fallback]',path,err?.message||err);
          return {...row.data,_stale:true,_staleReason:String(err?.message||err)};
        }
      }
      throw err;
    }finally{if(getKey&&inflightGet.get(getKey)===run)inflightGet.delete(getKey)}
  }
  function qs(obj){const q=new URLSearchParams();for(const[k,v]of Object.entries(obj||{}))if(v!==''&&v!=null)q.set(k,v);return q.toString()}
  window.BSAPI={
    session:()=>request('/api/session'),
    login:(login,password)=>request('/api/auth/login',{method:'POST',body:JSON.stringify({login,password})}),
    async logout(){const d=await request('/api/auth/logout',{method:'POST',body:'{}'});csrf='';return d},
    meta:()=>request('/api/meta',{cacheMs:60000,staleMs:600000}),
    clients:(p={})=>request(`/api/clients?${qs(p)}`),
    createClient:(p)=>request('/api/clients',{method:'POST',body:JSON.stringify(p),timeout:65000}),
    client:(id,{fresh=false}={})=>request(`/api/clients/${encodeURIComponent(id)}${fresh?'?fresh=1':''}`,{cacheMs:fresh?0:5000}),
    updateClient:(id,p)=>request(`/api/clients/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify(p)}),
    orders:(customerId,{fresh=false,limit=20}={})=>request(`/api/orders?${qs({customerId,fresh:fresh?1:'',limit})}`,{timeout:20000,cacheMs:fresh?0:60000,staleMs:fresh?0:600000}),
    createOrder:(p)=>request('/api/orders',{method:'POST',body:JSON.stringify(p),timeout:45000}),
    services:(p={})=>request(`/api/services?${qs(p)}`,{cacheMs:1800000,staleMs:86400000}),
    reminders:(p={})=>request(`/api/reminders?${qs(p)}`),
    deleteReminder:(id)=>request(`/api/reminders/${encodeURIComponent(id)}`,{method:'DELETE',body:'{}'}),
    quickPhrases:()=>request('/api/quick-phrases',{cacheMs:600000,staleMs:86400000}),
    syncAccountUi:()=>request('/api/account-ui/sync',{method:'POST',body:'{}'}),
    importAccountUi:(html)=>request('/api/account-ui/import',{method:'POST',body:JSON.stringify({html})}),
    vkStatus:()=>request('/api/vk/status'),
    vkDialogs:({count=50,offset=0,filter='all',q='',includeCrm=true}={})=>request(`/api/vk/dialogs?${qs({count,offset,filter,q,crm:includeCrm?1:0})}`),
    vkMessages:(peerId,{count=100,offset=0,includeCrm=true}={})=>request(`/api/vk/dialogs/${encodeURIComponent(peerId)}/messages?${qs({count,offset,crm:includeCrm?1:0})}`),
    transcribeVoice:(peerId,conversationMessageId,audioUrl)=>request('/api/voice/transcribe',{method:'POST',body:JSON.stringify({peerId,conversationMessageId,audioUrl}),timeout:150000}),
    dialogText:(peerId)=>request(`/api/vk/dialogs/${encodeURIComponent(peerId)}/export-text`,{timeout:90000}),
    sendVkMessage:(peerId,{message='',attachment='',stickerId=0,replyTo=0,forwardMessageIds=[]}={})=>request(`/api/vk/dialogs/${encodeURIComponent(peerId)}/messages`,{method:'POST',body:JSON.stringify({message,attachment,stickerId,replyTo,forwardMessageIds})}),
    uploadVkMedia:(payload)=>request('/api/vk/upload',{method:'POST',body:JSON.stringify(payload)}),
    activity:(action,details={})=>request('/api/activity',{method:'POST',body:JSON.stringify({action,details})}),
    createClientFromVk:(peerId,p={})=>request(`/api/vk/dialogs/${encodeURIComponent(peerId)}/create-client`,{method:'POST',body:JSON.stringify(p)}),
    adminOverview:()=>request('/api/admin/overview'),
    adminUsers:()=>request('/api/admin/users'),
    updateAdminUser:(key,p)=>request(`/api/admin/users/${encodeURIComponent(key)}`,{method:'PUT',body:JSON.stringify(p)}),
    adminPhrases:()=>request('/api/admin/phrases'),
    createAdminPhrase:(p)=>request('/api/admin/phrases',{method:'POST',body:JSON.stringify(p)}),
    updateAdminPhrase:(id,p)=>request(`/api/admin/phrases/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify(p)}),
    moveAdminPhrase:(id,p)=>request(`/api/admin/phrases/${encodeURIComponent(id)}/move`,{method:'POST',body:JSON.stringify(p)}),
    deleteAdminPhrase:(id)=>request(`/api/admin/phrases/${encodeURIComponent(id)}`,{method:'DELETE',body:'{}'}),
    health:()=>request('/api/health')
  };
})();