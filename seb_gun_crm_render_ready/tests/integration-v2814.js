const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const pkg=require('../package.json');
const server=read('server.js'),admin=read('frontend/src/views/AdminView.vue'),drawer=read('frontend/src/components/ClientDrawer.vue');
const vk=require('../lib/vk-phrase-attachments');
function must(value,message){if(!value)throw new Error(message)}

must(/^28\.(14|15|16)\.0$/.test(pkg.version)&&/const VERSION = '28\.(14|15|16)'/.test(server),'version mismatch');
must(vk.normalizeToken('https://vk.com/photo-25869828_457438050')==='photo-25869828_457438050','photo URL parsing failed');
must(vk.normalizeToken('audmsg3138382_659705573')==='audio_message3138382_659705573','voice alias parsing failed');
must(vk.normalizeToken('https://vk.com/wall-86155313_914?reply=1')==='wall-86155313_914','wall URL parsing failed');
must(vk.extractAttachments('[video-1_2] audio3_4 market-5_6').join(',')==='video-1_2,audio3_4,market-5_6','multi-type parsing failed');
must(vk.cleanPhraseText('Привет 😊\n[photo-1_2]')==='Привет 😊','emoji or text was damaged');
must(server.includes('findCommitted')&&server.includes('recoveredFromUpstreamError')&&server.includes('customers.add'),'delayed BlueSales recovery missing');
must(server.includes('existingAttachments=[]')&&server.includes('found.phrase.attachments||[]'),'existing phrase attachments are not protected');
must(admin.includes('VK_ATTACHMENT_TYPES')&&admin.includes('addPhraseAttachment')&&admin.includes('Текст и эмодзи'),'rich phrase editor missing');
must(drawer.includes('{...form}')&&drawer.includes('recoveredFromUpstreamError'),'full client draft or recovery feedback missing');
console.log('v28.14 integration checks: OK (client-create recovery, rich VK phrase attachments, emoji preservation)');
