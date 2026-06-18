import { spawn } from 'node:child_process';

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

let configured = 0;
let skipped = 0;
let failed = 0;

for (const [index, label] of accounts) {
  const secretName = `LITMEDIA_STORAGE_STATE_BASE64_${index}`;
  const secret = process.env[secretName]?.trim();

  if (!secret) {
    skipped += 1;
    console.log(`Skipping account ${index} (${label}): ${secretName} is not configured.`);
    continue;
  }

  configured += 1;
  console.log(`\n=== Account ${index}: ${label} ===`);

  const code = await runAccount(index, label, secret);
  if (code !== 0) {
    failed += 1;
    console.error(`Account ${index} failed with exit code ${code}.`);
  }
}

console.log('');
console.log(`Configured accounts: ${configured}`);
console.log(`Skipped accounts: ${skipped}`);
console.log(`Failed accounts: ${failed}`);

if (failed > 0) {
  process.exitCode = 1;
}

function runAccount(index, label, secret) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/checkin.mjs'], {
      env: {
        ...process.env,
        LITMEDIA_ACCOUNT_INDEX: String(index),
        LITMEDIA_ACCOUNT_LABEL: label,
        LITMEDIA_STORAGE_STATE_BASE64: secret
      },
      stdio: 'inherit'
    });

    child.on('error', reject);
    child.on('close', resolve);
  });
}
