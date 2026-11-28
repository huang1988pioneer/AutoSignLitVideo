import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
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

await mkdir(dirname(statePath), { recursive: true, mode: 0o700 });
await ensureBrowserInstalled(browserName);

const browser = await launchBrowser({ browserName, headless: false });
try {
  const context = await browser.newContext({ locale: 'zh-TW', timezoneId: 'Asia/Taipei' });
  const page = await context.newPage();
  console.log(`Opening ${targetUrl}`);
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

  const desktop = rest.includes('--desktop');
  const rl = createInterface({ input, output });
  const controller = new AbortController();
  const cancel = () => controller.abort();
  browser.once('disconnected', cancel);
  rl.once('close', cancel);
  try {
    if (!browser.isConnected()) throw new Error('登入瀏覽器已關閉。');
    const prompt = desktop ? '' : [
      '',
      `Log in to LitMedia in the ${browserName} window.`,
      'After the page shows your signed-in account, return here and press Enter.',
      ''
    ].join('\n');
    const confirmation = rl.question(prompt, { signal: controller.signal });
    if (desktop) console.log('LITMEDIA_LOGIN_READY');
    const answer = await confirmation;
    if (desktop && answer !== 'save') throw new Error('已取消儲存。');
  } finally {
    browser.off('disconnected', cancel);
    rl.off('close', cancel);
    rl.close();
  }

  // Replace the previous session only after the new snapshot has been written completely.
  const temporary = `${statePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(await context.storageState()), { flag: 'wx', mode: 0o600 });
    await rename(temporary, statePath);
  } finally {
    await rm(temporary, { force: true });
  }
  console.log(`Saved Playwright storage state to ${statePath}`);
} catch (error) {
  console.error(error.name === 'AbortError' ? '登入視窗已關閉。' : error.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}

function defaultStatePath(index) {
  return index ? `auth/account-${index}.storageState.json` : 'auth/litmedia.storageState.json';
}
