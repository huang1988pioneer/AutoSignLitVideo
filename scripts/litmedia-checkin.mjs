import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const defaultTargetUrl = 'https://www.litmedia.ai/tw/app/litvideo/home/';
export const checkinUrls = [
  defaultTargetUrl,
  'https://www.litmedia.ai/tw/app/litvideo/ai-video/',
  'https://www.litmedia.ai/tw/app/litvideo/ai-image/',
  'https://www.litmedia.ai/tw/app/litvideo/my-library'
];

/** @typedef {'already_done' | 'checked_in' | 'enabled' | 'missing' | 'login_required'} CheckinStatus */

/**
 * @typedef {object} CheckinResult
 * @property {CheckinStatus} status
 * @property {string} message
 * @property {import('playwright').Locator} [button]
 * @property {number} [continueDay]
 * @property {number} [pointsAwarded]
 * @property {string} [lastSignDay]
 * @property {number} [creditBalance]
 */

const TEXTS = {
  rewardHeading: '每日簽到獎勵',
  streak: /已連續簽到\s*(\d+)\s*天/,
  alreadySigned: /已連續簽到|已簽到|今天已簽|今日已簽|already checked/i,
  success: /簽到成功|領取成功|已簽到|獲得\s*\+?\d+|credits?\s*\+?\d+|\+\d+\s*(點|積分|credit)?/i,
  loginHints: /登入|登錄|sign\s*in|log\s*in|註冊/i
};

// API button_status values observed from get-web-sign-list.
const BUTTON_STATUS = {
  AVAILABLE: 1,
  CLAIMABLE: 2,
  ALREADY_DONE: 3
};

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

  if (!resolvedStorageState) {
    return {
      status: 'missing',
      message: `Skipped account ${accountIndex}: storage state is not configured.`
    };
  }

  const context = await browser.newContext({
    locale: 'zh-TW',
    timezoneId: 'Asia/Taipei',
    storageState: resolvedStorageState
  });
  const page = await context.newPage();
  const apiTracker = attachApiTracker(page);

  try {
    if (accountIndex) {
      const displayLabel = accountLabel ? `${accountIndex} (${accountLabel})` : accountIndex;
      console.log(`Running LitMedia check-in for account ${displayLabel}`);
    }

    const result = await checkDailyCheckinAcrossPages(page, buildCheckinUrls(targetUrl), apiTracker);

    await mkdir('.auth', { recursive: true });
    await context.storageState({ path: `.auth/latest${accountSuffix}.storageState.json` });
    return result;
  } catch (error) {
    await mkdir('test-results', { recursive: true });
    await page
      .screenshot({ path: `test-results/checkin-failure${accountSuffix}.png`, fullPage: true })
      .catch(() => {});
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

/**
 * Track sign-list / check-in / user-info API responses so we can verify rewards
 * without reverse-engineering request signatures.
 */
function attachApiTracker(page) {
  /** @type {{ signList: any | null, checkin: any | null, userInfo: any | null, login: any | null }} */
  const state = {
    signList: null,
    checkin: null,
    userInfo: null,
    login: null
  };

  const waiters = {
    signList: new Set(),
    checkin: new Set(),
    userInfo: new Set(),
    login: new Set()
  };

  page.on('response', async (response) => {
    const url = response.url();
    let key = null;
    if (url.includes('/lit-video/get-web-sign-list')) key = 'signList';
    else if (url.includes('/lit-video/web-checkin')) key = 'checkin';
    else if (url.includes('/lit-video/get-user-info')) key = 'userInfo';
    else if (url.includes('/account/check-login')) key = 'login';
    if (!key) return;

    try {
      const json = await response.json();
      state[key] = { status: response.status(), json, at: Date.now() };
      for (const resolve of waiters[key]) resolve(state[key]);
      waiters[key].clear();
    } catch {
      // ignore non-json responses
    }
  });

  return {
    get(key) {
      return state[key];
    },
    clear(key) {
      if (key) {
        state[key] = null;
        return;
      }
      state.signList = null;
      state.checkin = null;
    },
    async waitFor(key, timeoutMs = 15_000) {
      if (state[key]) return state[key];
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          waiters[key].delete(onData);
          reject(new Error(`Timed out waiting for ${key} API response.`));
        }, timeoutMs);

        const onData = (data) => {
          clearTimeout(timer);
          resolve(data);
        };
        waiters[key].add(onData);
      });
    }
  };
}

