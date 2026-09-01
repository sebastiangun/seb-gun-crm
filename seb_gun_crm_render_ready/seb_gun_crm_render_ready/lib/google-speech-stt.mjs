import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
const execFileAsync=promisify(execFile)
const require=createRequire(import.meta.url)
const DEFAULT_GENERIC_KEY='AIzaSyBOti4mM-6x9WDnZIjIeyEU21OpBXqWBgw'
function ffmpegPath(explicit=''){if(String(explicit||'').trim())return String(explicit).trim();try{return require('ffmpeg-static')||'ffmpeg'}catch{return'ffmpeg'}}
function extForMime(m='audio/ogg'){m=String(m||'').toLowerCase();if(m.includes('mpeg')||m.includes('mp3'))return'.mp3';if(m.includes('webm'))return'.webm';if(m.includes('wav'))return'.wav';if(m.includes('mp4')||m.includes('m4a'))return'.m4a';return'.ogg'}
function parseGoogleResponse(text=''){for(const line of String(text).split(/\r?\n/)){if(!line.trim())continue;try{const j=JSON.parse(line),alts=j?.result?.[0]?.alternative;if(Array.isArray(alts)&&alts.length){const best=alts.find(x=>x?.transcript)||alts[0];if(best?.transcript)return String(best.transcript).trim()}}catch{}}return''}
export async function transcribeBuffer(buffer,{mimeType='audio/ogg',ffmpegPath:explicit='',language='ru-RU',timeoutMs=45000,key='',endpoint='https://www.google.com/speech-api/v2/recognize'}={}){
 if(!Buffer.isBuffer(buffer)||!buffer.length){const e=new Error('Пустой аудиофайл');e.code='STT_AUDIO_EMPTY';e.status=400;throw e}
 const dir=await fs.promises.mkdtemp(path.join(os.tmpdir(),'seb-gun-google-stt-'));const input=path.join(dir,`voice${extForMime(mimeType)}`),flac=path.join(dir,'voice.flac')
 try{await fs.promises.writeFile(input,buffer);try{await execFileAsync(ffmpegPath(explicit),['-hide_banner','-loglevel','error','-nostdin','-y','-i',input,'-vn','-ac','1','-ar','16000','-sample_fmt','s16','-c:a','flac',flac],{timeout:60000,maxBuffer:1024*1024})}catch(err){const e=new Error(`Не удалось подготовить аудио: ${String(err?.stderr||err?.message||err).slice(0,220)}`);e.code='STT_AUDIO_DECODE';e.status=422;throw e}
 const body=await fs.promises.readFile(flac);const u=new URL(endpoint);u.searchParams.set('client','chromium');u.searchParams.set('lang',language);u.searchParams.set('key',String(key||process.env.GOOGLE_LEGACY_SPEECH_KEY||DEFAULT_GENERIC_KEY));u.searchParams.set('pFilter','0');const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),Math.max(5000,Number(timeoutMs)||45000));let r;try{r=await fetch(u,{method:'POST',headers:{'Content-Type':'audio/x-flac; rate=16000','User-Agent':'Mozilla/5.0'},body,signal:ctrl.signal})}catch(err){const e=new Error(err?.name==='AbortError'?'Сервис распознавания отвечает слишком долго':`Ошибка соединения с распознаванием: ${err?.message||err}`);e.code='STT_PROVIDER_NETWORK';e.status=503;throw e}finally{clearTimeout(timer)}
 const raw=await r.text();if(!r.ok){const e=new Error(`Сервис распознавания вернул HTTP ${r.status}`);e.code='STT_PROVIDER_HTTP';e.status=503;e.details=raw.slice(0,300);throw e}const text=parseGoogleResponse(raw);if(!text){const e=new Error('Речь не удалось распознать');e.code='STT_EMPTY';e.status=422;throw e}return{text,source:'google-speechrecognition'}
 }finally{fs.promises.rm(dir,{recursive:true,force:true}).catch(()=>{})}
}
