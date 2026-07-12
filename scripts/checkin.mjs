import { chromium } from 'playwright';
import { defaultTargetUrl, runLitMediaCheckin } from './litmedia-checkin.mjs';

const browser = await chromium.launch({ headless: process.env.HEADLESS !== 'false' });

try {
  const result = await runLitMediaCheckin(browser, {
    accountIndex: process.env.LITMEDIA_ACCOUNT_INDEX,
    accountLabel: process.env.LITMEDIA_ACCOUNT_LABEL,
    storageStateBase64: process.env.LITMEDIA_STORAGE_STATE_BASE64,
    storageStatePath: process.env.LITMEDIA_STORAGE_STATE_PATH ?? 'auth/litmedia.storageState.json',
    targetUrl: process.env.LITMEDIA_URL?.trim() || defaultTargetUrl
  });

  console.log(`Check-in result: ${result.status} — ${result.message}`);
  if (result.pointsAwarded != null) {
    console.log(`Points awarded / tier: ${result.pointsAwarded}`);
  }
  if (result.creditBalance != null) {
    console.log(`Credit balance: ${result.creditBalance}`);
  }
  if (result.continueDay != null) {
    console.log(`Continue day streak: ${result.continueDay}`);
  }

  // Ambiguous or missing outcomes should fail the process so CI surfaces them.
  if (result.status === 'missing') {
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
