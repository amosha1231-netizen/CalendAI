/**
 * Siri inside the iPhone app ("Hey Siri, add an event in CalendAI").
 *
 * The Siri action itself is native (ios/App/App/SiriIntents.swift). It needs a
 * personal key to call the backend, so after sign-in we ask the server for a
 * device key (/api/siri/app-key) and hand it to the native side, which keeps it
 * in the Keychain. Nothing for the user to set up.
 *
 * Everything here is lazy and wrapped in try/catch: on the web, on Android and
 * in older app builds without the plugin, every function quietly does nothing.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import safeStorage from './safeStorage';

const API_BASE = import.meta.env.VITE_API_URL || '';

let plugin = null;
function getPlugin() {
  if (!plugin) plugin = registerPlugin('CalendAISiri');
  return plugin;
}

export function isNativeSiriAvailable() {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
  } catch (e) {
    return false;
  }
}

function authHeaders() {
  try {
    const token = safeStorage.getItem('token') || safeStorage.getItem('calendai-jwt');
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch (e) {
    return {};
  }
}

/** { hasKey, userId } for this device, or null when Siri is not available here. */
export async function getNativeSiriStatus() {
  if (!isNativeSiriAvailable()) return null;
  try {
    return await getPlugin().status();
  } catch (e) {
    return null;
  }
}

/**
 * Make sure this device's Siri action is connected to the signed-in account.
 * Returns true when Siri is ready. `force` makes a fresh key even if one exists.
 */
export async function ensureNativeSiri(userId, { force = false } = {}) {
  if (!isNativeSiriAvailable() || !userId) return false;
  try {
    const status = await getPlugin().status();
    if (!force && status?.hasKey && status.userId === String(userId)) return true;

    const res = await fetch(`${API_BASE}/api/siri/app-key`, {
      method: 'POST',
      credentials: 'include',
      headers: authHeaders()
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (!data?.key || !data?.endpoint) return false;
    await getPlugin().setKey({ key: data.key, endpoint: data.endpoint, userId: String(data.userId || userId) });
    return true;
  } catch (e) {
    console.warn('[Siri] Could not connect Siri on this device:', e?.message || e);
    return false;
  }
}

/** On sign-out: forget the device key and revoke it (call while the login token still exists). */
export async function clearNativeSiri() {
  if (!isNativeSiriAvailable()) return;
  try {
    const { key } = (await getPlugin().clearKey()) || {};
    if (!key) return;
    await fetch(`${API_BASE}/api/siri/app-key`, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ key })
    }).catch(() => {});
  } catch (e) {
    // Older app build without the plugin, or offline: nothing to clean up.
  }
}
