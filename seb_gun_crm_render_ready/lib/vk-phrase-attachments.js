'use strict';

const TYPES = ['photo', 'video', 'audio_message', 'audio', 'doc', 'market', 'wall'];
const TYPE_PART = '(?:photo|video|audio_message|audmsg|audio|doc|market|wall)';
const TOKEN_RE = new RegExp(`(${TYPE_PART})\\s*(-?\\d+)_(\\d+)(?:_([A-Za-z0-9]+))?`, 'gi');

function readable(value) {
  let text = String(value || '').trim();
  for (let i = 0; i < 2; i += 1) {
    try { const decoded = decodeURIComponent(text); if (decoded === text) break; text = decoded; }
    catch { break; }
  }
  return text.replace(/&amp;/gi, '&');
}

function normalizeType(type) {
  return String(type || '').toLowerCase() === 'audmsg' ? 'audio_message' : String(type || '').toLowerCase();
}

function normalizeToken(value, expectedType = '') {
  const text = readable(value).replace(/[\[\]]/g, ' ');
  TOKEN_RE.lastIndex = 0;
  let match;
  while ((match = TOKEN_RE.exec(text))) {
    const type = normalizeType(match[1]);
    if (expectedType && type !== normalizeType(expectedType)) continue;
    return `${type}${match[2]}_${match[3]}${match[4] ? `_${match[4]}` : ''}`;
  }
  return '';
}

function extractAttachments(value, expectedType = '') {
  const text = readable(value);
  const result = [];
  TOKEN_RE.lastIndex = 0;
  let match;
  while ((match = TOKEN_RE.exec(text))) {
    const type = normalizeType(match[1]);
    if (expectedType && type !== normalizeType(expectedType)) continue;
    result.push(`${type}${match[2]}_${match[3]}${match[4] ? `_${match[4]}` : ''}`);
  }
  return [...new Set(result)];
}

function cleanPhraseText(value) {
  const raw = String(value || '').replace(/\r\n/g, '\n');
  return raw.replace(/\[((?:photo|video|audio_message|audmsg|audio|doc|market|wall)\s*-?\d+_\d+(?:_[A-Za-z0-9]+)?)\]/gi, '')
    .replace(/\n{3,}/g, '\n\n').trim();
}

function attachmentsFromPhrase(value) {
  const bracketed = String(value || '').match(/\[(?:photo|video|audio_message|audmsg|audio|doc|market|wall)\s*-?\d+_\d+(?:_[A-Za-z0-9]+)?\]/gi) || [];
  return [...new Set(bracketed.map(item => normalizeToken(item)).filter(Boolean))];
}

module.exports = { TYPES, normalizeToken, extractAttachments, attachmentsFromPhrase, cleanPhraseText };
