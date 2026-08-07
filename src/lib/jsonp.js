/**
 * JSONP + fetch helpers.
 *
 * Land Master has no backend, so every request leaves the browser directly and
 * is subject to the target's CORS policy:
 *
 *   - Census Geocoder  -> sends NO CORS headers. `fetch` is impossible from a
 *                         static origin. It does support `format=jsonp&callback=`,
 *                         and a <script> tag is not subject to CORS, so JSONP is
 *                         the only way in. See `census.js`.
 *   - ArcGIS (TIGERweb, FEMA NFHL) -> sends `Access-Control-Allow-Origin: *`,
 *                         so plain `fetch` works. They also support `callback=`,
 *                         so `fetchJsonWithJsonpFallback` can transparently
 *                         downgrade if a CORS error ever appears from a new origin.
 */

/** Milliseconds before a JSONP request is considered dead. */
const JSONP_TIMEOUT_MS = 20000;

let callbackSeq = 0;

/**
 * Append params to a URL. `URLSearchParams` percent-encodes values for us,
 * which is what keeps the FEMA geometry JSON (`{"x":…,"y":…}`) legal in a query
 * string without hand-rolled escaping.
 *
 * Null/undefined/empty values are dropped so callers can pass sparse objects.
 */
export function buildUrl(base, params = {}) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export class HttpError extends Error {
  constructor(message, { code = 'HTTP_ERROR', cause } = {}) {
    super(message);
    this.name = 'HttpError';
    this.code = code;
    if (cause) this.cause = cause;
  }
}

/**
 * Fetch JSON by injecting a <script> that calls a unique global callback.
 *
 * Resolves with the parsed payload. Rejects on script error (bad host, blocked
 * request, malformed response) or timeout. Always cleans up the global and the
 * <script> node, including on abort, so repeated lookups don't leak.
 */
export function jsonp(base, params = {}, options = {}) {
  const { callbackParam = 'callback', timeout = JSONP_TIMEOUT_MS, signal } = options;

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new HttpError('Request aborted', { code: 'ABORTED' }));
      return;
    }

    const callbackName = `__landMasterJsonp_${Date.now().toString(36)}_${(callbackSeq++).toString(36)}`;
    const script = document.createElement('script');
    let settled = false;
    let timer = null;

    const cleanup = () => {
      if (timer !== null) clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      try {
        delete window[callbackName];
      } catch {
        window[callbackName] = undefined;
      }
      script.onerror = null;
      if (script.parentNode) script.parentNode.removeChild(script);
    };

    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn(value);
    };

    function onAbort() {
      settle(reject, new HttpError('Request aborted', { code: 'ABORTED' }));
    }

    // The remote script calls this by name; that call is what delivers the data.
    window[callbackName] = (data) => settle(resolve, data);

    script.onerror = () =>
      settle(reject, new HttpError(`JSONP request failed: ${base}`, { code: 'NETWORK' }));

    timer = setTimeout(
      () => settle(reject, new HttpError(`JSONP request timed out after ${timeout}ms`, { code: 'TIMEOUT' })),
      timeout,
    );

    signal?.addEventListener('abort', onAbort);

    script.src = buildUrl(base, { ...params, [callbackParam]: callbackName });
    script.async = true;
    document.head.appendChild(script);
  });
}

/** Plain CORS `fetch` returning parsed JSON, with ArcGIS error bodies surfaced. */
export async function fetchJson(base, params = {}, options = {}) {
  const { signal } = options;
  const url = buildUrl(base, params);

  let response;
  try {
    response = await fetch(url, { method: 'GET', signal, mode: 'cors' });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new HttpError('Request aborted', { code: 'ABORTED', cause: error });
    }
    // A CORS rejection is indistinguishable from a network failure here; both
    // arrive as TypeError. Tag it so callers know a JSONP retry may help.
    throw new HttpError(`Network or CORS failure: ${base}`, { code: 'NETWORK', cause: error });
  }

  if (!response.ok) {
    throw new HttpError(`HTTP ${response.status} from ${base}`, { code: `HTTP_${response.status}` });
  }

  const payload = await response.json();
  assertNoArcgisError(payload, base);
  return payload;
}

/**
 * Try CORS `fetch`; on a network/CORS failure, retry the same request as JSONP.
 *
 * ArcGIS currently sends permissive CORS headers, so the fallback should never
 * fire — it exists because a policy change on FEMA's or Census's side would
 * otherwise take the whole static app down with no server to patch around it.
 */
export async function fetchJsonWithJsonpFallback(base, params = {}, options = {}) {
  try {
    return await fetchJson(base, params, options);
  } catch (error) {
    if (error?.code !== 'NETWORK') throw error;
    // `f=geojson` is not valid for JSONP responses on ArcGIS; it only wraps
    // `f=json` (or `f=pjson`). Downgrade the format and let callers normalize.
    const jsonpParams = { ...params };
    if (jsonpParams.f === 'geojson') jsonpParams.f = 'json';
    const payload = await jsonp(base, jsonpParams, options);
    assertNoArcgisError(payload, base);
    return { ...payload, __viaJsonpFallback: true };
  }
}

/** ArcGIS answers with HTTP 200 and an `error` object; turn that into a throw. */
function assertNoArcgisError(payload, base) {
  if (payload && typeof payload === 'object' && payload.error) {
    const { message, details, code } = payload.error;
    const detail = Array.isArray(details) && details.length ? ` (${details.join('; ')})` : '';
    throw new HttpError(`${message || 'Service error'}${detail} — ${base}`, {
      code: `ARCGIS_${code || 'ERROR'}`,
    });
  }
}
