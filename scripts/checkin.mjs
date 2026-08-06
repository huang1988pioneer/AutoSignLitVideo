import { launchBrowser, resolveBrowserName } from './browser.mjs';
import { buildCheckinRecord, recordCheckinResult } from './checkin-result.mjs';
import { defaultTargetUrl, runLitMediaCheckin } from './litmedia-checkin.mjs';

const browserName = resolveBrowserName(process.env.LITMEDIA_BROWSER);
const accountIndex = process.env.LITMEDIA_ACCOUNT_INDEX;
const accountLabel = process.env.LITMEDIA_ACCOUNT_LABEL;
const browser = await launchBrowser({ browserName });

try {
  const result = await runLitMediaCheckin(browser, {
    accountIndex,
    accountLabel,
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

  const record = buildCheckinRecord({ accountIndex, accountLabel, result });
  await recordCheckinResult(record);

  // Ambiguous or missing outcomes should fail the process so CI surfaces them.
  if (result.status === 'missing' || result.status === 'failed') {
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  const message = error instanceof Error ? error.message : String(error);
  const record = buildCheckinRecord({
    accountIndex,
    accountLabel,
    result: { status: 'failed', message },
    error: message
  });
  await recordCheckinResult(record).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
