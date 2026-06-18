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
  [8, 'fbussinessengen-checkin (8)'],
  [9, 'gdictatorff-checkin (9)'],
  [10, 'engtuprinfo-checkin (10)'],
  [11, 'flottojackpot-checkin (11)'],
  [12, 'engfeng33feng35feng3-checkin (12)'],
  [13, 'chbondg2-checkin (13)'],
  [14, 'chbondg_outlook-checkin (14)'],
  [15, 'gaokaolevel3iptopscorer_outlook-checkin (15)'],
  [16, 'huang1988pioneer_outlook-checkin (16)'],
  [17, 'fengtuta_tutamail-checkin (17)'],
  [18, 'fengfence_mailfence-checkin (18)'],
  [19, 'account-19'],
  [20, 'account-20'],
  [21, 'account-21'],
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

const delayMinMs = parseDelay(process.env.LITMEDIA_DELAY_MIN_MS, 15_000);
const delayMaxMs = parseDelay(process.env.LITMEDIA_DELAY_MAX_MS, 45_000);
const targetUrl = process.env.LITMEDIA_URL?.trim() || defaultTargetUrl;
const configuredAccounts = accounts
  .map(([index, label]) => ({
    index,
    label,
    secretName: `LITMEDIA_STORAGE_STATE_BASE64_${index}`,
    secret: process.env[`LITMEDIA_STORAGE_STATE_BASE64_${index}`]?.trim()
  }))
  .filter((account) => account.secret);

let skipped = 0;
let failed = 0;

for (const [index, label] of accounts) {
  if (!process.env[`LITMEDIA_STORAGE_STATE_BASE64_${index}`]?.trim()) {
    skipped += 1;
    console.log(`Skipping account ${index} (${label}): LITMEDIA_STORAGE_STATE_BASE64_${index} is not configured.`);
  }
}

if (configuredAccounts.length === 0) {
  printSummary({ configured: 0, skipped, failed });
  process.exit(0);
}

const browser = await chromium.launch({ headless: process.env.HEADLESS !== 'false' });

try {
  for (let i = 0; i < configuredAccounts.length; i += 1) {
    const account = configuredAccounts[i];
    console.log(`\n=== Account ${account.index}: ${account.label} ===`);

    try {
      await runLitMediaCheckin(browser, {
        accountIndex: String(account.index),
        accountLabel: account.label,
        storageStateBase64: account.secret,
        targetUrl
      });
    } catch (error) {
      failed += 1;
      console.error(error instanceof Error ? error.stack : error);
      console.error(`Account ${account.index} failed.`);
    }

    if (i < configuredAccounts.length - 1) {
      const delay = randomDelay(delayMinMs, delayMaxMs);
      console.log(`Waiting ${Math.round(delay / 1000)} seconds before the next account.`);
      await wait(delay);
    }
  }
} finally {
  await browser.close();
}

printSummary({ configured: configuredAccounts.length, skipped, failed });

if (failed > 0) {
  process.exitCode = 1;
}

function randomDelay(min, max) {
  const safeMin = Number.isFinite(min) && min >= 0 ? min : 15_000;
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

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printSummary({ configured, skipped, failed }) {
  console.log('');
  console.log(`Configured accounts: ${configured}`);
  console.log(`Skipped accounts: ${skipped}`);
  console.log(`Failed accounts: ${failed}`);
}
