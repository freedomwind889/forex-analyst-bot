import { TF_VALIDITY_MS, TF_ORDER, PARENT_TF_MAP } from './config.js';

// --- HELPER: Signature Verification & Utils ---

export async function verifyLineSignature(body, signature, secret) {
  if (!signature) return false;
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const key = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const bodyData = encoder.encode(body);
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, bodyData);
  const signatureArray = Array.from(new Uint8Array(signatureBuffer));
  const calculatedSignature = btoa(String.fromCharCode.apply(null, signatureArray));
  return calculatedSignature === signature;
}

export function getModelId(env) {
  // Normalize Model ID: remove 'models/' prefix if present
  const rawId = env.MODEL_ID || 'gemma-3-27b-it';
  return rawId.replace(/^models\//, '');
}

export function redactSecrets(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  const redacted = { ...obj };
  const secrets = ['gemini_api_key', 'line_channel_access_token', 'line_channel_secret', 'authorization'];

  for (const key in redacted) {
    if (secrets.some(s => key.toLowerCase().includes(s))) {
      redacted[key] = '[REDACTED]';
    } else if (typeof redacted[key] === 'object') {
      redacted[key] = redactSecrets(redacted[key]);
    }
  }
  return redacted;
}

export function safeError(err) {
  // Return error string without potentially sensitive stack traces if needed, or just standard logging
  // Here we just ensure it's a string and maybe add a tag
  return `[ERROR] ${err.toString()}`;
}

export function normalizeTF(tf) {
  if (!tf) return null;
  const t = String(tf).trim().toUpperCase();

  // Canonicalize common aliases
  if (t === 'D1') return '1D'; // REQUIREMENT: D1/1D -> store as 1D only
  if (t === 'DAY') return '1D';
  if (t === 'WEEK') return '1W';
  if (t === 'HOUR') return 'H1';

  // Keep only known TFs if possible
  if (TF_VALIDITY_MS[t]) return t;
  return t; // fall back (still stored), but may be "Unknown_TF"
}

export function inferLikelyCurrentTF(existingRows) {
  if (!Array.isArray(existingRows) || existingRows.length === 0) return null;
  const sorted = [...existingRows].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  return normalizeTF(sorted[0]?.tf);
}

export function selectSmartContextRows(validRows, likelyTf) {
  if (!Array.isArray(validRows) || validRows.length === 0) return [];
  const tfSet = new Set();

  if (likelyTf && PARENT_TF_MAP[likelyTf]) {
    for (const p of PARENT_TF_MAP[likelyTf]) tfSet.add(normalizeTF(p));
  } else {
    // Fallback: prefer HTF chain for safe Top-Down calls
    ['1D', 'H4', 'H1', 'M15'].forEach(t => tfSet.add(t));
  }

  // Only include TFs that exist in validRows
  const selected = validRows.filter(r => tfSet.has(normalizeTF(r.tf)));

  // If nothing matched, return the most recent 3 rows (least noise, still helpful)
  if (selected.length === 0) {
    return [...validRows].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 3);
  }

  // Keep a stable order by TF hierarchy (HTF -> LTF)
  selected.sort((a, b) => TF_ORDER.indexOf(normalizeTF(a.tf)) - TF_ORDER.indexOf(normalizeTF(b.tf)));
  return selected;
}

export class TimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TimeoutError';
  }
}

export function promiseWithTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(`Timeout after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function safeParseJsonLoosely(rawText) {
  if (!rawText) throw new Error('Empty AI response text');
  // Remove markdown fences if present
  const cleaned = String(rawText).replace(/```json/gi, '```').replace(/```/g, '').trim();
  // Attempt to extract the first top-level JSON object
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object found in AI response');
  }
  const candidate = cleaned.slice(start, end + 1).trim();
  return JSON.parse(candidate);
}

export function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}