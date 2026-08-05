import { mkdir } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { ensureBrowserInstalled, launchBrowser, parseAuthArgs } from './browser.mjs';

const targetUrl = process.env.LITMEDIA_URL ?? 'https://www.litmedia.ai/tw/app/litvideo/home/';
const { accountIndex, browserName, rest } = parseAuthArgs(process.argv.slice(2));

if (rest.includes('--help') || rest.includes('-h')) {
  console.log(
    [
      'Usage: npm run auth -- [account-number] [--browser chromium|firefox|edge]',
      '',
      'Options:',
      '  --browser, -b   Playwright browser (default: chromium; firefox|edge are fallbacks)',
      '',
      'Env:',
      '  LITMEDIA_BROWSER=chromium|firefox|edge',
      '  LITMEDIA_URL=...',
      '  LITMEDIA_STORAGE_STATE_PATH=...'
    ].join('\n')
  );
  process.exit(0);
}

const statePath = process.env.LITMEDIA_STORAGE_STATE_PATH ?? defaultStatePath(accountIndex);

await mkdir('auth', { recursive: true });
await ensureBrowserInstalled(browserName);

const browser = await launchBrowser({ browserName, headless: false });
const context = await browser.newContext({
  locale: 'zh-TW',
  timezoneId: 'Asia/Taipei'
});
const page = await context.newPage();

console.log(`Browser: ${browserName}`);
console.log(`Opening ${targetUrl}`);
await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

const rl = createInterface({ input, output });
await rl.question(
  [
    '',
    `Log in to LitMedia in the ${browserName} window.`,
    'After the page shows your signed-in account, return here and press Enter.',
    '',
    'Tip: keep login and check-in on the same browser (chromium, firefox, or edge).',
    ''
  ].join('\n')
);
rl.close();

await context.storageState({ path: statePath });
console.log(`Saved Playwright storage state to ${statePath}`);
console.log(`Browser used: ${browserName}`);

await browser.close();

function defaultStatePath(index) {
  return index ? `auth/account-${index}.storageState.json` : 'auth/litmedia.storageState.json';
}
