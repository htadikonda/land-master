import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';

import { jsonp } from '../src/lib/jsonp.js';

/**
 * Minimal DOM stand-in.
 *
 * The JSONP helper only needs `document.createElement`, `document.head` and a
 * global to hang the callback on — so a tiny fake exercises the real code path
 * (script injection, callback invocation, cleanup) without a browser.
 */
function installFakeDom({ respond = 'success', delay = 0 } = {}) {
  const scripts = [];
  const timers = [];

  const head = {
    children: [],
    appendChild(node) {
      this.children.push(node);
      node.parentNode = head;
      scripts.push(node);

      const timer = setTimeout(() => {
        if (respond === 'success') {
          const url = new URL(node.src);
          const callbackName = url.searchParams.get('callback');
          globalThis.window[callbackName]?.({ ok: true, echoed: url.searchParams.get('q') });
        } else if (respond === 'error') {
          node.onerror?.(new Error('script load failed'));
        }
        // respond === 'never' leaves the request hanging, for the timeout test.
      }, delay);
      timers.push(timer);
    },
    removeChild(node) {
      this.children = this.children.filter((child) => child !== node);
      node.parentNode = null;
    },
  };

  globalThis.document = {
    head,
    createElement() {
      return { src: '', async: false, onerror: null, parentNode: null };
    },
  };
  globalThis.window = globalThis;

  // Pending fake responses must be cancellable: an aborted request leaves one
  // queued, and letting it fire after the DOM is torn down is a test artifact,
  // not a product failure.
  const dispose = () => timers.forEach(clearTimeout);
  activeDom = { dispose };

  return { scripts, head, dispose };
}

let originalDocument;
let originalWindow;
let activeDom = null;

beforeEach(() => {
  originalDocument = globalThis.document;
  originalWindow = globalThis.window;
});

afterEach(() => {
  activeDom?.dispose();
  activeDom = null;
  globalThis.document = originalDocument;
  globalThis.window = originalWindow;
});

test('jsonp resolves with the payload the injected script hands back', async () => {
  const { scripts, head } = installFakeDom();

  const result = await jsonp('https://geocoding.geo.census.gov/geocoder/geographies/address', {
    q: 'hello',
    format: 'jsonp',
  });

  assert.deepEqual(result, { ok: true, echoed: 'hello' });

  // A unique callback name went out on the query string...
  const url = new URL(scripts[0].src);
  assert.match(url.searchParams.get('callback'), /^__landMasterJsonp_/);
  assert.equal(url.searchParams.get('format'), 'jsonp');

  // ...and both the script node and the global were cleaned up afterwards.
  assert.equal(head.children.length, 0);
  assert.equal(globalThis.window[url.searchParams.get('callback')], undefined);
});

test('each call uses a distinct callback name', async () => {
  const { scripts } = installFakeDom();
  await Promise.all([jsonp('https://example.test/a'), jsonp('https://example.test/b')]);
  const names = scripts.map((script) => new URL(script.src).searchParams.get('callback'));
  assert.equal(new Set(names).size, 2);
});

test('a script error rejects with a NETWORK code and still cleans up', async () => {
  const { head } = installFakeDom({ respond: 'error' });

  await assert.rejects(jsonp('https://example.test/boom'), (error) => {
    assert.equal(error.code, 'NETWORK');
    return true;
  });
  assert.equal(head.children.length, 0);
});

test('a hung request times out rather than leaking', async () => {
  const { head } = installFakeDom({ respond: 'never' });

  await assert.rejects(jsonp('https://example.test/hang', {}, { timeout: 20 }), (error) => {
    assert.equal(error.code, 'TIMEOUT');
    return true;
  });
  assert.equal(head.children.length, 0);
});

test('an aborted request rejects and removes its script', async () => {
  const { head } = installFakeDom({ respond: 'success', delay: 50 });
  const controller = new AbortController();

  const pending = jsonp('https://example.test/slow', {}, { signal: controller.signal });
  controller.abort();

  await assert.rejects(pending, (error) => {
    assert.equal(error.code, 'ABORTED');
    return true;
  });
  assert.equal(head.children.length, 0);
});
