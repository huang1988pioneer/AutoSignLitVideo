import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const targetUrl = process.env.LITMEDIA_URL ?? 'https://litmedia.ai/tw/app/litvideo/ai-image/';
const statePath = process.env.LITMEDIA_STORAGE_STATE_PATH ?? 'auth/litmedia.storageState.json';

await mkdir('auth', { recursive: true });

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({
  locale: 'zh-TW',
  timezoneId: 'Asia/Taipei'
});
const page = await context.newPage();

console.log(`Opening ${targetUrl}`);
await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

const rl = createInterface({ input, output });
await rl.question(
  [
    '',
    'Log in to LitMedia in the browser window.',
    'After the page shows your signed-in account, return here and press Enter.',
    ''
  ].join('\n')
);
rl.close();

await context.storageState({ path: statePath });
console.log(`Saved Playwright storage state to ${statePath}`);

await browser.close();
