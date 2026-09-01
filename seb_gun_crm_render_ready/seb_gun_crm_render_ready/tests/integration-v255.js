const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
const app=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
const api=fs.readFileSync(path.join(root,'public','api.js'),'utf8');
const index=fs.readFileSync(path.join(root,'public','index.html'),'utf8');
function ok(v,m){if(!v)throw new Error(m)}
ok(server.includes("const VERSION = '25.5'"),'version');
ok(server.includes("pathname === '/api/voice/audio'"),'voice audio endpoint');
ok(server.includes("req.headers.range"),'HTTP Range forwarding');
ok(server.includes("pathname === '/api/voice/transcribe'"),'voice transcribe endpoint');
ok(server.includes('VOICE_TRANSCRIPT_STORE'),'server transcript cache');
ok(app.includes('voiceAudioSrc'),'voice player uses proxy');
ok(app.includes('playsinline'),'mobile audio player');
ok(app.includes('applyClientTranscriptCache'),'browser transcript cache');
ok(api.includes("'/api/voice/transcribe'"),'api client new transcript route');
ok(!app.includes('VK не дал расшифровку'),'no VK transcript error in app');
ok(index.includes('25.5.0'),'cache bust');
console.log('integration-v255 OK');
