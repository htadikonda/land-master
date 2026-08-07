import { useCallback, useMemo, useState } from 'react';
import { BUILD_API_KEY } from '../lib/env.js';
import {
  clearStoredKey,
  normalizeKey,
  readStoredKey,
  resolveApiKey,
  writeStoredKey,
} from '../lib/apiKey.js';

/** localStorage access throws outright in some privacy modes. */
function getStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Owns the Maps API key: what it is, where it came from, and how to change it.
 *
 * The Maps JavaScript API can only be loaded once per page, and the key is
 * baked into that script URL — so swapping keys on a live page is impossible.
 * Any change that would need a different script triggers a reload instead of
 * pretending to hot-swap.
 */
export function useApiKey() {
  const [stored, setStored] = useState(() => readStoredKey(getStorage()));
  const [persistFailed, setPersistFailed] = useState(false);

  const resolved = useMemo(
    () => resolveApiKey({ stored, build: BUILD_API_KEY }),
    [stored],
  );

  const saveKey = useCallback((value) => {
    const next = normalizeKey(value);
    const mapsAlreadyLoaded = Boolean(window.google?.maps);

    setPersistFailed(!writeStoredKey(getStorage(), next));
    setStored(next);

    if (mapsAlreadyLoaded) window.location.reload();
  }, []);

  const forgetKey = useCallback(() => {
    const mapsAlreadyLoaded = Boolean(window.google?.maps);

    clearStoredKey(getStorage());
    setStored('');

    if (mapsAlreadyLoaded) window.location.reload();
  }, []);

  return {
    apiKey: resolved.key,
    source: resolved.source,
    hasBuildKey: Boolean(normalizeKey(BUILD_API_KEY)),
    // True when the key is live for this tab only — storage refused to keep it.
    persistFailed,
    saveKey,
    forgetKey,
  };
}
