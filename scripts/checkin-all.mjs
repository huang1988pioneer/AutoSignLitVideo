import { existsSync } from 'node:fs';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { defaultTargetUrl, runLitMediaCheckin } from './litmedia-checkin.mjs';

const accounts = [
  [1, 'samafengtu-checkin (1)'],
  [2, 'fengtusama-checkin (2)'],
  [3, 'tushenbyfengbro-checkin (3)'],
  [4, 'fengwithting0831-checkin (4)'],
  [5, 'fengwithfeng1127-checkin (5)'],
  [6, 'fengwithtu1127-checkin (6)'],
  [7, 'akaonda333-checkin (7)'],
  [8, 'fbussinesseng-checkin (8)'],
  [9, 'engdictatorf-checkin (9)'],
  [10, 'fengtuprinfo-checkin (10)'],
  [11, 'flottojackpoteng-checkin (11)'],
  [12, 'feng33feng35feng3-checkin (12)'],
  [13, 'chbondg2-checkin (13)'],
  [14, 'chbondg_outlook-checkin (14)'],
  [15, 'gaokaolevel3iptopscorer_outlook-checkin (15)'],
  [16, 'huang1988pioneer_outlook-checkin (16)'],
  [17, 'fengtuta_tutamail-checkin (17)'],
  [18, 'fengfence_mailfence-checkin (18)'],
  [19, 'goldshoot0720-checkin (19)'],
  [20, 'abuhg17-checkin (20)'],
  [21, 'huang1988pioneer-checkin (21)'],
  [22, 'account-22'],
  [23, 'account-23'],
  [24, 'account-24'],
  [25, 'account-25'],
  [26, 'account-26'],
  [27, 'account-27'],
  [28, 'account-28'],
  [29, 'account-29'],
  [30, 'account-30'],
  [31, 'account-31'],
  [32, 'account-32'],
  [33, 'account-33']
];

const delayMinMs = parseDelay(process.env.LITMEDIA_DELAY_MIN_MS, 5_000);
const delayMaxMs = parseDelay(process.env.LITMEDIA_DELAY_MAX_MS, 15_000);
const targetUrl = process.env.LITMEDIA_URL?.trim() || defaultTargetUrl;
const accountMin = parseAccountBound(process.env.LITMEDIA_ACCOUNT_MIN, 1);
const accountMax = parseAccountBound(process.env.LITMEDIA_ACCOUNT_MAX, 33);
const failOnAccountError = parseBoolean(process.env.LITMEDIA_FAIL_ON_ACCOUNT_ERROR, false);

const selectedAccounts = accounts.filter(([index]) => index >= accountMin && index <= accountMax);

const resolvedAccounts = selectedAccounts.map(([index, label]) => resolveAccount(index, label));
const configuredAccounts = resolvedAccounts.filter((account) => account.ready);
const skippedAccounts = resolvedAccounts.filter((account) => !account.ready);

let skipped = skippedAccounts.length;
let failed = 0;
let succeeded = 0;
let alreadyDone = 0;
/** @type {Array<object>} */
const failedAccounts = [];
/** @type {Array<object>} */
const successAccounts = [];
/** @type {Array<object>} */
const allResults = [];

printConfiguredAccounts(configuredAccounts, {
  accountMin,
  accountMax,
  skippedAccounts
});

if (configuredAccounts.length === 0) {
  const summary = {
    configured: 0,
    skipped,
    failed,
    succeeded,
    alreadyDone,
    accountMin,
    accountMax
  };
  printSummary(summary);
  await writeGithubSummary(summary);
  process.exit(0);
}

for (let i = 0; i < configuredAccounts.length; i += 1) {
  const account = configuredAccounts[i];
  console.log(`\n=== Account ${account.index}: ${account.label} ===`);
  console.log(`Auth source: ${account.source}`);

  let browser;
  try {
    browser = await chromium.launch({ headless: process.env.HEADLESS !== 'false' });
    const result = await runLitMediaCheckin(browser, {
      accountIndex: String(account.index),
      accountLabel: account.label,
      storageStateBase64: account.secret,
      storageStatePath: account.storageStatePath,
      targetUrl
    });

    console.log(`Result: ${result.status} — ${result.message}`);
    if (result.pointsAwarded != null) {
      console.log(`Points awarded / tier: ${result.pointsAwarded}`);
    }
    if (result.creditBalance != null) {
      console.log(`Credit balance: ${result.creditBalance}`);
    }
    if (result.continueDay != null) {
      console.log(`Continue day streak: ${result.continueDay}`);
    }

    const row = { ...account, result, error: null };

    if (result.status === 'checked_in') {
      succeeded += 1;
      successAccounts.push(row);
      allResults.push(row);
    } else if (result.status === 'already_done') {
      alreadyDone += 1;
      successAccounts.push(row);
      allResults.push(row);
    } else {
      failed += 1;
      const failRow = { ...row, error: result.message || result.status };
      failedAccounts.push(failRow);
      allResults.push(failRow);
      console.error(`Account ${account.index} did not confirm reward points (${result.status}).`);
    }
  } catch (error) {
    failed += 1;
    const message = error instanceof Error ? error.message : String(error);
    const failRow = {
      ...account,
      result: { status: 'failed', message },
      error: message
    };
    failedAccounts.push(failRow);
    allResults.push(failRow);
    console.error(error instanceof Error ? error.stack : error);
    console.error(`Account ${account.index} failed.`);
  } finally {
    await browser?.close().catch(() => {});
  }

  if (i < configuredAccounts.length - 1) {
    const delay = randomDelay(delayMinMs, delayMaxMs);
    console.log(`Waiting ${Math.round(delay / 1000)} seconds before the next account.`);
    await wait(delay);
  }
}

