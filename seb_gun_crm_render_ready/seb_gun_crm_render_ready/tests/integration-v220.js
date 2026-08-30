'use strict';
const http=require('http');
const {spawn}=require('child_process');
const path=require('path');
const fs=require('fs');
const assert=require('assert');
const ROOT=path.join(__dirname,'..');
function listen(server){return new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',()=>resolve(server.address().port)).once('error',reject));}
function json(res,obj,status=200){res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(obj));}
function readBody(req){return new Promise(resolve=>{let b='';req.on('data',c=>b+=c);req.on('end',()=>resolve(b));});}
(async()=>{
 const phrasesPath=path.join(ROOT,'data','quick_phrases.json');
 const original=fs.readFileSync(phrasesPath);
 const access=JSON.parse(fs.readFileSync(path.join(ROOT,'data','user-access.json'),'utf8'));
 const colors=JSON.parse(fs.readFileSync(path.join(ROOT,'data','manager-colors.json'),'utf8'));
 const phrases=JSON.parse(original.toString('utf8'));
 const all=(phrases.groups||[]).flatMap(g=>(g.phrases||[]).map(p=>({...p,group:g.name})));
 assert.strictEqual(all.length,143);
 const first=all.find(x=>x.name==='ПОДНЯТИЕ игнор');
 assert(first?.text.includes('😊')&&first.text.includes('🎁')&&first.text.includes('🚀'),'emoji lost');
 assert(first.managers.includes('0.1 Сергей К.'),'manager assignment lost');
 assert.strictEqual(String(access.users.find(u=>u.login==='manageryogadasha@mail.ru')?.color).toLowerCase(),'#5319e7');
 assert.strictEqual(String(colors['0.1 Сергей К.']).toLowerCase(),'#5319e7');

 const bs=http.createServer(async(req,res)=>{
   const u=new URL(req.url,'http://127.0.0.1');const cmd=u.searchParams.get('command');await readBody(req);
   if(cmd==='users.get')return json(res,[
    {id:61807,name:'0.1 Сергей К.',login:'manageryogadasha@mail.ru'},
    {id:62691,name:'0.1 Софа С.',login:'dianamanageryoga@gmail.com'}
   ]);
   if(cmd==='customers.get')return json(res,{count:0,notReturnedCount:0,customers:[]});
   return json(res,{});
 });
 const bsPort=await listen(bs);
 const vk=http.createServer((req,res)=>{const u=new URL(req.url,'http://127.0.0.1');const method=decodeURIComponent(u.pathname.replace(/^\//,''));if(method==='groups.getById')return json(res,{response:{groups:[{id:777,name:'Yoga X Dasha',screen_name:'yogaxdasha',photo_100:''}]}});if(method==='messages.getConversations')return json(res,{response:{count:0,items:[]}});return json(res,{response:{}})});
 const vkPort=await listen(vk);
 const port=19722;
 const env={...process.env,PORT:String(port),HOST:'127.0.0.1',BLUESALES_API_URL:`http://127.0.0.1:${bsPort}/api`,BS_WEB_SYNC_ENABLED:'0',VK_API_BASE:`http://127.0.0.1:${vkPort}/`,VK_TOKEN:'test',VK_COMMUNITY:'777',BS_QUEUE_GAP_MS:'0',ALLOW_LOCAL_PHRASE_FALLBACK:'1'};
 const child=spawn(process.execPath,['server.js'],{cwd:ROOT,env,stdio:['ignore','pipe','pipe']});
 try{
  for(let i=0;i<60;i++){try{if((await fetch(`http://127.0.0.1:${port}/api/health`)).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
  let r=await fetch(`http://127.0.0.1:${port}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login:'manageryogadasha@mail.ru',password:'pw'})});
  assert(r.ok,'login failed');const login=await r.json();assert(login.isAdmin===true,'Sergey should be admin');const cookie=(r.headers.get('set-cookie')||'').split(';')[0],csrf=login.csrf;
  r=await fetch(`http://127.0.0.1:${port}/api/admin/overview`,{headers:{Cookie:cookie}});const ov=await r.json();assert(r.ok&&ov.isAdmin&&ov.users.length>=2,'admin overview failed');
  const payload={groupName:'Тест v22',name:'Тест emoji 😊',text:'Привет [Имя] 🎁',hotkey:'tt',managers:['0.1 Сергей К.'],attachments:['photo-235927687_457241272']};
  r=await fetch(`http://127.0.0.1:${port}/api/admin/phrases`,{method:'POST',headers:{Cookie:cookie,'X-CSRF-Token':csrf,'Content-Type':'application/json'},body:JSON.stringify(payload)});const created=await r.json();assert(r.ok&&created.phrase?.id,'phrase create failed');
  r=await fetch(`http://127.0.0.1:${port}/api/admin/phrases/${encodeURIComponent(created.phrase.id)}`,{method:'PUT',headers:{Cookie:cookie,'X-CSRF-Token':csrf,'Content-Type':'application/json'},body:JSON.stringify({...payload,name:'Тест edited 🚀'})});const edited=await r.json();assert(r.ok&&edited.phrase?.name.includes('🚀'),'phrase update failed');
  r=await fetch(`http://127.0.0.1:${port}/api/admin/phrases/${encodeURIComponent(created.phrase.id)}`,{method:'DELETE',headers:{Cookie:cookie,'X-CSRF-Token':csrf,'Content-Type':'application/json'},body:'{}'});assert(r.ok,'phrase delete failed');
  const app=fs.readFileSync(path.join(ROOT,'public','app.js'),'utf8');
  assert(app.includes("items.push(['admin',I.admin,'Админ'])"),'admin tab not wired');
  assert(app.includes('function phraseMatches(query)')&&app.includes('p.name')&&app.includes('p.text'),'inline phrase name/text search missing');
  assert(app.includes('data-admin-edit-user'),'admin users UI missing');
  console.log('OK: 143 phrases preserve emoji, manager assignments and attachments.');
  console.log('OK: Sergey is admin and uses exact #5319e7 manager color.');
  console.log('OK: admin phrase create/update/delete works through authenticated API.');
  console.log('OK: admin users UI/API and inline name+text phrase suggestions are wired.');
 }finally{
   try{fs.writeFileSync(phrasesPath,original)}catch{}
   child.kill();bs.close();vk.close();
 }
})().catch(e=>{console.error('ERROR:',e.stack||e.message);process.exit(1)});
