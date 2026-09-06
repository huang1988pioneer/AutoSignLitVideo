import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

/**
 * Roll the saved Playwright storage state forward.
 *
 * `runLitMediaCheckin` writes the post-run cookies to
 * `.auth/latest-N.storageState.json`, and only when the check-in actually
 * reached a result, so that file is a session LitMedia just accepted. This
 * script writes it back over the source of truth (the numbered GitHub Secret in
 * CI, the local `auth/` file otherwise) so a sliding session never has to be
 * re-created by hand.
 *
 * There is no OAuth refresh token here: the renewal is whatever the site did to
 * the cookies during the run. If LitMedia uses absolute expiry, the write-back
 * is a no-op and `npm run auth` is still required.
 */

/** Check-in statuses that prove the session was still valid during the run. */
export const REFRESHABLE_STATUSES = new Set(['checked_in', 'already_done', 'enabled']);

/** Default minimum expiry extension worth spending a secret write on. */
export const DEFAULT_MIN_EXPIRY_GAIN_SECONDS = 3_600;

/**
 * @typedef {object} StorageState
 * @property {Array<Record<string, any>>} cookies
 * @property {Array<Record<string, any>>} origins
 */

/**
 * @param {string | number | undefined | null} accountIndex
 * @returns {string}
 */
export function secretNameFor(accountIndex) {
  return accountIndex
    ? `LITMEDIA_STORAGE_STATE_BASE64_${accountIndex}`
    : 'LITMEDIA_STORAGE_STATE_BASE64';
}

/**
 * Where `runLitMediaCheckin` drops the post-run session.
 * @param {string | number | undefined | null} accountIndex
 * @returns {string}
 */
export function refreshedStatePath(accountIndex) {
  return accountIndex
    ? `.auth/latest-${accountIndex}.storageState.json`
    : '.auth/latest.storageState.json';
}

/**
 * The local file `npm run auth` writes for the same account.
 * @param {string | number | undefined | null} accountIndex
 * @returns {string}
 */
export function sourceStatePath(accountIndex) {
  return accountIndex
    ? `auth/account-${accountIndex}.storageState.json`
    : 'auth/litmedia.storageState.json';
}

/**
 * @param {string} raw
 * @param {string} label
 * @returns {StorageState}
 */
export function parseStorageState(raw, label) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `${label} is not valid JSON: ${error instanceof Error ? error.message : error}`
    );
  }

  if (!parsed || !Array.isArray(parsed.cookies) || !Array.isArray(parsed.origins)) {
    throw new Error(`${label} does not look like a Playwright storage state file.`);
  }

  return parsed;
}

/**
 * Stable identity of a cookie across runs (expiry deliberately excluded).
 * @param {Record<string, any>} cookie
 * @returns {string}
 */
function cookieKey(cookie) {
  return `${cookie.domain ?? ''}|${cookie.path ?? ''}|${cookie.name ?? ''}`;
}

/**
 * Value-only fingerprint: equal fingerprints mean nothing but expiry moved.
 * @param {StorageState} state
 * @returns {string}
 */
export function fingerprintStorageState(state) {
  const cookies = state.cookies
    .map((cookie) => `${cookieKey(cookie)}=${cookie.value ?? ''}`)
    .sort();

  const origins = state.origins
    .flatMap((origin) =>
      (Array.isArray(origin.localStorage) ? origin.localStorage : []).map(
        (entry) => `${origin.origin ?? ''}|${entry?.name ?? ''}=${entry?.value ?? ''}`
      )
    )
    .sort();

  return JSON.stringify({ cookies, origins });
}

/**
 * Largest expiry extension across cookies present in both states.
 * Session cookies (`expires <= 0`) are ignored.
 *
 * @param {StorageState} previous
 * @param {StorageState} next
 * @returns {number} seconds, 0 when nothing was extended
 */
export function maxExpiryGainSeconds(previous, next) {
  /** @type {Map<string, number>} */
  const before = new Map();
  for (const cookie of previous.cookies) {
    const expires = Number(cookie.expires);
    if (Number.isFinite(expires) && expires > 0) {
      before.set(cookieKey(cookie), expires);
    }
  }

  let gain = 0;
  for (const cookie of next.cookies) {
    const expires = Number(cookie.expires);
    if (!Number.isFinite(expires) || expires <= 0) continue;

    const previousExpires = before.get(cookieKey(cookie));
    if (previousExpires == null) continue;

    gain = Math.max(gain, expires - previousExpires);
  }

  return Math.round(gain);
}

/**
 * Refuse states that would lock the account out if written back.
 *
 * @param {StorageState | null} previous
 * @param {StorageState} next
 * @param {{ now?: number }} [options]
 * @returns {{ ok: boolean, reason: string }}
 */
