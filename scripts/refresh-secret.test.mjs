import assert from 'node:assert/strict';
import {
  assertUsableStorageState,
  compareStorageStates,
  fingerprintStorageState,
  maxExpiryGainSeconds,
  parseRefreshArgs,
  parseStorageState,
  refreshedStatePath,
  secretNameFor,
  sourceStatePath
} from './refresh-secret.mjs';

const HOUR = 3_600;
const now = Math.floor(Date.now() / 1_000);

/**
 * @param {Array<{ name: string, value: string, expires?: number }>} cookies
 * @param {Array<{ origin: string, localStorage: Array<{ name: string, value: string }> }>} [origins]
 */
function state(cookies, origins = []) {
  return {
    cookies: cookies.map((cookie) => ({
      domain: 'www.litmedia.ai',
      path: '/',
      expires: -1,
      ...cookie
    })),
    origins
  };
}

assert.equal(secretNameFor(7), 'LITMEDIA_STORAGE_STATE_BASE64_7');
assert.equal(secretNameFor(undefined), 'LITMEDIA_STORAGE_STATE_BASE64');
assert.equal(refreshedStatePath(7), '.auth/latest-7.storageState.json');
assert.equal(refreshedStatePath(undefined), '.auth/latest.storageState.json');
assert.equal(sourceStatePath(7), 'auth/account-7.storageState.json');
assert.equal(sourceStatePath(undefined), 'auth/litmedia.storageState.json');

assert.deepEqual(parseRefreshArgs(['7', '--dry-run']), {
  accountIndex: '7',
  dryRun: true,
  force: false,
  help: false
});
assert.deepEqual(parseRefreshArgs(['-f']), {
  accountIndex: undefined,
  dryRun: false,
  force: true,
  help: false
});

assert.throws(() => parseStorageState('{oops', 'x.json'), /not valid JSON/);
assert.throws(() => parseStorageState('{"cookies":[]}', 'x.json'), /storage state file/);
assert.deepEqual(parseStorageState('{"cookies":[],"origins":[]}', 'x.json'), {
  cookies: [],
  origins: []
});

// Cookie order must not affect the fingerprint; expiry must not either.
const a = state([
  { name: 'token', value: 'abc', expires: now + HOUR },
  { name: 'uid', value: '42' }
]);
const b = state([
  { name: 'uid', value: '42' },
  { name: 'token', value: 'abc', expires: now + 48 * HOUR }
]);
assert.equal(fingerprintStorageState(a), fingerprintStorageState(b));
assert.equal(maxExpiryGainSeconds(a, b), 47 * HOUR);

// Session cookies and newly added cookies contribute no expiry gain.
assert.equal(maxExpiryGainSeconds(a, state([{ name: 'fresh', value: 'z', expires: now + 99 * HOUR }])), 0);

const rotated = state([
  { name: 'token', value: 'xyz', expires: now + HOUR },
  { name: 'uid', value: '42' }
]);
assert.equal(compareStorageStates(a, rotated).changed, true);
assert.match(compareStorageStates(a, rotated).reason, /values changed/);

const extended = compareStorageStates(a, b);
assert.equal(extended.changed, true);
assert.equal(extended.expiryGainSeconds, 47 * HOUR);
assert.match(extended.reason, /expiry extended/);

// Below the threshold the state is not worth a secret write.
const nudged = state([
  { name: 'token', value: 'abc', expires: now + HOUR + 60 },
  { name: 'uid', value: '42' }
]);
assert.equal(compareStorageStates(a, nudged).changed, false);
assert.equal(compareStorageStates(a, nudged, { minExpiryGainSeconds: 30 }).changed, true);
assert.equal(compareStorageStates(a, a).changed, false);
assert.equal(compareStorageStates(null, a).changed, true);

// localStorage differences are part of the fingerprint.
const withStorage = state(
  [{ name: 'token', value: 'abc', expires: now + HOUR }, { name: 'uid', value: '42' }],
  [{ origin: 'https://www.litmedia.ai', localStorage: [{ name: 'lang', value: 'zh-TW' }] }]
);
assert.equal(compareStorageStates(a, withStorage).changed, true);

// Guards against writing back a state that would lock the account out.
assert.equal(assertUsableStorageState(a, state([])).ok, false);
const cookieless = state(
  [],
  [{ origin: 'https://www.litmedia.ai', localStorage: [{ name: 'lang', value: 'zh-TW' }] }]
);
assert.match(assertUsableStorageState(a, cookieless).reason, /dropped every cookie/);
assert.equal(assertUsableStorageState(null, { cookies: [], origins: [] }).ok, false);
assert.equal(
  assertUsableStorageState(a, state([{ name: 'token', value: 'abc', expires: now - HOUR }])).ok,
  false
);
assert.equal(assertUsableStorageState(a, b).ok, true);
// Session-only cookies carry no expiry, so they must not trip the expired guard.
assert.equal(assertUsableStorageState(a, state([{ name: 'token', value: 'abc' }])).ok, true);

console.log('refresh-secret.test.mjs: ok');
