import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const defaultTargetUrl = 'https://litmedia.ai/tw/app/litvideo/ai-image/';

export async function runLitMediaCheckin(browser, options = {}) {
  const {
    accountIndex,
    accountLabel,
    storageStateBase64,
    storageStatePath = 'auth/litmedia.storageState.json',
    targetUrl = defaultTargetUrl
  } = options;

  const accountSuffix = accountIndex ? `-${accountIndex}` : '';
  const resolvedStorageState = await resolveStorageState({
    accountIndex,
    storageStateBase64,
    storageStatePath
  });

  const context = await browser.newContext({
    locale: 'zh-TW',
    timezoneId: 'Asia/Taipei',
    storageState: resolvedStorageState
  });
  const page = await context.newPage();

  try {
    if (accountIndex) {
      const displayLabel = accountLabel ? `${accountIndex} (${accountLabel})` : accountIndex;
      console.log(`Running LitMedia check-in for account ${displayLabel}`);
    }

    console.log(`Opening ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});

    await openRewardPanelIfNeeded(page);

    const result = await clickDailyCheckin(page);
    console.log(result.message);

    await mkdir('.auth', { recursive: true });
    await context.storageState({ path: `.auth/latest${accountSuffix}.storageState.json` });
    return result;
  } catch (error) {
    await mkdir('test-results', { recursive: true });
    await page.screenshot({ path: `test-results/checkin-failure${accountSuffix}.png`, fullPage: true }).catch(() => {});
    throw error;
  } finally {
    await context.close();
  }
}

async function resolveStorageState({ accountIndex, storageStateBase64, storageStatePath }) {
  if (storageStateBase64) {
    const runtimeDir = process.env.RUNNER_TEMP ?? tmpdir();
    const decodedPath = join(runtimeDir, `litmedia-${accountIndex ?? 'single'}.storageState.json`);
    await writeFile(decodedPath, Buffer.from(storageStateBase64, 'base64'));
    return decodedPath;
  }

  if (!existsSync(storageStatePath)) {
    const secretName = accountIndex
      ? `LITMEDIA_STORAGE_STATE_BASE64_${accountIndex}`
      : 'LITMEDIA_STORAGE_STATE_BASE64';

    if (process.env.GITHUB_ACTIONS === 'true' && accountIndex) {
      console.log(`Skipping account ${accountIndex}: ${secretName} is not configured.`);
      return null;
    }

    throw new Error(
      `Missing storage state file: ${storageStatePath}\n` +
        `Run \`npm run auth\` locally first, or set ${secretName} in GitHub Secrets.`
    );
  }

  await readFile(storageStatePath, 'utf8');
  return storageStatePath;
}

async function openRewardPanelIfNeeded(page) {
  const heading = page.getByText('\u6bcf\u65e5\u7c3d\u5230\u734e\u52f5', { exact: true }).first();
  if (await heading.isVisible({ timeout: 5_000 }).catch(() => false)) {
    return;
  }

  const rewardTriggers = [
    page.getByRole('button', { name: /\u6bcf\u65e5|\u7c3d\u5230|\u734e\u52f5|\u79ae\u7269|gift/i }).first(),
    page.locator('[aria-label*="\\7c3d\\5230"], [aria-label*="\\734e\\52f5"], [aria-label*="gift" i]').first(),
    page.locator('img[src*="gift" i], svg[aria-label*="gift" i]').first()
  ];

  for (const trigger of rewardTriggers) {
    if (await trigger.isVisible({ timeout: 1_500 }).catch(() => false)) {
      await trigger.click({ timeout: 5_000 }).catch(() => {});
      if (await heading.isVisible({ timeout: 5_000 }).catch(() => false)) {
        return;
      }
    }
  }

  console.log('Reward panel was not visible; continuing to look for the check-in button.');
}

async function clickDailyCheckin(page) {
  const signedHints = [
    page.getByText(/\u5df2\u9023\u7e8c\u7c3d\u5230|\u5df2\u7c3d\u5230|\u4eca\u5929\u5df2\u7c3d/i).first(),
    page.getByText(/already checked|checked in/i).first()
  ];

  const signButton = page.getByRole('button', { name: /^\u7c3d\u5230$/ }).first();
  const fallbackButton = page.locator('button:has-text("\\7c3d\\5230")').first();
  const button = (await signButton.count()) > 0 ? signButton : fallbackButton;

  if ((await button.count()) === 0) {
    for (const hint of signedHints) {
      if (await hint.isVisible({ timeout: 1_000 }).catch(() => false)) {
        return { status: 'already_done', message: 'Already checked in or check-in state is visible.' };
      }
    }

    throw new Error('Could not find a check-in button. The page layout may have changed or login expired.');
  }

  if (!(await button.isEnabled({ timeout: 5_000 }).catch(() => false))) {
    return { status: 'already_done', message: 'Check-in button is disabled; likely already checked in.' };
  }

  await button.click({ timeout: 10_000 });
  await page.waitForTimeout(2_000);

  const successHints = [
    page.getByText(/\u7c3d\u5230\u6210\u529f|\u5df2\u7c3d\u5230|\u9818\u53d6\u6210\u529f|\u6210\u529f/i).first(),
    page.getByText(/success|checked in/i).first()
  ];

  for (const hint of successHints) {
    if (await hint.isVisible({ timeout: 2_000 }).catch(() => false)) {
      return { status: 'checked_in', message: 'Daily check-in completed successfully.' };
    }
  }

  return { status: 'clicked', message: 'Clicked the check-in button; no explicit success message was detected.' };
}
