'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.join(__dirname,'..'),data=require('../data/quick_phrases.json'),source=fs.readFileSync(path.join(root,'data/source/phrases-20260905.md'),'utf8');
const clean=s=>s.replace(/<br\s*\/?>/gi,'\n').replace(/\\([\\`*_{}\[\]()#+\-.!|:>])/g,'$1').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,'\u00a0').replace(/&quot;/g,'"').trim();
let group='',count=0;
for(const line of source.split('\n')){
 if(line.startsWith('### '))group=clean(line.slice(4));
 if(!line.startsWith('|')||!group)continue;const cells=line.split(/(?<!\\)\|/).slice(1,-1);if(cells.length!==7)continue;
 const name=clean(cells[3]);if(!name||/^[:\-\s]+$/.test(name))continue;
 const phrase=data.groups.find(g=>g.name===group)?.phrases.find(p=>p.name===name&&p.text===clean(cells[4]));assert.ok(phrase,group+' / '+name);
 assert.equal(phrase.text,clean(cells[4]),name+': exact text including emoji and video links');
 const expected=[...clean(cells[4]).matchAll(/\[((?:photo|video|audio_message|audmsg|audio|doc|market|wall)\s*-?\d+_\d+(?:_[A-Za-z0-9]+)?)\]/gi)].map(m=>m[1].replace('audmsg','audio_message'));
 assert.deepEqual(phrase.attachments,[...new Set(expected)],name+': attachments');count++;
}
assert.equal(count,173);const ids=data.groups.flatMap(g=>g.phrases.map(p=>p.id));assert.equal(new Set(ids).size,ids.length,'unique phrase IDs');assert.equal(data.groups.reduce((n,g)=>n+g.phrases.length,0),185);
console.log('PASS: 173 source phrases exactly preserved; emoji, newlines, video URLs and attachment markers; 185 total');
