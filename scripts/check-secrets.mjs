// This script helps identify which accounts have secrets configured.
// Run this in GitHub Actions to see which secrets are set.

const accountLabels = new Map([
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
  [21, 'huang1988pioneer-checkin (21)']
]);
const accounts = Array.from({ length: 33 }, (_, i) => i + 1);

console.log('Checking configured accounts...\n');

for (const account of accounts) {
  const secretName = `LITMEDIA_STORAGE_STATE_BASE64_${account}`;
  const secretValue = process.env[secretName];
  const label = accountLabel(account);

  if (secretValue) {
    console.log(`Account ${account} (${label}): ${secretName} is configured (length: ${secretValue.length})`);
  } else {
    console.log(`Account ${account} (${label}): ${secretName} is NOT configured`);
  }
}

// Check for duplicates by comparing secret values in memory without printing secret content.
console.log('\n--- Checking for potential duplicates ---');
const configured = new Map();

for (const account of accounts) {
  const secretName = `LITMEDIA_STORAGE_STATE_BASE64_${account}`;
  const secretValue = process.env[secretName];

  if (secretValue) {
    if (!configured.has(secretValue)) {
      configured.set(secretValue, []);
    }
    configured.get(secretValue).push(account);
  }
}

for (const accountsWithSameSecret of configured.values()) {
  if (accountsWithSameSecret.length > 1) {
    const labels = accountsWithSameSecret
      .map((account) => `${account} (${accountLabel(account)})`)
      .join(', ');
    console.log(`DUPLICATE DETECTED: Accounts ${labels} have identical secrets`);
  }
}

console.log('\nCheck complete!');

function accountLabel(account) {
  return accountLabels.get(account) ?? `account-${account}`;
}
