const fs=require('fs');
const path=require('path');
const root=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
const sw=fs.readFileSync(path.join(root,'public','sw.js'),'utf8');
function ok(v,m){if(!v)throw new Error(m)}
ok(app.includes('function forceChatToBottom(peerId'), 'forceChatToBottom missing');
ok(app.includes('function refreshMessageFlowAfterSend(peerId)'), 'targeted message refresh missing');
ok(app.includes('forceChatToBottom(peerId,{settle:true});'), 'send does not force bottom');
ok(app.includes('refreshMessageFlowAfterSend(peerId);'), 'post-send refresh does not use targeted flow refresh');
ok(!app.includes("if(chatComposerFocused())state._chatRenderDeferred=true;else renderChatKeepScroll();"), 'old deferred post-send render still present');
ok(server.includes("const VERSION = '26.1';"), 'server version mismatch');
ok(sw.includes('v26.1.0'), 'service worker cache mismatch');
console.log('v26.1 integration checks: OK');