const summary = {
  configured: configuredAccounts.length,
  skipped,
  failed,
  succeeded,
  alreadyDone,
  accountMin,
  accountMax
};

printSummary(summary);
await writeGithubSummary(summary);

if (failed > 0 && failOnAccountError) {
  process.exitCode = 1;
}

function resolveAccount(index, label) {
  const secretName = `LITMEDIA_STORAGE_STATE_BASE64_${index}`;
  const secret = process.env[secretName]?.trim();
  const storageStatePath = `auth/account-${index}.storageState.json`;
  const hasLocalFile = existsSync(storageStatePath);

  if (secret) {
    return {
      index,
      label,
      secretName,
      secret,
      storageStatePath: undefined,
      source: `env:${secretName}`,
      ready: true
    };
  }

  if (hasLocalFile) {
    return {
      index,
      label,
      secretName,
      secret: undefined,
      storageStatePath,
      source: `file:${storageStatePath}`,
      ready: true
    };
  }

  return {
    index,
    label,
    secretName,
    secret: undefined,
    storageStatePath,
    source: 'missing',
    ready: false
  };
}

function randomDelay(min, max) {
  const safeMin = Number.isFinite(min) && min >= 0 ? min : 5_000;
  const safeMax = Number.isFinite(max) && max >= safeMin ? max : safeMin;
  return Math.floor(safeMin + Math.random() * (safeMax - safeMin + 1));
}

