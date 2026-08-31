import { parentPort } from 'node:worker_threads';
import os from 'node:os';
import path from 'node:path';
import decode from 'audio-decode';
import { pipeline, env } from '@huggingface/transformers';

const MODEL = String(process.env.LOCAL_STT_MODEL || 'Xenova/whisper-tiny').trim();
const DTYPE = String(process.env.LOCAL_STT_DTYPE || 'q8').trim();
const LANGUAGE = String(process.env.LOCAL_STT_LANGUAGE || 'russian').trim();
const CACHE_DIR = String(process.env.LOCAL_STT_CACHE_DIR || path.join(os.tmpdir(), 'seb-gun-transformers-cache')).trim();

env.cacheDir = CACHE_DIR;
let transcriberPromise = null;

async function getTranscriber() {
  if (!transcriberPromise) {
    transcriberPromise = pipeline('automatic-speech-recognition', MODEL, { dtype: DTYPE })
      .catch(err => { transcriberPromise = null; throw err; });
  }
  return transcriberPromise;
}

function monoFromDecoded(decoded) {
  const sampleRate = Number(decoded?.sampleRate || 0);
  if (!sampleRate) throw new Error('Не удалось определить частоту аудио');
  let channels = [];
  if (Array.isArray(decoded?.channelData)) channels = decoded.channelData;
  else if (decoded?.channelData && typeof decoded.channelData.length === 'number') channels = Array.from(decoded.channelData);
  else if (typeof decoded?.getChannelData === 'function') {
    const count = Math.max(1, Number(decoded.numberOfChannels || 1));
    channels = Array.from({ length: count }, (_, i) => decoded.getChannelData(i));
  }
  channels = channels.filter(Boolean);
  if (!channels.length) throw new Error('Аудиодекодер не вернул звуковые данные');
  const len = Math.min(...channels.map(x => x.length));
  const mono = new Float32Array(len);
  if (channels.length === 1) mono.set(channels[0].subarray ? channels[0].subarray(0, len) : channels[0]);
  else {
    for (let i = 0; i < len; i++) {
      let sum = 0;
      for (const ch of channels) sum += Number(ch[i] || 0);
      mono[i] = sum / channels.length;
    }
  }
  return { samples: mono, sampleRate };
}

function resampleLinear(input, fromRate, toRate = 16000) {
  if (fromRate === toRate) return input;
  const outLen = Math.max(1, Math.round(input.length * toRate / fromRate));
  const out = new Float32Array(outLen);
  const ratio = fromRate / toRate;
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const a = Math.floor(pos), b = Math.min(input.length - 1, a + 1), t = pos - a;
    out[i] = input[a] * (1 - t) + input[b] * t;
  }
  return out;
}

async function transcribe(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const decoded = await decode(bytes);
  const mono = monoFromDecoded(decoded);
  const audio = resampleLinear(mono.samples, mono.sampleRate, 16000);
  const transcriber = await getTranscriber();
  const options = {
    task: 'transcribe',
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: false,
  };
  if (LANGUAGE) options.language = LANGUAGE;
  const result = await transcriber(audio, options);
  const text = String(result?.text || '').trim();
  if (!text) throw new Error('Whisper вернул пустую расшифровку');
  return text;
}

parentPort.on('message', async msg => {
  const id = Number(msg?.id || 0);
  try {
    if (!id || !msg?.audio) throw new Error('Нет аудио для расшифровки');
    const text = await transcribe(msg.audio);
    parentPort.postMessage({ id, ok: true, text, model: MODEL });
  } catch (err) {
    parentPort.postMessage({ id, ok: false, error: String(err?.message || err), model: MODEL });
  }
});
