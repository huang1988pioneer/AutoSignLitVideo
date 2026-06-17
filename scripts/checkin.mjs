import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const targetUrl = process.env.LITMEDIA_URL ?? 'https://litmedia.ai/tw/app/litvideo/ai-image/';
const storageStatePath = await resolveStorageStatePath();
const headless = process.env.HEADLESS !== 'false';

const browser = await chromium.launch({ headless });
const context = await browser.newContext({
  locale: 'zh-TW',
  timezoneId: 'Asia/Taipei',
  storageState: storageStatePath
});
const page = await context.newPage();

try {
  console.log(`Opening ${targetUrl}`);
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});

  await openRewardPanelIfNeeded(page);

  const result = await clickDailyCheckin(page);
  console.log(result.message);

  await mkdir('.auth', { recursive: true });
  await context.storageState({ path: '.auth/latest.storageState.json' });
} catch (error) {
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/checkin-failure.png', fullPage: true }).catch(() => {});
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
} finally {
  await browser.close();
}

async function resolveStorageStatePath() {
  if (process.env.LITMEDIA_STORAGE_STATE_BASE64) {
    const runtimeDir = process.env.RUNNER_TEMP ?? tmpdir();
    const decodedPath = join(runtimeDir, 'litmedia.storageState.json');
    await writeFile(
      decodedPath,
      Buffer.from(process.env.LITMEDIA_STORAGE_STATE_BASE64, 'base64')
    );
    return decodedPath;
  }

  const path = process.env.LITMEDIA_STORAGE_STATE_PATH ?? 'auth/litmedia.storageState.json';
  if (!existsSync(path)) {
    throw new Error(
      `Missing storage state file: ${path}\n` +
        'Run `npm run auth` locally first, or set LITMEDIA_STORAGE_STATE_BASE64 in GitHub Secrets.'
    );
  }

  await readFile(path, 'utf8');
  return path;
}

async function openRewardPanelIfNeeded(page) {
  const heading = page.getByText('每日簽到獎勵', { exact: true }).first();
  if (await heading.isVisible({ timeout: 5_000 }).catch(() => false)) {
    return;
  }

  const rewardTriggers = [
    page.getByRole('button', { name: /每日|簽到|獎勵|禮物|gift/i }).first(),
    page.locator('[aria-label*="簽到"], [aria-label*="獎勵"], [aria-label*="gift" i]').first(),
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
    page.getByText(/已連續簽到|已簽到|今天已簽/i).first(),
    page.getByText(/already checked|checked in/i).first()
  ];

  const signButton = page.getByRole('button', { name: /^簽到$/ }).first();
  const fallbackButton = page.locator('button:has-text("簽到")').first();
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
    page.getByText(/簽到成功|已簽到|領取成功|成功/i).first(),
    page.getByText(/success|checked in/i).first()
  ];

  for (const hint of successHints) {
    if (await hint.isVisible({ timeout: 2_000 }).catch(() => false)) {
      return { status: 'checked_in', message: 'Daily check-in completed successfully.' };
    }
  }

  return { status: 'clicked', message: 'Clicked the check-in button; no explicit success message was detected.' };
}
