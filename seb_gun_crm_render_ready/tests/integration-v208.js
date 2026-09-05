'use strict';
const http=require('http');
const {spawn}=require('child_process');
const path=require('path');

function listen(server){return new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',()=>resolve(server.address().port)).once('error',reject));}
function json(res,obj,status=200){res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(obj));}
function readBody(req){return new Promise(resolve=>{let b='';req.on('data',c=>b+=c);req.on('end',()=>resolve(b));});}

(async()=>{
 let lastOrderPayload=null;
 const bsApi=http.createServer(async(req,res)=>{
   const u=new URL(req.url,'http://127.0.0.1');
   const cmd=u.searchParams.get('command');
   const raw=await readBody(req); let body=null;try{body=JSON.parse(raw)}catch{}
   if(cmd==='users.get') return json(res,[{id:1,name:'0.0 Даша Алексеева',login:'dasha@example.com'}]);
   if(cmd==='customers.get') return json(res,{count:1,notReturnedCount:0,customers:[{id:101,fullName:'Тестовый клиент',vk:{id:'123'},crmStatus:{name:'Заявка',color:'#2B638C'},manager:{name:'0.0 Даша Алексеева',login:'dasha@example.com'}}]});
   if(cmd==='orders.get') return json(res,{count:0,notReturnedCount:0,orders:[]});
   if(cmd==='orders.add'){lastOrderPayload=body;return json(res,{id:501,customer:{id:body?.customer?.id},orderStatus:body?.orderStatus,manager:body?.manager,sum:body?.sum||0,prepay:body?.prepay||0});}
   if(cmd==='customers.update') return json(res,{isValid:true});
   return json(res,{isValid:false,error:`unknown ${cmd}`});
 });
 const bsApiPort=await listen(bsApi);

 let webBusy=0;
 const bsWeb=http.createServer(async(req,res)=>{
   const u=new URL(req.url,'http://127.0.0.1');
   if(u.pathname==='/app/Login.aspx'&&req.method==='GET')return res.end('<form action="/app/Login.aspx" method="post"><input name="login" type="email"><input name="password" type="password"><button name="enter" value="Войти">Войти</button></form>');
   if(u.pathname==='/app/Login.aspx'&&req.method==='POST'){
     webBusy++;
     if(webBusy===1)return res.end('<div>Другой пользователь находится онлайн под логином dasha@example.com. Вы сможете войти в систему через 1 сек.</div><form action="/app/Login.aspx" method="post"><input name="login" type="email"><input name="password" type="password"></form>');
     res.statusCode=302;res.setHeader('Set-Cookie','sid=ok; Path=/');res.setHeader('Location','/app/');return res.end();
   }
   if(['/app/','/app/Customers/','/app/Messenger/'].includes(u.pathname))return res.end('<a href="/app/References/PhrasesList.aspx">Быстрые фразы</a><a href="/app/Orders.aspx">Заказы</a><script>var statusesSelectize=[{"name":"Заявка","color":"#2B638C"}];</script>');
   if(u.pathname==='/app/References/PhrasesList.aspx')return res.end('<table><tr><th></th><th>Название фразы</th><th>Текст фразы</th><th>Менеджеры</th></tr><tr><td></td><td>ПОДНЯТИЕ</td><td></td><td></td></tr><tr><td>✎</td><td>Приветствие</td><td>Привет [Имя]</td><td>0.0 Даша Алексеева</td></tr></table>');
   res.statusCode=404;res.end('not found');
 });
 const bsWebPort=await listen(bsWeb);

 const vk=http.createServer(async(req,res)=>{
   const u=new URL(req.url,'http://127.0.0.1'); const method=decodeURIComponent(u.pathname.replace(/^\//,''));
   if(method==='groups.getById') return json(res,{response:{groups:[{id:777,name:'Yoga X Dasha',screen_name:'yogaxdasha',photo_100:''}]}});
   if(method==='messages.getConversations') return json(res,{response:{count:1,items:[]}});
   return json(res,{response:{}});
 });
 const vkPort=await listen(vk);

 const appPort=19680;
 const env={...process.env,PORT:String(appPort),HOST:'127.0.0.1',BLUESALES_API_URL:`http://127.0.0.1:${bsApiPort}/api`,BLUESALES_WEB_BASE:`http://127.0.0.1:${bsWebPort}`,VK_API_BASE:`http://127.0.0.1:${vkPort}/`,VK_TOKEN:'test-token',VK_COMMUNITY:'777',VK_COMMUNITY_URL:'https://vk.ru/yogaxdasha',BS_QUEUE_GAP_MS:'0'};
 const child=spawn(process.execPath,['server.js'],{cwd:path.resolve(__dirname,'..'),env,stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
 try{
   for(let i=0;i<50;i++){try{const r=await fetch(`http://127.0.0.1:${appPort}/api/health`);if(r.ok)break;}catch{} await new Promise(r=>setTimeout(r,100));}
   let r=await fetch(`http://127.0.0.1:${appPort}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login:'dasha@example.com',password:'pw'})});
   if(!r.ok)throw new Error('login failed '+await r.text());
   const login=await r.json(); const cookie=(r.headers.get('set-cookie')||'').split(';')[0]; const csrf=login.csrf;
   // Manual UI sync: mock waits only 1 sec but app defaults 5 sec, so background/manual may take a bit.
   r=await fetch(`http://127.0.0.1:${appPort}/api/account-ui/sync`,{method:'POST',headers:{Cookie:cookie,'X-CSRF-Token':csrf,'Content-Type':'application/json'},body:'{}'});
   const sync=await r.json(); if(!sync.ok)throw new Error('manual sync failed '+JSON.stringify(sync));
   if(sync.quickPhrases.count!==1)throw new Error('phrase count '+JSON.stringify(sync.quickPhrases));
   r=await fetch(`http://127.0.0.1:${appPort}/api/meta`,{headers:{Cookie:cookie}}); const meta=await r.json();
   if(meta.statusColors?.['Заявка']!=='#2B638C')throw new Error('status color not synced');
   r=await fetch(`http://127.0.0.1:${appPort}/api/orders`,{method:'POST',headers:{Cookie:cookie,'X-CSRF-Token':csrf,'Content-Type':'application/json'},body:JSON.stringify({customerId:101,orderStatus:'Новый',managerLogin:'dasha@example.com',sum:1500,prepay:500,internalComments:'test'})});
   const order=await r.json(); if(!r.ok||!order.ok)throw new Error('orders.add failed '+JSON.stringify(order));
   if(lastOrderPayload?.customer?.id!==101||lastOrderPayload?.orderStatus?.name!=='Новый')throw new Error('wrong orders.add payload '+JSON.stringify(lastOrderPayload));
   console.log('OK: full login + manual account UI sync.');
   console.log('OK: quick phrases from PhrasesList scoped to manager.');
   console.log('OK: JS status colors in /api/meta.');
   console.log('OK: official orders.add payload customer.id + orderStatus.name.');
 }finally{
   child.kill();bsApi.close();bsWeb.close();vk.close();
 }
})().catch(e=>{console.error('ERROR:',e.message);process.exit(1)});
