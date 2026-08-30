(() => {
  let csrf = '';
  async function request(path, options={}) {
    const headers={...(options.headers||{})};
    if(options.body && !headers['Content-Type']) headers['Content-Type']='application/json';
    if(csrf && !['GET','HEAD'].includes(String(options.method||'GET').toUpperCase())) headers['X-CSRF-Token']=csrf;
    const response=await fetch(path,{credentials:'include',...options,headers});
    let data=null;try{data=await response.json()}catch{data={ok:false,message:`HTTP ${response.status}`}}
    if(!response.ok){const e=new Error(data?.message||`HTTP ${response.status}`);e.status=response.status;e.code=data?.error;e.details=data?.details;throw e}
    if(data?.csrf)csrf=data.csrf;return data;
  }
  function qs(obj){const q=new URLSearchParams();for(const[k,v]of Object.entries(obj||{}))if(v!==''&&v!=null)q.set(k,v);return q.toString()}
  window.BSAPI={
    session:()=>request('/api/session'),
    login:(login,password)=>request('/api/auth/login',{method:'POST',body:JSON.stringify({login,password})}),
    async logout(){const d=await request('/api/auth/logout',{method:'POST',body:'{}'});csrf='';return d},
    meta:()=>request('/api/meta'),
    clients:(p={})=>request(`/api/clients?${qs(p)}`),
    createClient:(p)=>request('/api/clients',{method:'POST',body:JSON.stringify(p)}),
    client:(id,{fresh=false}={})=>request(`/api/clients/${encodeURIComponent(id)}${fresh?'?fresh=1':''}`),
    updateClient:(id,p)=>request(`/api/clients/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify(p)}),
    orders:(customerId)=>request(`/api/orders${customerId?`?customerId=${encodeURIComponent(customerId)}`:''}`),
    createOrder:(p)=>request('/api/orders',{method:'POST',body:JSON.stringify(p)}),
    services:(p={})=>request(`/api/services?${qs(p)}`),
    reminders:(p={})=>request(`/api/reminders?${qs(p)}`),
    deleteReminder:(id)=>request(`/api/reminders/${encodeURIComponent(id)}`,{method:'DELETE',body:'{}'}),
    quickPhrases:()=>request('/api/quick-phrases'),
    syncAccountUi:()=>request('/api/account-ui/sync',{method:'POST',body:'{}'}),
    importAccountUi:(html)=>request('/api/account-ui/import',{method:'POST',body:JSON.stringify({html})}),
    vkStatus:()=>request('/api/vk/status'),
    vkDialogs:({count=50,offset=0,filter='all',q=''}={})=>request(`/api/vk/dialogs?${qs({count,offset,filter,q})}`),
    vkMessages:(peerId,{count=100,offset=0}={})=>request(`/api/vk/dialogs/${encodeURIComponent(peerId)}/messages?${qs({count,offset})}`),
    sendVkMessage:(peerId,{message='',attachment='',stickerId=0}={})=>request(`/api/vk/dialogs/${encodeURIComponent(peerId)}/messages`,{method:'POST',body:JSON.stringify({message,attachment,stickerId})}),
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