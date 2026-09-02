import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parentPort } from 'node:worker_threads'

let transcriberPromise = null
let loadedModel = ''
let loadedDtype = ''

function readPcm16MonoWav(filePath) {
  const buf = fs.readFileSync(filePath)
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Whisper worker получил некорректный WAV')
  }
  let offset = 12, fmt = null, dataOffset = 0, dataSize = 0
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4)
    const size = buf.readUInt32LE(offset + 4)
    const start = offset + 8
    if (id === 'fmt ' && size >= 16) {
      fmt = {
        format: buf.readUInt16LE(start),
        channels: buf.readUInt16LE(start + 2),
        sampleRate: buf.readUInt32LE(start + 4),
        bits: buf.readUInt16LE(start + 14),
      }
    } else if (id === 'data') {
      dataOffset = start; dataSize = Math.min(size, buf.length - start); break
    }
    offset = start + size + (size % 2)
  }
  if (!fmt || !dataOffset || fmt.format !== 1 || fmt.channels !== 1 || fmt.bits !== 16 || fmt.sampleRate !== 16000) {
    throw new Error(`Ожидался PCM WAV 16 kHz mono 16-bit, получено ${JSON.stringify(fmt)}`)
  }
  const samples = Math.floor(dataSize / 2)
  const audio = new Float32Array(samples)
  for (let i = 0; i < samples; i++) audio[i] = Math.max(-1, Math.min(1, buf.readInt16LE(dataOffset + i * 2) / 32768))
  return audio
}

async function getTranscriber(modelName, dtype = 'q8') {
  if (transcriberPromise && loadedModel === modelName && loadedDtype === dtype) return transcriberPromise
  loadedModel = modelName; loadedDtype = dtype
  transcriberPromise = (async () => {
    const { pipeline, env } = await import('@huggingface/transformers')
    env.allowRemoteModels = true
    env.cacheDir = process.env.TRANSFORMERS_CACHE_DIR || path.join(os.tmpdir(), 'seb-gun-transformers-cache')
    console.log('[transformers-stt] loading', modelName, 'dtype=', dtype, 'cache=', env.cacheDir)
    try {
      const pipe = await pipeline('automatic-speech-recognition', modelName, { dtype })
      console.log('[transformers-stt] model ready')
      return pipe
    } catch (err) {
      console.warn('[transformers-stt] q8 init failed, retrying default dtype:', err?.message || err)
      const pipe = await pipeline('automatic-speech-recognition', modelName)
      console.log('[transformers-stt] model ready with default dtype')
      return pipe
    }
  })().catch(err => { transcriberPromise = null; loadedModel = ''; loadedDtype = ''; throw err })
  return transcriberPromise
}

parentPort.on('message', async msg => {
  const id = msg?.id
  try {
    const audio = readPcm16MonoWav(msg.wavPath)
    const transcriber = await getTranscriber(String(msg.modelName || 'onnx-community/whisper-tiny'), String(msg.dtype || 'q8'))
    const options = {
      task: 'transcribe',
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: false,
    }
    const language = String(msg.language || '').trim()
    if (language) options.language = language
    const output = await transcriber(audio, options)
    const text = String(output?.text || output || '').replace(/\s+/g, ' ').trim()
    parentPort.postMessage({ id, ok: true, text })
  } catch (err) {
    parentPort.postMessage({ id, ok: false, error: String(err?.stack || err?.message || err) })
  }
})
