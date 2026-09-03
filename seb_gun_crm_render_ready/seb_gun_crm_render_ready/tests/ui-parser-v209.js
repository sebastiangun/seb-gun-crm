'use strict';
const BS=require('../lib/bluesales-web');

const html=`<!doctype html><html><script>
var loggedManager = {"id":61807,"login":"manageryogadasha@mail.ru","name":"0.1 Сергей К."};
$('#selectizeManagers').tagsSelectize({"options":[{"id":61803,"name":"0.0 Даша Алексеева"},{"id":61807,"name":"0.1 Сергей К."}],"items":[]});
$('#selectizeDisabledLoggedManager').tagsSelectize({"options":[{"id":61803,"name":"0.0 Даша Алексеева"},{"id":61807,"name":"0.1 Сергей К."}],"items":["61807"]});
$('#selectizeCrmStatuses').statusesSelectize({"options":[{"id":328123,"name":"Не учитывать в лидах","color":"#848B8C","canceled":false},{"id":328210,"name":"Заявка","color":"#0165B0","canceled":false}],"items":[]});
$('#selectizeTags').tagsSelectize({"options":[{"id":617978,"name":"КС Спина","color":"#5319E7","textColor":"White"},{"id":615262,"name":"Дарья Алексеева","color":"#C5DEF5","textColor":"Black"}],"items":[]});
</script></html>`;

const b=BS.extractMessengerBootstrap(html);
if(b.managers.length!==2)throw new Error('manager count');
if(b.statuses.length!==2)throw new Error('status count');
if(b.tags.length!==2)throw new Error('tag count');
if(b.loggedManager?.id!==61807||b.loggedManager?.login!=='manageryogadasha@mail.ru')throw new Error('logged manager');
if(b.selectedManagerId!=='61807')throw new Error('selected manager');
if(b.statusColors['Заявка']!=='#0165B0')throw new Error('exact status color');
if(b.tagColors['КС Спина']!=='#5319E7')throw new Error('exact tag color');
if(b.tagTextColors['КС Спина']!=='White')throw new Error('tag text color');

const phraseHtml=`<table>
<tr><th></th><th></th><th>Название фразы</th><th>Текст фразы</th><th>Горячая клавиша</th><th>Менеджеры</th></tr>
<tr><td></td><td></td><td>ПОДНЯТИЕ</td><td></td><td></td><td></td></tr>
<tr><td>✎</td><td>≡</td><td>ПОДНЯТИЕ принял решение</td><td>Привет [Имя]</td><td></td><td><a>0.1 Сергей К.</a><br><a>0.1 Софа С.</a></td></tr>
<tr><td>✎</td><td>≡</td><td>Чужая</td><td>Не показывать</td><td></td><td><a>0.1 Расиль М.</a></td></tr>
</table>`;
const groups=BS.parseQuickPhrases(phraseHtml);
const allowed=BS.filterPhraseGroups(groups,{id:61807,login:'manageryogadasha@mail.ru',name:'0.1 Сергей К.'},'manageryogadasha@mail.ru');
const names=allowed.flatMap(g=>g.phrases.map(p=>p.name));
if(names.length!==1||names[0]!=='ПОДНЯТИЕ принял решение')throw new Error('phrase manager permission filter');

console.log('OK: real jQuery statusesSelectize parser.');
console.log('OK: real jQuery tagsSelectize parser.');
console.log('OK: loggedManager/selectizeManagers parser.');
console.log('OK: quick phrases Managers permission filter.');