function giftIconLocator(page) {
  // Keep selectors simple: the live site uses alt="Gift credit" and gift-credit-*.png.
  return page.locator(
    'img[alt="Gift credit"], img[alt*="Gift"], img[src*="gift-credit"], img[src*="gift"]'
  );
}

async function dismissOverlays(page) {
  // Only dismiss known top banners; avoid generic "close" which can hit the reward dialog.
  const bannerClose = page.getByRole('button', { name: '關閉頂部橫幅' });
  const count = await bannerClose.count().catch(() => 0);
  for (let i = 0; i < Math.min(count, 3); i += 1) {
    const item = bannerClose.nth(i);
    if (await item.isVisible().catch(() => false)) {
      await item.click({ timeout: 2_000 }).catch(() => {});
    }
  }
}

async function waitForAppShell(page) {
  // Gift icon hydrates a few seconds after first paint; user menu appears earlier.
  const gift = giftIconLocator(page).first();
  const userMenu = page.getByRole('button', { name: /user menu/i }).first();

  await Promise.race([
    gift.waitFor({ state: 'visible', timeout: 25_000 }),
    userMenu.waitFor({ state: 'visible', timeout: 25_000 }),
    page.waitForTimeout(12_000)
  ]).catch(() => {});

  // Prefer waiting for the gift trigger itself when the account is logged in.
  await gift.waitFor({ state: 'visible', timeout: 12_000 }).catch(() => {});
}

async function ensureLoggedIn(page, apiTracker) {
  // Give check-login a moment if the request is still in flight.
  if (!apiTracker.get('login')) {
    await apiTracker.waitFor('login', 8_000).catch(() => null);
  }

  const login = apiTracker.get('login');
  if (login?.json?.code === 200) {
    return true;
  }
  if (login && login.json?.code !== 200) {
    return false;
  }

  const userMenu = page.getByRole('button', { name: /user menu|account|個人|帳戶/i }).first();
  if (await userMenu.isVisible({ timeout: 2_000 }).catch(() => false)) {
    return true;
  }

  const gift = giftIconLocator(page).first();
  if (await gift.isVisible({ timeout: 2_000 }).catch(() => false)) {
    return true;
  }

  const loginButton = page.getByRole('button', { name: TEXTS.loginHints }).first();
  if (await loginButton.isVisible({ timeout: 1_500 }).catch(() => false)) {
    return false;
  }

  // No positive login signal and no gift chrome — treat as logged out.
  return false;
}

async function openRewardPanelIfNeeded(page, apiTracker) {
  const heading = page.getByRole('heading', { name: TEXTS.rewardHeading }).first();
  const headingText = page.getByText(TEXTS.rewardHeading, { exact: true }).first();

  const panelVisible = async (timeout = 2_000) =>
    (await heading.isVisible({ timeout }).catch(() => false)) ||
    (await headingText.isVisible({ timeout: 500 }).catch(() => false));

  if (await panelVisible(1_500)) {
    await apiTracker.waitFor('signList', 5_000).catch(() => null);
    return true;
  }

  apiTracker.clear('signList');

  const gift = giftIconLocator(page).first();
  const giftReady = await gift.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false);

  if (giftReady) {
    // Click nearest interactive ancestor when present; otherwise force-click the image.
    const parentButton = gift.locator('xpath=ancestor::button[1]');
    const parentClickable = gift.locator(
      'xpath=ancestor::*[@role="button" or self::button or contains(@class,"cursor-pointer")][1]'
    );

    let clicked = false;
    if ((await parentButton.count()) > 0) {
      clicked = await parentButton
        .click({ timeout: 5_000 })
        .then(() => true)
        .catch(() => false);
    }
    if (!clicked && (await parentClickable.count()) > 0) {
      clicked = await parentClickable
        .click({ timeout: 5_000 })
        .then(() => true)
        .catch(() => false);
    }
    if (!clicked) {
      clicked = await gift
        .click({ force: true, timeout: 5_000 })
        .then(() => true)
        .catch(() => false);
    }

    if (clicked && (await panelVisible(8_000))) {
      await apiTracker.waitFor('signList', 10_000).catch(() => null);
      return true;
    }

    // Second attempt: force click the image again after a short settle.
    await page.waitForTimeout(800);
    await gift.click({ force: true, timeout: 5_000 }).catch(() => {});
    if (await panelVisible(8_000)) {
      await apiTracker.waitFor('signList', 10_000).catch(() => null);
      return true;
    }
  }

  // Fallback text/role triggers if the gift image is unavailable.
  const fallbackTriggers = [
    page.getByRole('button', { name: /每日簽到|簽到獎勵|禮物|gift|reward/i }).first(),
    page.locator('[aria-label*="簽到"], [aria-label*="獎勵"], [aria-label*="gift" i]').first()
  ];

  for (const trigger of fallbackTriggers) {
    if (!(await trigger.isVisible({ timeout: 1_500 }).catch(() => false))) {
      continue;
    }
    await trigger.click({ timeout: 5_000 }).catch(() => {});
    if (await panelVisible(6_000)) {
      await apiTracker.waitFor('signList', 8_000).catch(() => null);
      return true;
    }
  }

  console.log('Reward panel was not visible; continuing to look for the check-in button.');
  return false;
}

