// This script helps identify which accounts have secrets configured.
// Run this in GitHub Actions to see which secrets are set.

const accountLabels = new Map([
  [19, 'goldshoot0720'],
  [20, 'abuhg17'],
  [21, 'huang1988pioneer']
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
