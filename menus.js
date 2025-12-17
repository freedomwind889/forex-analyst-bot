import { CANCEL_TEXT, MAIN_MENU_TEXT } from './config.js';

// --- MENUS ---
export const mainMenu = {
  items: [
    {
      type: "action",
      action: {
        type: "message",
        label: "📊 สถานะข้อมูล",
        text: "STATUS"
      }
    },
    {
      type: "action",
      action: {
        type: "message",
        label: "📌 สรุปผลวิเคราะห์",
        text: "SUMMARY"
      }
    },
    {
      type: "action",
      action: {
        type: "message",
        label: "⚡ เล่นสั้น/สวิง",
        text: "TRADE_STYLE"
      }
    },
    {
      type: "action",
      action: {
        type: "message",
        label: "🔧 แก้ไข/ลบ ข้อมูล",
        text: "MANAGE_DATA"
      }
    }
  ]
};

export const tradeStyleMenu = {
  items: [
    {
      type: "action",
      action: { type: "message", label: "⚡ เล่นสั้น (Scalp)", text: "TRADE_STYLE:SCALP" }
    },
    {
      type: "action",
      action: { type: "message", label: "🌊 เล่นสวิง (Swing)", text: "TRADE_STYLE:SWING" }
    },
    {
      type: "action",
      action: { type: "message", label: "⬅️ กลับเมนูหลัก", text: MAIN_MENU_TEXT }
    }
  ]
};