/**
 * @returns {Promise<CheckinResult>}
 */
async function getDailyCheckinState(page, apiTracker) {
  // Panel open usually triggers get-web-sign-list; wait a bit if it is still in flight.
  if (!apiTracker.get('signList')) {
    const headingVisible = await page
      .getByText(TEXTS.rewardHeading, { exact: true })
      .first()
      .isVisible()
      .catch(() => false);
    if (headingVisible) {
      await apiTracker.waitFor('signList', 8_000).catch(() => null);
    }
  }

  const signData = interpretSignList(apiTracker.get('signList')?.json);

  if (signData?.alreadyDone) {
    return {
      status: 'already_done',
      message: formatAlreadyDoneMessage(signData),
      continueDay: signData.continueDay,
      lastSignDay: signData.lastSignDay,
      pointsAwarded: signData.todayPoints
    };
  }

  const signedHints = [
    page.getByText(TEXTS.alreadySigned).first(),
    page.getByText(/今天已簽|今日已簽到|已領取/i).first()
  ];

  const buttons = await findCheckinButtons(page);
  if (buttons.length === 0) {
    for (const hint of signedHints) {
      if (await hint.isVisible({ timeout: 1_000 }).catch(() => false)) {
        return {
          status: 'already_done',
          message: 'Already checked in or check-in state is visible.',
          continueDay: signData?.continueDay,
          lastSignDay: signData?.lastSignDay
        };
      }
    }

    if (signData?.available) {
      return {
        status: 'missing',
        message: 'Sign-list says check-in is available, but no check-in button was found in the UI.'
      };
    }

    return { status: 'missing', message: 'Check-in button was not found.' };
  }

  // Prefer an enabled button; otherwise report the first disabled one as already done.
  for (const button of buttons) {
    const enabled = await button.isEnabled({ timeout: 2_000 }).catch(() => false);
    if (enabled) {
      return {
        status: 'enabled',
        message: 'Check-in button is enabled.',
        button,
        continueDay: signData?.continueDay,
        lastSignDay: signData?.lastSignDay,
        pointsAwarded: signData?.todayPoints
      };
    }
  }

  return {
    status: 'already_done',
    message: formatAlreadyDoneMessage(signData) || 'Check-in button is disabled; likely already checked in.',
    continueDay: signData?.continueDay,
    lastSignDay: signData?.lastSignDay,
    pointsAwarded: signData?.todayPoints
  };
}

async function findCheckinButtons(page) {
  const candidates = [
    page.getByRole('button', { name: /^簽到$/ }),
    page.getByRole('button', { name: /^(立即)?簽到|領取獎勵|領取|Check\s*in|Claim$/i }),
    page.locator('button', { hasText: /^簽到$/ }),
    page.locator('button:has-text("簽到")')
  ];

  /** @type {import('playwright').Locator[]} */
  const found = [];
  const seen = new Set();

  for (const locator of candidates) {
    const count = await locator.count().catch(() => 0);
    for (let i = 0; i < count; i += 1) {
      const button = locator.nth(i);
      if (!(await button.isVisible().catch(() => false))) continue;
      const box = await button.boundingBox().catch(() => null);
      const key = box ? `${Math.round(box.x)}:${Math.round(box.y)}:${Math.round(box.width)}` : await button.innerText().catch(() => String(i));
      if (seen.has(key)) continue;
      seen.add(key);
      found.push(button);
    }
  }

  return found;
}

