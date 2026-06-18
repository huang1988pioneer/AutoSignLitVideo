import { chromium } from 'playwright';
import { defaultTargetUrl, runLitMediaCheckin } from './litmedia-checkin.mjs';

const browser = await chromium.launch({ headless: process.env.HEADLESS !== 'false' });

try {
  await runLitMediaCheckin(browser, {
    accountIndex: process.env.LITMEDIA_ACCOUNT_INDEX,
    accountLabel: process.env.LITMEDIA_ACCOUNT_LABEL,
    storageStateBase64: process.env.LITMEDIA_STORAGE_STATE_BASE64,
    storageStatePath: process.env.LITMEDIA_STORAGE_STATE_PATH ?? 'auth/litmedia.storageState.json',
    targetUrl: process.env.LITMEDIA_URL?.trim() || defaultTargetUrl
  });
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
