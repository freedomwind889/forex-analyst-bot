import { CANCEL_TEXT } from './config.js';
import { mainMenu } from './menus.js';

// --- QUICK REPLY HELPERS (Global Cancel) ---

function ensureQuickReplyLimit(quickReply) {
  if (!quickReply || !Array.isArray(quickReply.items)) return quickReply;
  // LINE Quick Reply supports up to 13 actions
  if (quickReply.items.length <= 13) return quickReply;
  quickReply.items = quickReply.items.slice(0, 13);
  return quickReply;
}

function addCancelQuickReply(quickReply, includeCancel) {
  if (!includeCancel) return quickReply;
  if (!quickReply || !Array.isArray(quickReply.items)) return quickReply;

  const cancelItem = {
    type: "action",
    action: { type: "message", label: "ยกเลิก", text: CANCEL_TEXT }
  };

  // Avoid duplicates
  const hasCancel = quickReply.items.some(it => it?.action?.text === CANCEL_TEXT);
  if (hasCancel) return quickReply;

  if (quickReply.items.length >= 13) {
    // Replace last item to respect LINE limit
    quickReply.items[12] = cancelItem;
  } else {
    quickReply.items.push(cancelItem);
  }
  return quickReply;
}

export function normalizeQuickReply(quickReply) {
  // Cancel must appear in every menu EXCEPT mainMenu
  const includeCancel = Boolean(quickReply) && quickReply !== mainMenu;
  const q = quickReply ? JSON.parse(JSON.stringify(quickReply)) : null; // clone to avoid side effects
  const withCancel = addCancelQuickReply(q, includeCancel);
  return ensureQuickReplyLimit(withCancel);
}

export async function replyText(replyToken, text, env, quickReply = null) {
  const body = {
    replyToken: replyToken,
    messages: [{ type: 'text', text: text }]
  };

  const normalized = normalizeQuickReply(quickReply);
  if (normalized) body.messages[0].quickReply = normalized;

  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`
    },
    body: JSON.stringify(body)
  });
}

export async function getContentFromLine(messageId, env) {
  const url = `https://api-data.line.me/v2/bot/message/${messageId}/content`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` }
  });
  if (!response.ok) throw new Error(`LINE Error: ${response.status}`);

  const contentType = response.headers.get('content-type') || 'image/jpeg';
  const arrayBuffer = await response.arrayBuffer();
  return { arrayBuffer, contentType };
}