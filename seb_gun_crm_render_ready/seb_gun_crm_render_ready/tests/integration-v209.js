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
   const u=new URL(req.url,'http://127.0.0.1');const cmd=u.searchParams.get('command');
   const raw=await readBody(req);let body=null;try{body=JSON.parse(raw)}catch{}
   if(cmd==='users.get')return json(res,[{id:61807,name:'0.1 Сергей К.',login:'manager@example.com'}]);
   if(cmd==='customers.get')return json(res,{count:1,notReturnedCount:0,customers:[{id:101,fullName:'Тестовый клиент',vk:{id:'123'},crmStatus:{name:'Заявка'},manager:{id:61807,name:'0.1 Сергей К.',login:'manager@example.com'},tags:[{id:617978,name:'КС Спина'}]}]});
   if(cmd==='orders.get')return json(res,{count:0,notReturnedCount:0,orders:[]});
   if(cmd==='orders.add'){lastOrderPayload=body;return json(res,{id:501,customer:body.customer,orderStatus:body.orderStatus});}
   if(cmd==='customers.update')return json(res,{isValid:true});
   return json(res,{isValid:false,error:`unknown ${cmd}`});
 });
 const apiPort=await listen(bsApi);

 let loginAttempts=0;
 const bsWeb=http.createServer(async(req,res)=>{
   const u=new URL(req.url,'http://127.0.0.1');
   if(u.pathname==='/app/Login.aspx'&&req.method==='GET')return res.end('<form action="/app/Login.aspx" method="post"><input name="login" type="email"><input name="password" type="password"><button name="enter" value="Войти">Войти</button></form>');
   if(u.pathname==='/app/Login.aspx'&&req.method==='POST'){
      loginAttempts++;
      if(loginAttempts===1)return res.end('<div>Другой пользователь находится онлайн под логином manager@example.com. Вы сможете войти в систему через 1 сек.</div><form action="/app/Login.aspx" method="post"><input name="login" type="email"><input name="password" type="password"></form>');
      res.statusCode=302;res.setHeader('Set-Cookie','sid=ok; Path=/');res.setHeader('Location','/app/');return res.end();
   }
   if(['/app/','/app/Customers/','/app/Messenger/'].includes(u.pathname)){
      return res.end(`<a href="/app/References/PhrasesList.aspx">Быстрые фразы</a><a href="/app/Orders.aspx">Заказы</a>
      <script>
      var loggedManager={"id":61807,"login":"manager@example.com","name":"0.1 Сергей К."};
      $('#selectizeManagers').tagsSelectize({"options":[{"id":61807,"name":"0.1 Сергей К."}],"items":[]});
      $('#selectizeDisabledLoggedManager').tagsSelectize({"options":[{"id":61807,"name":"0.1 Сергей К."}],"items":["61807"]});
      $('#selectizeCrmStatuses').statusesSelectize({"options":[{"id":328210,"name":"Заявка","color":"#0165B0","canceled":false}],"items":[]});
      $('#selectizeTags').tagsSelectize({"options":[{"id":617978,"name":"КС Спина","color":"#5319E7","textColor":"White"}],"items":[]});
      </script>`);
   }
   if(u.pathname==='/app/References/PhrasesList.aspx')return res.end('<table><tr><th></th><th>Название фразы</th><th>Текст фразы</th><th>Менеджеры</th></tr><tr><td></td><td>ПОДНЯТИЕ</td><td></td><td></td></tr><tr><td>✎</td><td>Приветствие</td><td>Привет [Имя]</td><td>0.1 Сергей К.</td></tr></table>');
   res.statusCode=404;res.end('not found');
 });
 const webPort=await listen(bsWeb);

 const vk=http.createServer(async(req,res)=>{
   const u=new URL(req.url,'http://127.0.0.1');const method=decodeURIComponent(u.pathname.replace(/^\//,''));
   if(method==='groups.getById')return json(res,{response:{groups:[{id:777,name:'Yoga X Dasha',screen_name:'yogaxdasha',photo_100:''}]}});
   if(method==='messages.getConversations')return json(res,{response:{count:1,items:[]}});
   return json(res,{response:{}});
 });
 const vkPort=await listen(vk);

 const appPort=19689;
 const env={...process.env,PORT:String(appPort),HOST:'127.0.0.1',BLUESALES_API_URL:`http://127.0.0.1:${apiPort}/api`,BLUESALES_WEB_BASE:`http://127.0.0.1:${webPort}`,VK_API_BASE:`http://127.0.0.1:${vkPort}/`,VK_TOKEN:'test',VK_COMMUNITY:'777',BS_QUEUE_GAP_MS:'0',ALLOW_LOCAL_PHRASE_FALLBACK:'0'};
 const child=spawn(process.execPath,['server.js'],{cwd:path.resolve(__dirname,'..'),env,stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
 try{
   for(let i=0;i<50;i++){try{if((await fetch(`http://127.0.0.1:${appPort}/api/health`)).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
   let r=await fetch(`http://127.0.0.1:${appPort}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login:'manager@example.com',password:'pw'})});
   if(!r.ok)throw new Error('login '+await r.text());
   const login=await r.json(),cookie=(r.headers.get('set-cookie')||'').split(';')[0],csrf=login.csrf;
   r=await fetch(`http://127.0.0.1:${appPort}/api/account-ui/sync`,{method:'POST',headers:{Cookie:cookie,'X-CSRF-Token':csrf,'Content-Type':'application/json'},body:'{}'});
   const sync=await r.json();if(!sync.ok)throw new Error('sync '+JSON.stringify(sync));
   r=await fetch(`http://127.0.0.1:${appPort}/api/meta`,{headers:{Cookie:cookie}});const meta=await r.json();
   if(meta.statusColors?.['Заявка']!=='#0165B0')throw new Error('status '+JSON.stringify(meta.statusColors));
   if(meta.tagColors?.['КС Спина']!=='#5319E7')throw new Error('tag '+JSON.stringify(meta.tagColors));
   if(meta.tagTextColors?.['КС Спина']!=='White')throw new Error('tag text');
   r=await fetch(`http://127.0.0.1:${appPort}/api/quick-phrases`,{headers:{Cookie:cookie}});const phrases=await r.json();
   if((phrases.groups||[]).flatMap(g=>g.phrases||[]).length!==1)throw new Error('phrases '+JSON.stringify(phrases));
   const importedHtml=`<table>
     <tr><th>Название фразы</th><th>Текст фразы</th><th>Менеджеры</th></tr>
     <tr><td>ИМПОРТ</td><td></td><td></td></tr>
     <tr><td>Импортированная</td><td>Текст [Имя]</td><td>0.1 Сергей К.</td></tr>
   </table>`;
   r=await fetch(`http://127.0.0.1:${appPort}/api/account-ui/import`,{method:'POST',headers:{Cookie:cookie,'X-CSRF-Token':csrf,'Content-Type':'application/json'},body:JSON.stringify({html:importedHtml})});
   const imported=await r.json();if(!r.ok||imported.phrases?.count!==1)throw new Error('HTML import '+JSON.stringify(imported));
   r=await fetch(`http://127.0.0.1:${appPort}/api/quick-phrases`,{headers:{Cookie:cookie}});const afterImport=await r.json();
   if(afterImport.source!=='bluesales-html-import'||(afterImport.groups||[]).flatMap(g=>g.phrases||[]).length!==1)throw new Error('import source '+JSON.stringify(afterImport));

   r=await fetch(`http://127.0.0.1:${appPort}/api/orders`,{method:'POST',headers:{Cookie:cookie,'X-CSRF-Token':csrf,'Content-Type':'application/json'},body:JSON.stringify({customerId:101,orderStatus:'Новый',managerLogin:'manager@example.com',sum:100})});
   if(!r.ok)throw new Error('order '+await r.text());
   if(lastOrderPayload?.customer?.id!==101||lastOrderPayload?.orderStatus?.name!=='Новый')throw new Error('order payload '+JSON.stringify(lastOrderPayload));
   console.log('OK: live-style BlueSales Messenger bootstrap sync.');
   console.log('OK: exact status/tag colors + tag textColor.');
   console.log('OK: account-scoped quick phrases.');
   console.log('OK: account-scoped HTML import fallback.');
   console.log('OK: official orders.add payload.');
 }finally{
   child.kill();bsApi.close();bsWeb.close();vk.close();
 }
})().catch(e=>{console.error('ERROR:',e.message);process.exit(1)});