function interpretSignList(payload) {
  if (!payload || payload.code !== 200 || !payload.data) {
    return null;
  }

  const data = payload.data;
  const continueDay = Number(data.continue_day ?? data.user_sign_data?.continue_day ?? 0) || 0;
  const lastSignDay = data.user_sign_data?.last_sign_day ?? null;
  const buttonStatus = Number(data.button_status);
  const today = taipeiDateString();
  const signedToday = Boolean(lastSignDay && lastSignDay === today);
  const rewards = Array.isArray(data.current_rewards_data) ? data.current_rewards_data : [];

  // Prefer the reward entry matching continue_day / today's claimed day.
  let todayPoints = null;
  const current =
    rewards.find((item) => Number(item.day) === continueDay) ||
    rewards.find((item) => Number(item.singed_status) === 2) ||
    null;
  if (current && Number.isFinite(Number(current.points_num))) {
    todayPoints = Number(current.points_num);
  }

  // button_status=3 is the observed "already signed today" value.
  // last_sign_day matching Asia/Taipei today is the strongest confirmation.
  const alreadyDone = signedToday || buttonStatus === BUTTON_STATUS.ALREADY_DONE;

  const available =
    !alreadyDone &&
    (buttonStatus === BUTTON_STATUS.AVAILABLE ||
      buttonStatus === BUTTON_STATUS.CLAIMABLE ||
      // Unknown status: let the UI button state decide.
      !Number.isFinite(buttonStatus));

  return {
    continueDay,
    lastSignDay,
    buttonStatus,
    todayPoints,
    signedToday,
    alreadyDone,
    available,
    raw: data
  };
}

function formatAlreadyDoneMessage(signData) {
  if (!signData) {
    return 'Already checked in or check-in state is visible.';
  }

  const parts = ['Already checked in today.'];
  if (signData.continueDay) {
    parts.push(`Streak: ${signData.continueDay} day(s).`);
  }
  if (signData.todayPoints != null) {
    parts.push(`Today's reward tier: +${signData.todayPoints}.`);
  }
  if (signData.lastSignDay) {
    parts.push(`Last sign day: ${signData.lastSignDay}.`);
  }
  return parts.join(' ');
}

/**
 * @returns {Promise<CheckinResult>}
 */
async function clickDailyCheckin(page, apiTracker, state) {
  if (state.status === 'missing') {
    throw new Error('Could not find a check-in button. The page layout may have changed or login expired.');
  }

  if (state.status !== 'enabled') {
    return state;
  }

  const creditBefore = await readCreditBalance(page, apiTracker);

  const preClickDelayMs = randomInt(2_000, 5_000);
  console.log(
    `Check-in button is enabled; waiting ${Math.round(preClickDelayMs / 1_000)} seconds before clicking.`
  );
  await page.waitForTimeout(preClickDelayMs);

  apiTracker.clear('checkin');
  apiTracker.clear('signList');

  await state.button.scrollIntoViewIfNeeded().catch(() => {});
  await state.button.click({ timeout: 10_000 });

  const verified = await verifyCheckinSuccess(page, apiTracker, {
    creditBefore,
    expectedPoints: state.pointsAwarded
  });

  if (verified) {
    return verified;
  }

  // One retry: reopen panel and click again if still enabled.
  console.log('First check-in attempt was not confirmed; retrying once.');
  await openRewardPanelIfNeeded(page, apiTracker);
  const retryState = await getDailyCheckinState(page, apiTracker);
  if (retryState.status === 'already_done') {
    return {
      ...retryState,
      status: 'checked_in',
      message: `Daily check-in completed (confirmed on retry). ${retryState.message}`
    };
  }

  if (retryState.status === 'enabled' && retryState.button) {
    apiTracker.clear('checkin');
    await page.waitForTimeout(randomInt(1_000, 2_000));
    await retryState.button.click({ timeout: 10_000 }).catch(() => {});
    const second = await verifyCheckinSuccess(page, apiTracker, {
      creditBefore,
      expectedPoints: retryState.pointsAwarded
    });
    if (second) return second;
  }

  throw new Error(
    'Clicked the check-in button but could not confirm that reward points were granted. ' +
      'Check the screenshot artifact and refresh the account storage state if login expired.'
  );
}

