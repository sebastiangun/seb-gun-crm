const fs=require('fs'),path=require('path'); const root=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(root,'public/app.js'),'utf8'),server=fs.readFileSync(path.join(root,'server.js'),'utf8'),html=fs.readFileSync(path.join(root,'public/index.html'),'utf8'),pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
function ok(x,m){if(!x)throw new Error(m)}
ok(app.includes('/api/voice/playback?url='),'voice player must use universal playback endpoint');
ok(app.includes('markChatUserScroll'),'manual chat scrolling must cancel restoration');
ok(!app.includes('lockChatToBottom(peerId,5200)'),'long bottom lock must be removed');
ok(server.includes('proxyVoicePlayback'),'MP3 playback proxy is missing');
ok(server.includes('local-open-source-transformers.js-whisper'),'Transformers.js STT health mode missing');
ok(pkg.dependencies['@huggingface/transformers'],'Transformers.js dependency missing');
ok(pkg.dependencies['ffmpeg-static'],'ffmpeg-static dependency missing');
ok(html.includes('mobile-web-app-capable'),'modern PWA meta missing');
console.log('integration-v258: OK');
