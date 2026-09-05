import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

let context = null
let contextModelPath = ''
let contextPromise = null
let activeJobs = 0
let idleTimer = null

function extForMime(mimeType = 'audio/ogg') {
  const m = String(mimeType || '').toLowerCase()
  if (m.includes('mpeg') || m.includes('mp3')) return '.mp3'
  if (m.includes('webm')) return '.webm'
  if (m.includes('wav')) return '.wav'
  if (m.includes('mp4') || m.includes('m4a')) return '.m4a'
  if (m.includes('aac')) return '.aac'
  return '.ogg'
}

function normalizeTranscript(result) {
  let text = ''
  if (typeof result === 'string') text = result
  else if (result && typeof result === 'object') {
    text = String(result.result || result.text || result.transcript || '').trim()
    if (!text && Array.isArray(result.segments)) {
      text = result.segments.map(segment => {
        if (typeof segment === 'string') return segment
        if (Array.isArray(segment)) return segment[2] || segment[1] || segment[0] || ''
        return segment?.text || segment?.speech || segment?.result || ''
      }).map(x => String(x || '').trim()).filter(Boolean).join(' ')
    }
  }
  return String(text || '')
    .replace(/\[(?:BLANK_AUDIO|SOUND|MUSIC|NOISE)\]/gi, ' ')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

async function releaseContext() {
  clearTimeout(idleTimer)
  idleTimer = null
  if (!context || activeJobs > 0) return
  const current = context
  context = null
  contextModelPath = ''
  contextPromise = null
  try { await current.release?.() } catch (err) {
    console.warn('[local-stt] context release:', err?.message || err)
  }
}

function scheduleIdleRelease(ms) {
  clearTimeout(idleTimer)
  const wait = Math.max(60_000, Number(ms || 600_000))
  idleTimer = setTimeout(() => releaseContext().catch(() => {}), wait)
  idleTimer.unref?.()
}

async function ensureContext(modelPath) {
  const resolved = path.resolve(String(modelPath || ''))
  if (!resolved || !fs.existsSync(resolved)) {
    const err = new Error(`Whisper model not found: ${resolved || '(empty path)'}`)
    err.code = 'STT_MODEL_MISSING'
    err.status = 503
    throw err
  }
  if (context && contextModelPath === resolved) return context
  if (contextPromise && contextModelPath === resolved) return contextPromise
  if (context && contextModelPath !== resolved) await releaseContext()

  contextModelPath = resolved
  contextPromise = (async () => {
    let whisper
    try {
      whisper = await import('@fugood/whisper.node')
    } catch (err) {
      const e = new Error(`@fugood/whisper.node is not installed or cannot load: ${err?.message || err}`)
      e.code = 'STT_ENGINE_LOAD'
      e.status = 503
      throw e
    }
    if (typeof whisper.initWhisper !== 'function') {
      const e = new Error('Local Whisper package does not expose initWhisper()')
      e.code = 'STT_ENGINE_LOAD'
      e.status = 503
      throw e
    }
    console.log('[local-stt] loading whisper.cpp model:', resolved)
    const ctx = await whisper.initWhisper({ model: resolved, useGpu: false }, 'default')
    context = ctx
    console.log('[local-stt] model ready')
    return ctx
  })().catch(err => {
    contextPromise = null
    contextModelPath = ''
    throw err
  })
  return contextPromise
}

async function convertToWav(inputPath, outputPath, timeoutMs) {
  const ffmpeg = String(process.env.FFMPEG_PATH || 'ffmpeg')
  try {
    await execFileAsync(ffmpeg, [
      '-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
      '-i', inputPath,
      '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le',
      outputPath,
    ], { timeout: Math.min(Math.max(Number(timeoutMs || 45_000), 10_000), 90_000), maxBuffer: 1024 * 1024 })
  } catch (err) {
    const e = new Error(err?.killed
      ? 'FFmpeg не успел подготовить голосовое для распознавания'
      : `FFmpeg не смог декодировать голосовое: ${String(err?.stderr || err?.message || err).slice(0, 300)}`)
    e.code = 'STT_AUDIO_DECODE'
    e.status = 422
    throw e
  }
}

async function transcribeFileWithTimeout(ctx, wavPath, options, timeoutMs) {
  const operation = ctx.transcribeFile(wavPath, options)
  if (!operation?.promise) {
    const e = new Error('Локальный Whisper не вернул задачу распознавания')
    e.code = 'STT_ENGINE'
    e.status = 503
    throw e
  }

  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(async () => {
      try { await operation.stop?.() } catch {}
      const e = new Error('Локальная расшифровка заняла слишком много времени. Попробуйте ещё раз.')
      e.code = 'STT_TIMEOUT'
      e.status = 504
      reject(e)
    }, Math.max(30_000, Number(timeoutMs || 240_000)))
  })
  try {
    return await Promise.race([operation.promise, timeout])
  } finally {
    clearTimeout(timer)
  }
}

export async function transcribeBuffer(buffer, {
  mimeType = 'audio/ogg',
  modelPath,
  language = 'ru',
  maxThreads = 1,
  timeoutMs = 240_000,
  idleReleaseMs = 600_000,
} = {}) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    const e = new Error('Пустой аудиофайл')
    e.code = 'STT_AUDIO_EMPTY'
    e.status = 400
    throw e
  }

  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'seb-gun-stt-'))
  const inputPath = path.join(tempDir, `voice${extForMime(mimeType)}`)
  const wavPath = path.join(tempDir, 'voice-16k-mono.wav')
  activeJobs += 1
  clearTimeout(idleTimer)
  try {
    await fs.promises.writeFile(inputPath, buffer)
    await convertToWav(inputPath, wavPath, Math.min(60_000, timeoutMs / 3))
    const ctx = await ensureContext(modelPath)
    const result = await transcribeFileWithTimeout(ctx, wavPath, {
      language: String(language || 'ru'),
      temperature: 0,
      maxThreads: Math.min(Math.max(Number(maxThreads || 1), 1), 2),
    }, timeoutMs)
    const text = normalizeTranscript(result)
    if (!text) {
      const e = new Error('Whisper не распознал речь в этом голосовом')
      e.code = 'STT_EMPTY'
      e.status = 422
      throw e
    }
    return { text, raw: result }
  } finally {
    activeJobs = Math.max(0, activeJobs - 1)
    fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {})
    scheduleIdleRelease(idleReleaseMs)
  }
}

export { releaseContext }