/**
 * @returns {Promise<CheckinResult | null>}
 */
async function verifyCheckinSuccess(page, apiTracker, { creditBefore, expectedPoints }) {
  // Prefer the dedicated check-in API response when available.
  const checkinResponse = await apiTracker.waitFor('checkin', 12_000).catch(() => null);
  if (checkinResponse?.json) {
    const payload = checkinResponse.json;
    if (payload.code === 200) {
      const points =
        Number(payload.data?.points_num ?? payload.data?.points ?? payload.data?.reward_points) ||
        expectedPoints ||
        null;
      const creditAfter = await readCreditBalance(page, apiTracker);
      return {
        status: 'checked_in',
        message: formatCheckedInMessage({ points, creditBefore, creditAfter, source: 'web-checkin API' }),
        pointsAwarded: points ?? undefined,
        creditBalance: creditAfter ?? undefined,
        continueDay: Number(payload.data?.continue_day) || undefined,
        lastSignDay: payload.data?.last_sign_day || taipeiDateString()
      };
    }

    // Some responses use non-200 for "already signed" — still a success for our purpose.
    if (/already|signed|簽到|重複/i.test(String(payload.msg ?? ''))) {
      return {
        status: 'already_done',
        message: `Check-in API reports already completed: ${payload.msg}`,
        pointsAwarded: expectedPoints ?? undefined
      };
    }
  }

  // Fall back to refreshed sign-list / UI state.
  await page.waitForTimeout(1_500);
  await openRewardPanelIfNeeded(page, apiTracker);
  const signList = await apiTracker.waitFor('signList', 8_000).catch(() => apiTracker.get('signList'));
  const signData = interpretSignList(signList?.json);
  if (signData?.alreadyDone || signData?.signedToday) {
    const creditAfter = await readCreditBalance(page, apiTracker);
    return {
      status: 'checked_in',
      message: formatCheckedInMessage({
        points: expectedPoints ?? signData.todayPoints,
        creditBefore,
        creditAfter,
        source: 'sign-list verification'
      }),
      pointsAwarded: expectedPoints ?? signData.todayPoints ?? undefined,
      creditBalance: creditAfter ?? undefined,
      continueDay: signData.continueDay,
      lastSignDay: signData.lastSignDay
    };
  }

  // UI success toasts / disabled button.
  const successHints = [
    page.getByText(TEXTS.success).first(),
    page.getByText(/success|checked in/i).first()
  ];
  for (const hint of successHints) {
    if (await hint.isVisible({ timeout: 1_500 }).catch(() => false)) {
      const postState = await getDailyCheckinState(page, apiTracker);
      if (postState.status === 'already_done' || postState.status === 'enabled') {
        // If still enabled, toast alone is not enough.
        if (postState.status === 'enabled') continue;
      }
      const creditAfter = await readCreditBalance(page, apiTracker);
      return {
        status: 'checked_in',
        message: formatCheckedInMessage({
          points: expectedPoints,
          creditBefore,
          creditAfter,
          source: 'success toast'
        }),
        pointsAwarded: expectedPoints ?? undefined,
        creditBalance: creditAfter ?? undefined
      };
    }
  }

  const postState = await getDailyCheckinState(page, apiTracker);
  if (postState.status === 'already_done') {
    const creditAfter = await readCreditBalance(page, apiTracker);
    return {
      status: 'checked_in',
      message: formatCheckedInMessage({
        points: expectedPoints ?? postState.pointsAwarded,
        creditBefore,
        creditAfter,
        source: 'button disabled after click'
      }),
      pointsAwarded: expectedPoints ?? postState.pointsAwarded,
      creditBalance: creditAfter ?? undefined,
      continueDay: postState.continueDay,
      lastSignDay: postState.lastSignDay
    };
  }

  // Credit balance increased — treat as success even if toast was missed.
  const creditAfter = await readCreditBalance(page, apiTracker);
  if (
    creditBefore != null &&
    creditAfter != null &&
    creditAfter > creditBefore
  ) {
    return {
      status: 'checked_in',
      message: formatCheckedInMessage({
        points: creditAfter - creditBefore,
        creditBefore,
        creditAfter,
        source: 'credit balance increase'
      }),
      pointsAwarded: creditAfter - creditBefore,
      creditBalance: creditAfter
    };
  }

  return null;
}

