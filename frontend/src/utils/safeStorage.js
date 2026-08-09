/**
 * Safe Storage Utility
 * 
 * Wraps localStorage and sessionStorage with full try/catch protection.
 * Falls back to in-memory storage (JS object) when the browser blocks access
 * (e.g., Safari private mode, WKWebView in WhatsApp/Instagram, etc.).
 * 
 * Usage:
 *   import safeStorage from '../utils/safeStorage';
 *   safeStorage.getItem('myKey');
 *   safeStorage.setItem('myKey', 'myValue');
 *   safeStorage.removeItem('myKey');
 *   safeStorage.clear();
 */

// In-memory fallback store
const memoryStore = new Map();

// Detect if a storage type is available
function isStorageAvailable(type) {
  try {
    const storage = window[type];
    const testKey = '__safe_storage_test__';
    storage.setItem(testKey, 'test');
    storage.removeItem(testKey);
    return true;
  } catch (e) {
    return false;
  }
}

// Cache availability checks (they won't change during a session)
const localStorageAvailable = isStorageAvailable('localStorage');
const sessionStorageAvailable = isStorageAvailable('sessionStorage');

const safeStorage = {
  // ── localStorage ──
  getItem(key) {
    try {
      if (localStorageAvailable) {
        return localStorage.getItem(key);
      }
    } catch (e) {
      // Silently fall through to memory
    }
    return memoryStore.get(`local_${key}`) ?? null;
  },

  setItem(key, value) {
    try {
      if (localStorageAvailable) {
        localStorage.setItem(key, value);
        return;
      }
    } catch (e) {
      // Silently fall through to memory
    }
    memoryStore.set(`local_${key}`, value);
  },

  removeItem(key) {
    try {
      if (localStorageAvailable) {
        localStorage.removeItem(key);
      }
    } catch (e) {
      // Silently fall through to memory
    }
    memoryStore.delete(`local_${key}`);
  },

  clear() {
    try {
      if (localStorageAvailable) {
        localStorage.clear();
      }
    } catch (e) {
      // Silently fall through to memory
    }
    // Clear only our keys from memory store
    for (const key of memoryStore.keys()) {
      if (key.startsWith('local_')) {
        memoryStore.delete(key);
      }
    }
  },

  // ── sessionStorage ──
  sessionGetItem(key) {
    try {
      if (sessionStorageAvailable) {
        return sessionStorage.getItem(key);
      }
    } catch (e) {
      // Silently fall through to memory
    }
    return memoryStore.get(`session_${key}`) ?? null;
  },

  sessionSetItem(key, value) {
    try {
      if (sessionStorageAvailable) {
        sessionStorage.setItem(key, value);
        return;
      }
    } catch (e) {
      // Silently fall through to memory
    }
    memoryStore.set(`session_${key}`, value);
  },

  sessionRemoveItem(key) {
    try {
      if (sessionStorageAvailable) {
        sessionStorage.removeItem(key);
      }
    } catch (e) {
      // Silently fall through to memory
    }
    memoryStore.delete(`session_${key}`);
  },

  sessionClear() {
    try {
      if (sessionStorageAvailable) {
        sessionStorage.clear();
      }
    } catch (e) {
      // Silently fall through to memory
    }
    for (const key of memoryStore.keys()) {
      if (key.startsWith('session_')) {
        memoryStore.delete(key);
      }
    }
  },

  // ── Utility: check if real localStorage is available ──
  isLocalStorageAvailable: () => localStorageAvailable,
  isSessionStorageAvailable: () => sessionStorageAvailable,
};

export default safeStorage;