export function assertUsableStorageState(previous, next, options = {}) {
  const now = options.now ?? Date.now() / 1_000;

  if (next.cookies.length === 0 && next.origins.length === 0) {
    return { ok: false, reason: 'refreshed state is empty' };
  }

  if (previous && previous.cookies.length > 0 && next.cookies.length === 0) {
    return { ok: false, reason: 'refreshed state dropped every cookie' };
  }

  const dated = next.cookies.filter((cookie) => {
    const expires = Number(cookie.expires);
    return Number.isFinite(expires) && expires > 0;
  });

  if (dated.length > 0 && dated.every((cookie) => Number(cookie.expires) <= now)) {
    return { ok: false, reason: 'every dated cookie in the refreshed state is already expired' };
  }

  return { ok: true, reason: 'refreshed state looks usable' };
}

/**
 * Decide whether the refreshed state is worth persisting.
 *
 * @param {StorageState | null} previous
 * @param {StorageState} next
 * @param {{ minExpiryGainSeconds?: number }} [options]
 * @returns {{ changed: boolean, reason: string, expiryGainSeconds: number }}
 */
export function compareStorageStates(previous, next, options = {}) {
  const minGain = options.minExpiryGainSeconds ?? DEFAULT_MIN_EXPIRY_GAIN_SECONDS;

  if (!previous) {
    return { changed: true, reason: 'no previous state to compare against', expiryGainSeconds: 0 };
  }

  const expiryGainSeconds = maxExpiryGainSeconds(previous, next);

  if (fingerprintStorageState(previous) !== fingerprintStorageState(next)) {
    return { changed: true, reason: 'cookie or localStorage values changed', expiryGainSeconds };
  }

  if (expiryGainSeconds >= minGain) {
    return {
      changed: true,
      reason: `session expiry extended by ${Math.round(expiryGainSeconds / 60)} minute(s)`,
      expiryGainSeconds
    };
  }

  return {
    changed: false,
    reason:
      expiryGainSeconds > 0
        ? `only ${expiryGainSeconds}s of expiry gain (below the ${minGain}s threshold)`
        : 'identical to the stored state',
    expiryGainSeconds
  };
}

/**
 * @param {string[]} argv
 * @returns {{ accountIndex: string | undefined, dryRun: boolean, force: boolean, help: boolean }}
 */
export function parseRefreshArgs(argv) {
  /** @type {string | undefined} */
  let accountIndex;
  let dryRun = false;
  let force = false;
  let help = false;

  for (const arg of argv) {
    if (arg === '--dry-run' || arg === '-n') dryRun = true;
    else if (arg === '--force' || arg === '-f') force = true;
    else if (arg === '--help' || arg === '-h') help = true;
    else if (!accountIndex && /^\d+$/.test(arg)) accountIndex = arg;
  }

  return { accountIndex, dryRun, force, help };
}

const USAGE = [
  'Usage: npm run secret:refresh -- [account-number] [--dry-run] [--force]',
  '',
  'Writes .auth/latest-N.storageState.json back over the stored session:',
  '  - GitHub Secret LITMEDIA_STORAGE_STATE_BASE64_N (needs LITMEDIA_SECRETS_TOKEN)',
  '  - local file auth/account-N.storageState.json',
  '',
  'Options:',
  '  --dry-run, -n   Report what would change without writing anything',
  '  --force, -f     Skip the check-in status gate',
  '',
  'Env:',
  '  LITMEDIA_SECRETS_TOKEN    PAT with repository permission Secrets: read and write',
  '  LITMEDIA_SECRETS_REPO     owner/repo (defaults to GITHUB_REPOSITORY)',
  '  LITMEDIA_ACCOUNT_INDEX    Account number when not passed as an argument',
  `  LITMEDIA_REFRESH_MIN_GAIN_SECONDS  Expiry gain worth a write (default ${DEFAULT_MIN_EXPIRY_GAIN_SECONDS})`
].join('\n');

/**
 * @param {string | number | undefined | null} accountIndex
 * @returns {Promise<string | null>} recorded check-in status, or null when unknown
 */
async function readCheckinStatus(accountIndex) {
  const suffix = accountIndex ? String(accountIndex) : 'single';
  const candidates = [
    `test-results/checkin-result-${suffix}.json`,
    accountIndex ? null : 'test-results/checkin-result.json'
  ].filter(Boolean);

  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      const record = JSON.parse(await readFile(path, 'utf8'));
      if (record && typeof record.status === 'string') return record.status;
    } catch {
      // A malformed result file counts as "status unknown".
    }
  }

  return null;
}

/**
 * @param {{ name: string, value: string, repo: string | undefined, token: string }} options
 */
function setGitHubSecret({ name, value, repo, token }) {
  const args = ['secret', 'set', name];
  if (repo) args.push('--repo', repo);

  // Value goes over stdin so it never appears in the process list.
  const result = spawnSync('gh', args, {
    input: value,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env: { ...process.env, GH_TOKEN: token, GITHUB_TOKEN: token }
  });

  if (result.error) {
    throw new Error(
      `Could not run the GitHub CLI: ${result.error.message}\n` +
        'Install gh (https://cli.github.com) or unset LITMEDIA_SECRETS_TOKEN.'
    );
  }

  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim();
    throw new Error(
      `gh secret set ${name} failed with code ${result.status}.\n${stderr}\n` +
        'The token needs repository permission "Secrets: Read and write" (classic PAT: repo scope). ' +
        'The default GITHUB_TOKEN cannot write secrets.'
    );
  }
}

