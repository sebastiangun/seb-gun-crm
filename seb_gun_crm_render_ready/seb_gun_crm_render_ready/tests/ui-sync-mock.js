'use strict';
const http=require('http');
const BlueSalesWeb=require('../lib/bluesales-web');
async function main(){
 let loginAttempts=0;
 const server=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://127.0.0.1');
  if(u.pathname==='/app/Login.aspx'&&req.method==='GET')return res.end('<form action="/app/Login.aspx" method="post"><input name="login" type="email"><input name="password" type="password"><button name="enter" value="Войти">Войти</button></form>');
  if(u.pathname==='/app/Login.aspx'&&req.method==='POST'){
    loginAttempts++;
    if(loginAttempts<2)return res.end('<div>Другой пользователь находится онлайн под логином test@example.com. Вы сможете войти в систему через 1 сек.</div><form action="/app/Login.aspx" method="post"><input name="login" type="email"><input name="password" type="password"></form>');
    res.statusCode=302;res.setHeader('Set-Cookie','sid=test; Path=/');res.setHeader('Location','/app/');return res.end();
  }
  if(['/app/','/app/Customers/','/app/Messenger/'].includes(u.pathname))return res.end(`<a href="/app/References/PhrasesList.aspx">Быстрые фразы</a><a href="/app/Statuses.aspx">Статусы CRM</a><a href="/app/Users.aspx">Пользователи системы</a><script>var statusesSelectize=[{"id":1,"name":"Не учитывать в лидах","color":"#848B8C"},{"id":2,"name":"Заявка","color":"#2B638C"}]; var tagsSelectize=[{"id":9,"name":"КС Спина","color":"#6A00FF"}];</script>`);
  if(u.pathname==='/app/References/PhrasesList.aspx')return res.end('<table><tr><th></th><th></th><th>Название фразы</th><th>Текст фразы</th><th>Горячая клавиша</th><th>Менеджеры</th></tr><tr><td></td><td></td><td>ПОДНЯТИЕ</td><td></td><td></td><td></td></tr><tr><td>✎</td><td>≡</td><td>Даша</td><td>Привет [Имя]</td><td></td><td><a>0.0 Даша Алексеева</a></td></tr><tr><td>✎</td><td>≡</td><td>Сергей</td><td>Чужая фраза</td><td></td><td><a>0.1 Сергей К.</a></td></tr></table>');
  if(u.pathname==='/app/Statuses.aspx')return res.end('<div>Статусы CRM</div>');
  if(u.pathname==='/app/Users.aspx')return res.end('<style>.rasil{background:#86BA67}</style><span class="rasil">0.1 Расиль М.</span>');
  res.statusCode=404;res.end('not found');
 });
 await new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',resolve).once('error',reject));
 const port=server.address().port;
 try{
  const p=await BlueSalesWeb.bootstrap({base:`http://127.0.0.1:${port}`,login:'dasha@example.com',password:'x',currentUser:{login:'dasha@example.com',name:'0.0 Даша Алексеева'},statusNames:['Не учитывать в лидах','Заявка'],managerNames:['0.1 Расиль М.'],busyRetries:3,busyWaitMinMs:10,busyWaitMaxMs:20});
  const names=(p.phrases||[]).flatMap(g=>(g.phrases||[]).map(x=>x.name));
  if(!p.ok)throw new Error('mock web login failed');
  if(loginAttempts!==2)throw new Error(`BUSY retry failed: ${loginAttempts}`);
  if(p.discovered.phraseUrl==null||!p.discovered.phraseUrl.includes('References/PhrasesList.aspx'))throw new Error('PhrasesList discovery failed');
  if(names.length!==1||names[0]!=='Даша')throw new Error(`phrase manager filtering failed: ${JSON.stringify(names)}`);
  if(p.statusColors['Не учитывать в лидах']!=='#848B8C'||p.statusColors['Заявка']!=='#2B638C')throw new Error(`JS status colors failed: ${JSON.stringify(p.statusColors)}`);
  if(p.tagColors['КС Спина']!=='#6A00FF')throw new Error('JS tag color failed');
  if(p.managerColors['0.1 Расиль М.']!=='#86BA67')throw new Error('manager CSS color failed');
  console.log('OK: BUSY retry.');console.log('OK: /app/References/PhrasesList.aspx discovery.');console.log('OK: manager-scoped quick phrases.');console.log('OK: statusesSelectize/tagsSelectize colors.');
 }finally{server.close();}
}
main().catch(e=>{console.error('ERROR:',e.message);process.exit(1)});
