const fs=require('fs');const path=require('path');const root=path.resolve(__dirname,'..');const app=fs.readFileSync(path.join(root,'public/app.js'),'utf8');const api=fs.readFileSync(path.join(root,'public/api.js'),'utf8');const server=fs.readFileSync(path.join(root,'server.js'),'utf8');const sw=fs.readFileSync(path.join(root,'public/sw.js'),'utf8');
function ok(v,m){if(!v)throw new Error(m)}
ok(/VERSION = '26\.8'/.test(server),'server version');
ok(/v26\.8/.test(app),'app version');
ok(/26\.8\.0/.test(sw),'sw version');
ok(/dialogs-auto-complete/.test(app),'all-dialog auto pagination');
ok(!/data-action="more-dialogs"/.test(app),'manual dialog load-more removed');
ok(/MESSAGE_DRAFT_STORAGE='seb_gun_message_draft_v1'/.test(app),'persistent draft storage');
ok(/persistMessageDraft\(\)/.test(app)&&/restoreMessageDraft\(peerId\)/.test(app),'draft persist/restore');
ok(/applyClientTranscriptCache\(peerId,d\.messages\|\|\[\]\)/.test(app),'transcripts reapplied after send refresh');
ok(/applyClientTranscriptCache\(state\.selectedDialog\.peerId,next\)/.test(app),'transcripts reapplied after poll');
ok(/uploadVkMediaFile/.test(api),'binary client upload');
ok(/async function readBuffer/.test(server)&&/binary.*=== '1'/.test(server),'binary server upload');
ok(/photo-fallback-doc/.test(server),'photo document fallback');
ok(/\[50,120,260,520,900,1400,2100\]/.test(app),'initial bottom settling');

const phrasesDb=JSON.parse(fs.readFileSync(path.join(root,'data','quick_phrases.json'),'utf8'));
const groups=phrasesDb.groups||[],phrases=groups.flatMap(g=>(g.phrases||[]).map(p=>({...p,groupName:g.name}))),atts=phrases.flatMap(p=>p.attachments||[]);
ok(groups.length===25&&phrases.length===151,'v26.7 full phrase database preserved');
ok(atts.filter(a=>String(a).startsWith('audio_message')).length===35,'voice phrase attachments preserved');
ok(atts.filter(a=>String(a).startsWith('photo')).length===11,'photo phrase attachments preserved');
ok(phrases.some(p=>String(p.text||'').includes('🎁'))&&phrases.some(p=>String(p.text||'').includes('😊')),'emoji preserved');

console.log('v26.8 integration checks: OK');