/**
 * @param {string[]} argv
 * @returns {Promise<number>} process exit code
 */
async function main(argv) {
  const { accountIndex: argAccount, dryRun, force, help } = parseRefreshArgs(argv);

  if (help) {
    console.log(USAGE);
    return 0;
  }

  const accountIndex = argAccount || process.env.LITMEDIA_ACCOUNT_INDEX?.trim() || undefined;
  const label = accountIndex ? `account ${accountIndex}` : 'single account';
  const refreshedPath =
    process.env.LITMEDIA_REFRESHED_STATE_PATH ?? refreshedStatePath(accountIndex);

  if (!existsSync(refreshedPath)) {
    console.log(`No refreshed session at ${refreshedPath} — nothing to write back for ${label}.`);
    return 0;
  }

  const status = await readCheckinStatus(accountIndex);
  if (!force && status == null) {
    console.log(
      `No check-in result recorded for ${label} — skipping write-back (use --force to override).`
    );
    return 0;
  }
  if (!force && !REFRESHABLE_STATUSES.has(status)) {
    console.log(
      `Check-in status for ${label} is "${status}" — refusing to write back a session from a run that did not succeed.`
    );
    return 0;
  }

  const next = parseStorageState(await readFile(refreshedPath, 'utf8'), refreshedPath);

  const secretName = secretNameFor(accountIndex);
  const secretValue =
    process.env[secretName]?.trim() || process.env.LITMEDIA_STORAGE_STATE_BASE64?.trim();
  const localPath = process.env.LITMEDIA_STORAGE_STATE_PATH ?? sourceStatePath(accountIndex);
  const hasLocalFile = existsSync(localPath);

  /** @type {StorageState | null} */
  let previous = null;
  if (secretValue) {
    previous = parseStorageState(Buffer.from(secretValue, 'base64').toString('utf8'), secretName);
  } else if (hasLocalFile) {
    previous = parseStorageState(await readFile(localPath, 'utf8'), localPath);
  }

  const usable = assertUsableStorageState(previous, next);
  if (!usable.ok) {
    console.warn(`Not writing back ${label}: ${usable.reason}.`);
    return 0;
  }

  const configuredMinGain = Number.parseInt(
    process.env.LITMEDIA_REFRESH_MIN_GAIN_SECONDS ?? '',
    10
  );
  const comparison = compareStorageStates(previous, next, {
    minExpiryGainSeconds: Number.isFinite(configuredMinGain)
      ? configuredMinGain
      : DEFAULT_MIN_EXPIRY_GAIN_SECONDS
  });

  console.log(
    `Refreshed session for ${label}: ${next.cookies.length} cookie(s), ${next.origins.length} origin(s).`
  );

  if (!comparison.changed) {
    console.log(`Stored session is already current (${comparison.reason}). Nothing written.`);
    return 0;
  }

  console.log(`Write-back reason: ${comparison.reason}.`);

  const token = process.env.LITMEDIA_SECRETS_TOKEN?.trim() || process.env.GH_TOKEN?.trim();
  const repo = process.env.LITMEDIA_SECRETS_REPO?.trim() || process.env.GITHUB_REPOSITORY?.trim();
  const serialized = `${JSON.stringify(next, null, 2)}\n`;
  let wrote = false;

  if (token) {
    if (dryRun) {
      console.log(`[dry-run] Would update GitHub Secret ${secretName}${repo ? ` in ${repo}` : ''}.`);
    } else {
      setGitHubSecret({
        name: secretName,
        value: Buffer.from(serialized, 'utf8').toString('base64'),
        repo,
        token
      });
      console.log(`Updated GitHub Secret ${secretName}${repo ? ` in ${repo}` : ''}.`);
    }
    wrote = true;
  } else if (process.env.GITHUB_ACTIONS === 'true') {
    console.log(
      `LITMEDIA_SECRETS_TOKEN is not set — leaving ${secretName} unchanged. ` +
        'Add a PAT with "Secrets: Read and write" to enable automatic session renewal.'
    );
  }

  // A CI runner has no durable local file, so only refresh one that already exists.
  if (hasLocalFile) {
    if (dryRun) {
      console.log(`[dry-run] Would update local storage state ${localPath}.`);
    } else {
      await writeFile(localPath, serialized, 'utf8');
      console.log(`Updated local storage state ${localPath}.`);
    }
    wrote = true;
  }

  if (!wrote) {
    console.log(
      `No write target for ${label}: set LITMEDIA_SECRETS_TOKEN, or run where ${localPath} exists.`
    );
  }

  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
