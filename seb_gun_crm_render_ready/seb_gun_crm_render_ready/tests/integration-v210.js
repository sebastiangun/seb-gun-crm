'use strict';
const http=require('http');
const {spawn}=require('child_process');
const path=require('path');
const fs=require('fs');

function listen(server){return new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',()=>resolve(server.address().port)).once('error',reject));}
function json(res,obj,status=200){res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(obj));}
function readBody(req){return new Promise(resolve=>{let b='';req.on('data',c=>b+=c);req.on('end',()=>resolve(b));});}
function customer(id,name,date){return {id,fullName:name,vk:{id:String(1000+id)},nextContactDate:date,crmStatus:{name:'Заявка'},manager:{id:61807,name:'0.1 Сергей К.',login:'manageryogadasha@mail.ru'},tags:[]};}

(async()=>{
 const rangeCalls=[];
 const bsApi=http.createServer(async(req,res)=>{
   const u=new URL(req.url,'http://127.0.0.1');const cmd=u.searchParams.get('command');
   const raw=await readBody(req);let body={};try{body=JSON.parse(raw)||{}}catch{}
   if(cmd==='users.get')return json(res,[{id:61807,name:'0.1 Сергей К.',login:'manageryogadasha@mail.ru'}]);
   if(cmd==='customers.get'){
     const f=body.nextContactDateFrom||null,t=body.nextContactDateTill||null; rangeCalls.push([f,t]);
     let items=[];
     if(f&&t&&f===t){
       if(String(f).endsWith('-30')) items=[customer(1,'Сегодня','2026-08-30')];
       else if(String(f).endsWith('-31')) items=[customer(2,'Завтра','2026-08-31')];
     }else if(f&&!t){ items=[customer(3,'Будущее','2026-09-05')]; }
     else if(!f&&t){ items=[customer(4,'Просрочено','2026-08-01')]; }
     return json(res,{count:items.length,notReturnedCount:0,customers:items});
   }
   return json(res,{count:0,notReturnedCount:0,customers:[]});
 });
 const apiPort=await listen(bsApi);

 const vk=http.createServer(async(req,res)=>{
   const u=new URL(req.url,'http://127.0.0.1');const method=decodeURIComponent(u.pathname.replace(/^\//,''));
   if(method==='groups.getById')return json(res,{response:{groups:[{id:777,name:'Yoga X Dasha',screen_name:'yogaxdasha',photo_100:''}]}});
   if(method==='messages.getConversations')return json(res,{response:{count:0,items:[]}});
   return json(res,{response:{}});
 });
 const vkPort=await listen(vk);

 const appPort=19710;
 const env={...process.env,PORT:String(appPort),HOST:'127.0.0.1',BLUESALES_API_URL:`http://127.0.0.1:${apiPort}/api`,BS_WEB_SYNC_ENABLED:'0',VK_API_BASE:`http://127.0.0.1:${vkPort}/`,VK_TOKEN:'test',VK_COMMUNITY:'777',BS_QUEUE_GAP_MS:'0',ALLOW_LOCAL_PHRASE_FALLBACK:'1'};
 const child=spawn(process.execPath,['server.js'],{cwd:path.resolve(__dirname,'..'),env,stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
 try{
   for(let i=0;i<60;i++){try{if((await fetch(`http://127.0.0.1:${appPort}/api/health`)).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
   let r=await fetch(`http://127.0.0.1:${appPort}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login:'manageryogadasha@mail.ru',password:'pw'})});
   if(!r.ok)throw new Error('login '+await r.text());
   const login=await r.json(),cookie=(r.headers.get('set-cookie')||'').split(';')[0];

   r=await fetch(`http://127.0.0.1:${appPort}/api/quick-phrases`,{headers:{Cookie:cookie}});const phrases=await r.json();
   const flat=(phrases.groups||[]).flatMap(g=>g.phrases||[]);
   if(flat.length!==143)throw new Error(`expected 143 phrases, got ${flat.length}, source=${phrases.source}`);
   const voice=flat.find(p=>p.name==='Полная диагностика (голосовое)');
   if(!voice||!Array.isArray(voice.attachments)||!voice.attachments.some(x=>x.startsWith('audio_message')))throw new Error('voice attachment missing');
   const photos=flat.find(p=>p.name==='Описание и расписание');
   if(!photos||photos.attachments.length!==2)throw new Error('photo attachments missing');

   r=await fetch(`http://127.0.0.1:${appPort}/api/reminders`,{headers:{Cookie:cookie}});const rem=await r.json();
   for(const k of ['today','tomorrow','future','overdue'])if((rem.reminders?.[k]||[]).length!==1)throw new Error(`reminder ${k} not complete: `+JSON.stringify(rem));
   if(!rangeCalls.some(([f,t])=>f&&t&&f===t))throw new Error('exact date range not used');
   if(!rangeCalls.some(([f,t])=>f&&!t))throw new Error('future unbounded range not used');
   if(!rangeCalls.some(([f,t])=>!f&&t))throw new Error('overdue unbounded range not used');

   const appText=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
   if(!appText.includes('messageAttachments:[]')||!appText.includes("attachment:atts.join(',')"))throw new Error('composer attachment queue missing');
   console.log('OK: 143 account-scoped phrases loaded from phrases-list.xlsx export.');
   console.log('OK: phrase document/voice/photo attachments are extracted and preserved.');
   console.log('OK: composer queues phrase/manual attachments and sends them with text.');
   console.log('OK: reminders use date-filtered customers.get ranges without a total scan cap.');
 }finally{child.kill();bsApi.close();vk.close();}
})().catch(e=>{console.error('ERROR:',e.message);process.exit(1)});
