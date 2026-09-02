'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const exists = p => fs.existsSync(path.join(root, p));

const server = read('server.js');
const pkg = JSON.parse(read('package.json'));
const drafts = read('frontend/src/stores/drafts.js');
const chat = read('frontend/src/stores/chat.js');
const api = read('frontend/src/services/api.js');
const dialogRow = read('frontend/src/components/DialogRow.vue');
const chatView = read('frontend/src/views/ChatView.vue');
const bubble = read('frontend/src/components/MessageBubble.vue');
const sheet = read('frontend/src/components/MultiFilterSheet.vue');
const css = read('frontend/src/assets/base.css');
const vite = read('frontend/vite.config.js');

if (!server.includes("const VERSION = '28.1'")) throw new Error('server version is not 28.1');
if (pkg.version !== '28.1.0') throw new Error('package version is not 28.1.0');
if (!exists('frontend/public/manifest.webmanifest') || !exists('frontend/public/icon.svg')) throw new Error('Vite public PWA assets missing');
const manifest = JSON.parse(read('frontend/public/manifest.webmanifest'));
if (manifest.start_url !== '/#/dialogs' || manifest.icons?.[0]?.src !== '/icon.svg') throw new Error('PWA manifest paths are invalid');
if (!vite.includes("new URL('../public'")) throw new Error('Vite output directory changed unexpectedly');
if (!drafts.includes('clearIfRequestId(peerId, requestId)')) throw new Error('race-safe draft clearing missing');
if (!chat.includes('drafts.clearIfRequestId(this.peerId, clientRequestId)')) throw new Error('send can erase a newer draft');
if (!api.includes('imageUrl: (url)')) throw new Error('direct image URL helper missing');
for (const [name, source] of [['DialogRow', dialogRow], ['ChatView', chatView], ['MessageBubble', bubble]]) {
  if (!source.includes('api.imageUrl(')) throw new Error(`${name} still sends ordinary images through /api/media`);
}
if (!sheet.includes('sheet-actions') || !css.includes('grid-template-rows:auto auto minmax(0,1fr) auto')) throw new Error('fixed Android filter actions missing');
if (!chatView.includes('userControlled') || !chatView.includes('newMessageCount')) throw new Error('manual scroll protection missing');
const phrases = JSON.parse(read('data/quick_phrases.json'));
const phraseCount = (phrases.groups || []).reduce((n, g) => n + (g.phrases || []).length, 0);
if (phraseCount !== 151) throw new Error(`expected 151 phrases, got ${phraseCount}`);
console.log('v28.1 integration checks: OK (PWA assets, media rendering, draft race, Android sheet, 151 phrases)');
