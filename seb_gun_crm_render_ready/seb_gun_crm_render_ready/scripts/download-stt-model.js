'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const ROOT = path.resolve(__dirname, '..');
const target = path.resolve(ROOT, process.env.STT_MODEL_PATH || 'models/ggml-tiny-q5_1.bin');
const url = process.env.STT_MODEL_URL || 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny-q5_1.bin?download=true';
// SHA-256 of the actual ggml-tiny-q5_1.bin payload currently published in ggerganov/whisper.cpp.
const expectedSha256 = String(process.env.STT_MODEL_SHA256 || '818710568da3ca15689e31a743197b520007872ff9576237bda97bd1b469c3d7').toLowerCase();

function sha256(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const input = fs.createReadStream(file);
    input.on('error', reject);
    input.on('data', chunk => hash.update(chunk));
    input.on('end', () => resolve(hash.digest('hex')));
  });
}

async function main() {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(target)) {
    const got = await sha256(target);
    if (!expectedSha256 || got === expectedSha256) {
      console.log(`[stt-model] already present: ${target} (${(fs.statSync(target).size / 1024 / 1024).toFixed(1)} MB)`);
      return;
    }
    console.warn(`[stt-model] existing model checksum mismatch (${got}), downloading a clean copy`);
    fs.rmSync(target, { force: true });
  }

  console.log(`[stt-model] downloading multilingual whisper tiny-q5_1 -> ${target}`);
  const response = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'seb_gun-CRM-model-downloader/25.6' } });
  if (!response.ok || !response.body) throw new Error(`model download failed: HTTP ${response.status}`);
  const tmp = `${target}.part`;
  try {
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(tmp));
    const got = await sha256(tmp);
    if (expectedSha256 && got !== expectedSha256) {
      throw new Error(`model SHA-256 mismatch: expected ${expectedSha256}, got ${got}`);
    }
    fs.renameSync(tmp, target);
    console.log(`[stt-model] ready: ${(fs.statSync(target).size / 1024 / 1024).toFixed(1)} MB, sha256=${got}`);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}

main().catch(err => {
  console.error('[stt-model]', err?.stack || err);
  process.exit(1);
});
