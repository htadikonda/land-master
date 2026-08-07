/**
 * Google Maps API key handling.
 *
 * The key can come from two places, in this order:
 *
 *   1. A key the visitor typed into the app, kept in localStorage on their own
 *      machine. This is what lets the site be deployed with no secret at all —
 *      each visitor brings their own key.
 *   2. `VITE_GOOGLE_MAPS_API_KEY`, inlined at build time.
 *
 * A typed key wins, so a visitor can override a shared build-time key with
 * their own without touching the deployment.
 *
 * Every function here is pure or takes its storage as an argument, so the
 * precedence rules can be tested without a browser.
 */

export const STORAGE_KEY = 'land-master:google-maps-api-key';

export function normalizeKey(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Mask a key for display. Enough characters to recognise which key is in use,
 * not enough to read it over someone's shoulder.
 */
export function maskKey(value) {
  const key = normalizeKey(value);
  if (!key) return '';
  if (key.length <= 12) return `${key.slice(0, 2)}…${key.slice(-2)}`;
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

/**
 * Cheap sanity checks before we bother loading the Maps script.
 *
 * Deliberately permissive: this catches the common paste mistakes (empty,
 * wrapped in quotes, a whole URL, a client ID) without rejecting a key whose
 * format Google may change. Anything that passes here is still only confirmed
 * valid when the Maps script actually loads.
 */
export function validateKey(value) {
  const key = normalizeKey(value);

  if (!key) return { ok: false, error: 'Paste your Google Maps browser key to continue.' };
  if (/\s/.test(key)) {
    return { ok: false, error: 'That contains a space — check for extra characters in the paste.' };
  }
  if (/^["']|["']$/.test(key)) {
    return { ok: false, error: 'Drop the surrounding quotes — paste the key on its own.' };
  }
  if (key.includes('://') || key.includes('maps.googleapis.com')) {
    return { ok: false, error: 'That looks like a URL. Paste just the key itself.' };
  }
  if (key.length < 20) return { ok: false, error: 'That looks too short for a Google Maps key.' };

  return {
    ok: true,
    // Not fatal — Google is free to change the prefix — but wrong-credential
    // pastes are common enough to be worth calling out.
    warning: key.startsWith('AIza')
      ? null
      : 'Browser keys normally start with "AIza". Double-check you copied the API key and not an OAuth client ID.',
  };
}

export function readStoredKey(storage) {
  try {
    return normalizeKey(storage?.getItem(STORAGE_KEY));
  } catch {
    // Private browsing and blocked-storage modes throw on access.
    return '';
  }
}

export function writeStoredKey(storage, value) {
  try {
    storage?.setItem(STORAGE_KEY, normalizeKey(value));
    return true;
  } catch {
    return false;
  }
}

export function clearStoredKey(storage) {
  try {
    storage?.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Apply the precedence rules. `source` drives what the UI tells the user. */
export function resolveApiKey({ stored, build } = {}) {
  const typed = normalizeKey(stored);
  if (typed) return { key: typed, source: 'stored' };

  const baked = normalizeKey(build);
  if (baked) return { key: baked, source: 'build' };

  return { key: '', source: 'none' };
}