function formatCheckedInMessage({ points, creditBefore, creditAfter, source }) {
  const parts = ['Daily check-in completed successfully.'];
  if (points != null) {
    parts.push(`Reward: +${points} points.`);
  }
  if (creditBefore != null && creditAfter != null) {
    parts.push(`Credits: ${creditBefore} → ${creditAfter}.`);
  } else if (creditAfter != null) {
    parts.push(`Credits now: ${creditAfter}.`);
  }
  if (source) {
    parts.push(`Verified via ${source}.`);
  }
  return parts.join(' ');
}

async function readCreditBalance(page, apiTracker) {
  const userInfo = apiTracker.get('userInfo')?.json?.data;
  if (userInfo) {
    const free = Number(userInfo.free_times);
    const vip = Number(userInfo.vip_times);
    if (Number.isFinite(free) || Number.isFinite(vip)) {
      return (Number.isFinite(free) ? free : 0) + (Number.isFinite(vip) ? vip : 0);
    }
    if (Number.isFinite(Number(userInfo.total_times))) {
      // total_times is lifetime pool; prefer free+vip for the header badge.
    }
  }

  // Header badge near gift icon: a short numeric label (e.g. "44").
  try {
    const gift = giftIconLocator(page).first();
    if (await gift.isVisible().catch(() => false)) {
      const nearby = gift.locator(
        'xpath=ancestor::*[self::button or self::div][1]/following-sibling::*[1]//*[normalize-space(text())!=""]'
      );
      const text = ((await nearby.first().innerText({ timeout: 1_000 }).catch(() => '')) || '').trim();
      if (/^\d+$/.test(text)) return Number(text);
    }
  } catch {
    // ignore
  }

  return null;
}

async function checkDailyCheckinAcrossPages(page, urls, apiTracker) {
  let lastState = null;
  let alreadyDoneState = null;
  let loginFailed = false;

  for (let i = 0; i < urls.length; i += 1) {
    const url = urls[i];
    console.log(`Opening ${url}`);
    apiTracker.clear();

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    // SPAs often never reach networkidle; wait for header chrome / gift icon hydration.
    await waitForAppShell(page);
    await dismissOverlays(page);

    const loggedIn = await ensureLoggedIn(page, apiTracker);
    if (!loggedIn) {
      loginFailed = true;
      console.log(`Login state not detected on ${url}.`);
      if (i < urls.length - 1) {
        await delayBeforeNextPage();
        continue;
      }
      break;
    }

    const panelOpened = await openRewardPanelIfNeeded(page, apiTracker);
    if (!panelOpened) {
      console.log(`Reward panel did not open on ${url}.`);
    }

    const state = await getDailyCheckinState(page, apiTracker);
    lastState = state;
    console.log(`Check-in button state on ${url}: ${state.message}`);

    if (state.status === 'already_done') {
      alreadyDoneState = state;
      // Confirmed via API/UI — no need to keep scanning other pages.
      console.log(state.message);
      return state;
    }

    if (state.status === 'enabled') {
      const result = await clickDailyCheckin(page, apiTracker, state);
      console.log(result.message);
      return result;
    }

    if (i < urls.length - 1) {
      await delayBeforeNextPage();
    }
  }

  if (alreadyDoneState) {
    console.log(alreadyDoneState.message);
    return alreadyDoneState;
  }

  if (loginFailed) {
    throw new Error(
      'Login session appears expired. Re-run `npm run auth` and update the GitHub secret storage state.'
    );
  }

  throw new Error(lastState?.message ?? 'Could not find a check-in button on any configured page.');
}

async function delayBeforeNextPage() {
  const redirectDelayMs = randomInt(3_000, 7_000);
  console.log(`Waiting ${Math.round(redirectDelayMs / 1_000)} seconds before opening the next page.`);
  await new Promise((resolve) => setTimeout(resolve, redirectDelayMs));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function buildCheckinUrls(targetUrl) {
  const normalizedTargetUrl = targetUrl?.trim();
  if (!normalizedTargetUrl || normalizedTargetUrl === defaultTargetUrl) {
    return checkinUrls;
  }

  return [normalizedTargetUrl, ...checkinUrls.filter((url) => url !== normalizedTargetUrl)];
}

function taipeiDateString(date = new Date()) {
  // en-CA yields YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}
