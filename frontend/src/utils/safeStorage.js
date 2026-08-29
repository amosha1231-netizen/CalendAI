/**
 * Safe Storage Utility
 * 
 * Wraps localStorage with full try/catch protection.
 * ALWAYS tries real localStorage first on every operation.
 * Falls back to in-memory storage ONLY when the browser blocks access
 * (e.g., Safari private mode, WKWebView in WhatsApp/Instagram, etc.).
 * 
 * In Capacitor (iOS/Android), localStorage works natively through WebView
 * and persists across app restarts, so no special handling is needed.
 * 
 * Usage:
 *   import safeStorage from '../utils/safeStorage';
 *   safeStorage.getItem('myKey');
 *   safeStorage.setItem('myKey', 'myValue');
 *   safeStorage.removeItem('myKey');
 *   safeStorage.clear();
 */

// In-memory fallback store (used only when localStorage throws)
const memoryStore = new Map();

const safeStorage = {
  // ── localStorage ──
  // Always tries real localStorage first. Falls to memory ONLY on exception.
  getItem(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      // localStorage unavailable (private mode, etc.) → fall back to memory
      return memoryStore.get(key) ?? null;
    }
  },

  setItem(key, value) {
    try {
      localStorage.setItem(key, value);
      return;
    } catch (e) {
      // localStorage unavailable → store in memory
    }
    memoryStore.set(key, value);
  },

  removeItem(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      // localStorage unavailable
    }
    memoryStore.delete(key);
  },

  clear() {
    try {
      localStorage.clear();
    } catch (e) {
      // localStorage unavailable
    }
    memoryStore.clear();
  },

  // ── sessionStorage ──
  sessionGetItem(key) {
    try {
      return sessionStorage.getItem(key);
    } catch (e) {
      return memoryStore.get(`session_${key}`) ?? null;
    }
  },

  sessionSetItem(key, value) {
    try {
      sessionStorage.setItem(key, value);
      return;
    } catch (e) {
      // sessionStorage unavailable → store in memory
    }
    memoryStore.set(`session_${key}`, value);
  },

  sessionRemoveItem(key) {
    try {
      sessionStorage.removeItem(key);
    } catch (e) {
      // sessionStorage unavailable
    }
    memoryStore.delete(`session_${key}`);
  },

  sessionClear() {
    try {
      sessionStorage.clear();
    } catch (e) {
      // sessionStorage unavailable
    }
    for (const key of memoryStore.keys()) {
      if (key.startsWith('session_')) {
        memoryStore.delete(key);
      }
    }
  },

  // ── Utility: check if real localStorage is available ──
  isLocalStorageAvailable: () => {
    try {
      localStorage.setItem('__safe_storage_test__', '1');
      localStorage.removeItem('__safe_storage_test__');
      return true;
    } catch (e) {
      return false;
    }
  },
  isSessionStorageAvailable: () => {
    try {
      sessionStorage.setItem('__safe_storage_test__', '1');
      sessionStorage.removeItem('__safe_storage_test__');
      return true;
    } catch (e) {
      return false;
    }
  },

  // ── Capacitor Persistent Sync (optional enhancement) ──
  // On Capacitor (iOS/Android), localStorage persists naturally in WebView.
  // @capacitor/preferences can be used as an additional backup layer.
  // Call this to migrate any existing data to Capacitor Preferences.
  async syncToCapacitor() {
    try {
      const { Preferences } = await import('@capacitor/preferences');
      const keys = Object.keys(localStorage);
      for (const key of keys) {
        const value = localStorage.getItem(key);
        if (value !== null) {
          await Preferences.set({ key, value });
        }
      }
    } catch (e) {
      // Not running in Capacitor or @capacitor/preferences not installed
    }
  },

  // Restore data from Capacitor Preferences to localStorage (if localStorage is empty)
  async restoreFromCapacitor() {
    try {
      const { Preferences } = await import('@capacitor/preferences');
      const { keys } = await Preferences.keys();
      for (const key of keys) {
        if (!localStorage.getItem(key)) {
          const { value } = await Preferences.get({ key });
          if (value !== null) {
            try {
              localStorage.setItem(key, value);
            } catch (e) {
              memoryStore.set(key, value);
            }
          }
        }
      }
    } catch (e) {
      // Not running in Capacitor or @capacitor/preferences not installed
    }
  },

  // Detect if running inside Capacitor native wrapper
  isCapacitorNative: () => {
    return typeof window !== 'undefined' && 
           window.Capacitor && 
           window.Capacitor.isNative;
  }
};

export default safeStorage;