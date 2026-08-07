import assert from 'node:assert/strict';
import test from 'node:test';

import {
  STORAGE_KEY,
  clearStoredKey,
  maskKey,
  normalizeKey,
  readStoredKey,
  resolveApiKey,
  validateKey,
  writeStoredKey,
} from '../src/lib/apiKey.js';

const GOOD_KEY = 'AIzaSyD-ExampleExampleExampleExample123';

/** Stand-in for localStorage; `throws` models private-mode browsers. */
function fakeStorage({ throws = false, initial = {} } = {}) {
  const data = { ...initial };
  const guard = () => {
    if (throws) throw new DOMException('storage disabled');
  };
  return {
    data,
    getItem(key) {
      guard();
      return key in data ? data[key] : null;
    },
    setItem(key, value) {
      guard();
      data[key] = String(value);
    },
    removeItem(key) {
      guard();
      delete data[key];
    },
  };
}

test('a key typed by the visitor beats the build-time key', () => {
  assert.deepEqual(resolveApiKey({ stored: 'typed-key-value', build: 'baked-key-value' }), {
    key: 'typed-key-value',
    source: 'stored',
  });
});

test('the build-time key is used when nothing was typed', () => {
  assert.deepEqual(resolveApiKey({ stored: '', build: 'baked-key-value' }), {
    key: 'baked-key-value',
    source: 'build',
  });
  assert.deepEqual(resolveApiKey({ stored: '   ', build: 'baked-key-value' }), {
    key: 'baked-key-value',
    source: 'build',
  });
});

test('with neither key the source is none, so the gate is shown', () => {
  assert.deepEqual(resolveApiKey({}), { key: '', source: 'none' });
  assert.deepEqual(resolveApiKey({ stored: '', build: '' }), { key: '', source: 'none' });
});

test('keys round-trip through storage and are trimmed on the way in', () => {
  const storage = fakeStorage();

  assert.equal(writeStoredKey(storage, `  ${GOOD_KEY}  `), true);
  assert.equal(storage.data[STORAGE_KEY], GOOD_KEY);
  assert.equal(readStoredKey(storage), GOOD_KEY);

  assert.equal(clearStoredKey(storage), true);
  assert.equal(readStoredKey(storage), '');
});

test('storage that throws degrades instead of crashing the app', () => {
  const storage = fakeStorage({ throws: true });

  // Reads yield no key, writes report failure — the UI uses that to warn that
  // the key is session-only.
  assert.equal(readStoredKey(storage), '');
  assert.equal(writeStoredKey(storage, GOOD_KEY), false);
  assert.equal(clearStoredKey(storage), false);
  assert.equal(readStoredKey(null), '');
});

test('validation catches the common paste mistakes', () => {
  assert.equal(validateKey('').ok, false);
  assert.equal(validateKey('   ').ok, false);
  assert.equal(validateKey('short').ok, false);
  assert.equal(validateKey(`"${GOOD_KEY}"`).ok, false, 'quotes are rejected');
  assert.equal(validateKey(`AIza key with spaces here`).ok, false);
  assert.equal(
    validateKey('https://maps.googleapis.com/maps/api/js?key=AIzaSyD-Example').ok,
    false,
    'a whole script URL is rejected',
  );
});

test('a plausible key passes, and a non-AIza key passes with a warning', () => {
  const good = validateKey(GOOD_KEY);
  assert.equal(good.ok, true);
  assert.equal(good.warning, null);

  const odd = validateKey('ya29.someOtherCredentialValue123456');
  assert.equal(odd.ok, true, 'not fatal — Google may change the prefix');
  assert.match(odd.warning, /AIza/);
});

test('masking shows enough to identify the key but not to reuse it', () => {
  const masked = maskKey(GOOD_KEY);
  assert.equal(masked, 'AIzaSy…e123');
  assert.ok(!masked.includes(GOOD_KEY.slice(6, -4)));
  assert.equal(maskKey(''), '');
  assert.equal(maskKey(null), '');
  assert.equal(maskKey('AIzaShort'), 'AI…rt');
});

test('normalizeKey tolerates non-strings', () => {
  assert.equal(normalizeKey(undefined), '');
  assert.equal(normalizeKey(null), '');
  assert.equal(normalizeKey(42), '');
  assert.equal(normalizeKey('  spaced  '), 'spaced');
});
