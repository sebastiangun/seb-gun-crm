import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { Worker } from 'node:worker_threads'
import { createRequire } from 'node:module'

const execFileAsync = promisify(execFile)
const require = createRequire(import.meta.url)
let worker = null
let workerSeq = 0
let pending = new Map()
let idleTimer = null

function extForMime(mimeType='audio/ogg') {
  const m=String(mimeType||'').toLowerCase()
  if(m.includes('mpeg')||m.includes('mp3'))return'.mp3'
  if(m.includes('webm'))return'.webm'
  if(m.includes('wav'))return'.wav'
  if(m.includes('mp4')||m.includes('m4a'))return'.m4a'
  if(m.includes('aac'))return'.aac'
  return'.ogg'
}

function ffmpegPath(explicit='') {
  if (String(explicit||'').trim()) return String(explicit).trim()
  try { return require('ffmpeg-static') || 'ffmpeg' } catch { return 'ffmpeg' }
}

function stopWorker() {
  clearTimeout(idleTimer); idleTimer=null
  const w=worker; worker=null
  if(w)w.terminate().catch(()=>{})
  for(const [,job] of pending){const e=new Error('Whisper worker перезапущен');e.code='STT_WORKER_RESTART';job.reject(e)}
  pending.clear()
}

function scheduleIdle(ms=300000) {
  clearTimeout(idleTimer)
  idleTimer=setTimeout(()=>stopWorker(),Math.max(60000,Number(ms)||300000))
  idleTimer.unref?.()
}

function ensureWorker() {
  if(worker)return worker
  const url=new URL('./transformers-stt-worker.mjs',import.meta.url)
  worker=new Worker(url,{type:'module'})
  worker.on('message',msg=>{const job=pending.get(msg?.id);if(!job)return;pending.delete(msg.id);clearTimeout(job.timer);if(msg.ok)job.resolve(msg);else{const e=new Error(String(msg.error||'Ошибка Whisper worker'));e.code='STT_ENGINE';e.status=503;job.reject(e)}})
  worker.on('error',err=>{console.error('[transformers-stt worker]',err);stopWorker()})
  worker.on('exit',code=>{if(worker){console.warn('[transformers-stt worker] exit',code);stopWorker()}})
  return worker
}

async function runWorker(payload,timeoutMs) {
  const w=ensureWorker(),id=++workerSeq
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{pending.delete(id);stopWorker();const e=new Error('Локальная расшифровка заняла слишком много времени');e.code='STT_TIMEOUT';e.status=504;reject(e)},Math.max(30000,Number(timeoutMs)||300000))
    pending.set(id,{resolve,reject,timer})
    w.postMessage({id,...payload})
  })
}

export async function transcribeBuffer(buffer,{mimeType='audio/ogg',ffmpegPath:explicitFfmpeg='',modelName='onnx-community/whisper-tiny',dtype='q8',language='russian',timeoutMs=300000,idleReleaseMs=300000}={}) {
  if(!Buffer.isBuffer(buffer)||!buffer.length){const e=new Error('Пустой аудиофайл');e.code='STT_AUDIO_EMPTY';e.status=400;throw e}
  clearTimeout(idleTimer)
  const tempDir=await fs.promises.mkdtemp(path.join(os.tmpdir(),'seb-gun-stt-v258-'))
  const input=path.join(tempDir,`voice${extForMime(mimeType)}`),wav=path.join(tempDir,'voice-16k-mono.wav')
  try{
    await fs.promises.writeFile(input,buffer)
    try{
      await execFileAsync(ffmpegPath(explicitFfmpeg),['-hide_banner','-loglevel','error','-nostdin','-y','-i',input,'-vn','-ac','1','-ar','16000','-c:a','pcm_s16le',wav],{timeout:60000,maxBuffer:1024*1024})
    }catch(err){const e=new Error(`FFmpeg не смог подготовить голосовое: ${String(err?.stderr||err?.message||err).slice(0,260)}`);e.code='STT_AUDIO_DECODE';e.status=422;throw e}
    const result=await runWorker({wavPath:wav,modelName,dtype,language},timeoutMs)
    const text=String(result?.text||'').trim()
    if(!text){const e=new Error('Whisper не распознал речь в этом голосовом');e.code='STT_EMPTY';e.status=422;throw e}
    return{text,model:modelName}
  }finally{
    fs.promises.rm(tempDir,{recursive:true,force:true}).catch(()=>{})
    scheduleIdle(idleReleaseMs)
  }
}

export function releaseContext(){stopWorker()}