function parseDelay(value, fallback) {
  if (value === undefined || value.trim() === '') {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseAccountBound(value, fallback) {
  if (value === undefined || value.trim() === '') {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function parseBoolean(value, fallback) {
  if (value === undefined || value.trim() === '') {
    return fallback;
  }

  return /^(1|true|yes)$/i.test(value.trim());
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printConfiguredAccounts(configuredAccounts, { accountMin, accountMax, skippedAccounts }) {
  console.log(`Daily LitMedia Check-in accounts (${accountMin}-${accountMax}):`);

  if (configuredAccounts.length === 0) {
    console.log('No configured accounts found.');
  } else {
    for (const account of configuredAccounts) {
      console.log(`- Account ${account.index}: ${account.label} [${account.source}]`);
    }
  }

  if (skippedAccounts.length > 0) {
    console.log('');
    console.log('Skipped (no secret / local storage state):');
    for (const account of skippedAccounts) {
      console.log(`- Account ${account.index}: ${account.label}`);
    }
  }

  console.log('');
}

function printSummary({ configured, skipped, failed, succeeded = 0, alreadyDone = 0 }) {
  console.log('');
  console.log('========== SUMMARY ==========');
  console.log(`Configured accounts: ${configured}`);
  console.log(`Checked in this run: ${succeeded}`);
  console.log(`Already done: ${alreadyDone}`);
  console.log(`Skipped accounts: ${skipped}`);
  console.log(`Failed accounts: ${failed}`);

  if (successAccounts.length > 0) {
    console.log('');
    console.log('OK accounts:');
    for (const account of successAccounts) {
      console.log(`- #${account.index} ${account.label}: ${formatResultLine(account)}`);
    }
  }

  if (failedAccounts.length > 0) {
    console.log('');
    console.log('Failed accounts:');
    for (const account of failedAccounts) {
      console.log(`- #${account.index} ${account.label}: ${formatResultLine(account)}`);
    }
    console.warn('Failure screenshots were saved under test-results for troubleshooting.');
  }
}

function formatResultLine(account) {
  const status = account.result?.status ?? 'unknown';
  const parts = [status];
  if (account.result?.pointsAwarded != null) {
    parts.push(`reward=+${account.result.pointsAwarded}`);
  }
  if (account.result?.continueDay != null) {
    parts.push(`streak=${account.result.continueDay}`);
  }
  if (account.error) {
    parts.push(`error=${compactMessage(account.error)}`);
  }
  return parts.join(' ');
}

function compactMessage(message, max = 120) {
  const text = String(message).replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function shortLabel(label) {
  return String(label)
    .replace(/\s*\(\d+\)\s*$/, '')
    .replace(/-checkin$/i, '')
    .trim();
}

function statusBadge(status) {
  switch (status) {
    case 'checked_in':
      return '✅ checked_in';
    case 'already_done':
      return '☑️ already_done';
    case 'failed':
    case 'missing':
      return '❌ failed';
    case 'skipped':
      return '⏭️ skipped';
    default:
      return `❓ ${status || 'unknown'}`;
  }
}

function buildSummaryMarkdown({
  configured,
  skipped,
  failed,
  succeeded = 0,
  alreadyDone = 0,
  accountMin,
  accountMax
}) {
  const ok = succeeded + alreadyDone;
  const headline =
    failed === 0 && configured > 0
      ? '✅ All configured accounts OK'
      : failed > 0
        ? `⚠️ ${failed} account(s) need attention`
        : 'ℹ️ No configured accounts';

  const now = new Date().toISOString();
  const lines = [
    '## LitMedia daily check-in',
    '',
    `**${headline}**`,
    '',
    '| Metric | Count |',
    '| --- | ---: |',
    `| Configured (ran) | ${configured} |`,
    `| New check-in | ${succeeded} |`,
    `| Already done | ${alreadyDone} |`,
    `| OK total | ${ok} |`,
    `| Failed | ${failed} |`,
    `| Skipped (no secret) | ${skipped} |`,
    '',
    `<sub>Accounts ${accountMin}–${accountMax} · ${now}</sub>`,
    ''
  ];

  if (failedAccounts.length > 0) {
    lines.push('### ⚠️ Needs attention', '');
    lines.push('| # | Account | Error |');
    lines.push('| ---: | --- | --- |');
    for (const account of [...failedAccounts].sort((a, b) => a.index - b.index)) {
      lines.push(
        `| ${account.index} | ${escapeMd(shortLabel(account.label))} | ${escapeMd(compactMessage(account.error || account.result?.message || 'failed', 160))} |`
      );
    }
    lines.push('', '_Screenshots (if any): artifact `litmedia-checkin-failures`._', '');
  }

  if (allResults.length > 0) {
    lines.push('### Account results', '');
    lines.push('| # | Account | Status | Reward | Streak | Note |');
    lines.push('| ---: | --- | --- | ---: | ---: | --- |');

    const sorted = [...allResults].sort((a, b) => a.index - b.index);
    for (const account of sorted) {
      const status = account.result?.status ?? 'unknown';
      const reward =
        account.result?.pointsAwarded != null ? `+${account.result.pointsAwarded}` : '—';
      const streak = account.result?.continueDay != null ? String(account.result.continueDay) : '—';
      let note = '—';
      if (status === 'checked_in') note = 'new today';
      else if (status === 'already_done') note = 'claimed earlier';
      else if (account.error) note = compactMessage(account.error, 80);

      lines.push(
        `| ${account.index} | ${escapeMd(shortLabel(account.label))} | ${statusBadge(status)} | ${reward} | ${streak} | ${escapeMd(note)} |`
      );
    }
    lines.push('');
  }

  if (skippedAccounts.length > 0) {
    const ids = skippedAccounts.map((a) => a.index).join(', ');
    lines.push('### Skipped', '');
    lines.push(`No secret / storage: **#${ids}**`, '');
  }

  if (configured === 0) {
    lines.push(
      '### Next step',
      '',
      'Add GitHub Secrets `LITMEDIA_STORAGE_STATE_BASE64_N` or local `auth/account-N.storageState.json`.',
      ''
    );
  }

  lines.push(
    '---',
    '',
    '<sub>Status: `checked_in` = claimed this run · `already_done` = already claimed today · `failed` = needs re-auth or layout change</sub>',
    ''
  );

  return lines.join('\n');
}

function escapeMd(value) {
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

async function writeGithubSummary(summary) {
  const markdown = buildSummaryMarkdown(summary);

  // Always print a compact block for log searchability.
  console.log('');
  console.log('----- GITHUB SUMMARY (markdown) -----');
  console.log(markdown);
  console.log('----- END GITHUB SUMMARY -----');

  // Local copy for artifact / debugging.
  try {
    await mkdir('test-results', { recursive: true });
    await writeFile('test-results/checkin-summary.md', markdown, 'utf8');
  } catch {
    // ignore local write failures
  }

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) {
    return;
  }

  try {
    await appendFile(summaryPath, markdown, 'utf8');
    console.log(`Wrote GitHub Job Summary to ${summaryPath}`);
  } catch (error) {
    console.warn(
      `Could not write GITHUB_STEP_SUMMARY: ${error instanceof Error ? error.message : error}`
    );
  }
}
