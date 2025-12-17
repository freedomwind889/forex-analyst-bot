// --- CONFIGURATION ---

// ระยะเวลาหมดอายุของข้อมูลแต่ละ TF (Milliseconds)
export const TF_VALIDITY_MS = {
  'M1': 1 * 60 * 1000,          // 1 Minute
  'M5': 5 * 60 * 1000,          // 5 Minutes
  'M15': 15 * 60 * 1000,        // 15 Minutes
  'M30': 30 * 60 * 1000,        // 30 Minutes
  'H1': 60 * 60 * 1000,         // 1 Hour
  'H4': 4 * 60 * 60 * 1000,     // 4 Hours
  '1D': 24 * 60 * 60 * 1000,    // 1 Day
  'D1': 24 * 60 * 60 * 1000,    // Alias for 1D
  '1W': 7 * 24 * 60 * 60 * 1000 // 1 Week
};

export const TF_ORDER = ['1W', '1D', 'H4', 'H1', 'M30', 'M15', 'M5', 'M1'];

export const PARENT_TF_MAP = {
  'M1':  ['M5', 'M15', 'H1', 'H4'],
  'M5':  ['M15', 'H1', 'H4'],
  'M15': ['H1', 'H4', '1D'],
  'M30': ['H1', 'H4', '1D'],
  'H1':  ['H4', '1D'],
  'H4':  ['1D', '1W'],
  '1D':  ['1W'],
  'D1':  ['1W'], // alias
  '1W':  []
};

export const CANCEL_TEXT = 'CANCEL';
export const MAIN_MENU_TEXT = 'MAIN_MENU';