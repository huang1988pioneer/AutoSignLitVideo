import { spawnSync } from 'node:child_process';
import { chromium, firefox } from 'playwright';

/** @typedef {'chromium' | 'firefox' | 'edge'} BrowserName */

export const SUPPORTED_BROWSERS = /** @type {const} */ (['chromium', 'firefox', 'edge']);

/**
 * Map user-facing browser name to the Playwright install target.
 * Edge uses the system/channel install name `msedge`.
 *
 * @param {BrowserName} browserName
 * @returns {string}
 */
export function playwrightInstallTarget(browserName) {
  const name = resolveBrowserName(browserName);
  return name === 'edge' ? 'msedge' : name;
}

/**
 * Resolve Playwright browser from env or an explicit value.
 * Default is chromium; firefox and edge are supported fallbacks.
 *
 * @param {string | undefined | null} [raw]
 * @returns {BrowserName}
 */
export function resolveBrowserName(raw = process.env.LITMEDIA_BROWSER) {
  const value = String(raw ?? 'chromium').trim().toLowerCase();

  if (!value || value === 'chromium' || value === 'chrome') {
    return 'chromium';
  }

  if (value === 'firefox' || value === 'ff') {
    return 'firefox';
  }

  if (value === 'edge' || value === 'msedge' || value === 'microsoft-edge' || value === 'microsoftedge') {
    return 'edge';
  }

  throw new Error(
    `Unsupported LITMEDIA_BROWSER="${raw}". Use chromium (default), firefox, or edge (fallbacks).`
  );
}

/**
 * Human-readable browser label for logs and UI copy.
 *
 * @param {BrowserName | string} browserName
 * @returns {string}
 */
export function browserDisplayName(browserName) {
  switch (resolveBrowserName(browserName)) {
    case 'firefox':
      return 'Firefox';
    case 'edge':
      return 'Microsoft Edge';
    default:
      return 'Chromium';
  }
}

/**
 * Parse CLI flags used by interactive auth.
 * Accepts: `--browser firefox`, `--browser=edge`, and a bare account index.
 *
 * @param {string[]} argv
 * @returns {{ accountIndex: string | undefined, browserName: BrowserName, rest: string[] }}
 */
export function parseAuthArgs(argv) {
  /** @type {string | undefined} */
  let browserRaw;
  /** @type {string | undefined} */
  let accountIndex;
  /** @type {string[]} */
  const rest = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--browser' || arg === '-b') {
      browserRaw = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg.startsWith('--browser=')) {
      browserRaw = arg.slice('--browser='.length);
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      rest.push(arg);
      continue;
    }

    if (!accountIndex && /^\d+$/.test(arg)) {
      accountIndex = arg;
      continue;
    }

    rest.push(arg);
  }

  return {
    accountIndex,
    browserName: resolveBrowserName(browserRaw ?? process.env.LITMEDIA_BROWSER),
    rest
  };
}

/**
 * Ensure the selected Playwright browser binary is installed (local interactive use).
 *
 * @param {BrowserName} browserName
 */
export function ensureBrowserInstalled(browserName) {
  const name = resolveBrowserName(browserName);
  const installTarget = playwrightInstallTarget(name);
  console.log(`Ensuring Playwright browser is installed: ${name} (${installTarget})`);

  const result = spawnSync('npx', ['playwright', 'install', installTarget], {
    stdio: 'inherit',
    shell: true
  });

  if (result.status !== 0) {
    throw new Error(
      `Failed to install Playwright browser "${name}". Try: npx playwright install ${installTarget}`
    );
  }
}

/**
 * Launch Chromium (default), Firefox, or Edge (fallbacks).
 * Edge is launched via Chromium channel `msedge`.
 *
 * @param {{ headless?: boolean, browserName?: string | null }} [options]
 * @returns {Promise<import('playwright').Browser>}
 */
export async function launchBrowser(options = {}) {
  const browserName = resolveBrowserName(options.browserName ?? process.env.LITMEDIA_BROWSER);
  const headless = options.headless ?? process.env.HEADLESS !== 'false';
  const installTarget = playwrightInstallTarget(browserName);

  /** @type {import('playwright').LaunchOptions} */
  const launchOptions = { headless };

  console.log(`Launching Playwright browser: ${browserName} (headless=${headless})`);

  try {
    if (browserName === 'firefox') {
      return await firefox.launch(launchOptions);
    }

    if (browserName === 'edge') {
      return await chromium.launch({ ...launchOptions, channel: 'msedge' });
    }

    return await chromium.launch(launchOptions);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      /Executable doesn't exist|browserType\.launch|Please run the following command|channel.*msedge/i.test(
        message
      )
    ) {
      const npmHint =
        browserName === 'firefox'
          ? 'npm run browsers:firefox'
          : browserName === 'edge'
            ? 'npm run browsers:edge'
            : 'npm run browsers:chromium';

      throw new Error(
        [
          message,
          '',
          `Install the selected browser, then retry:`,
          `  npx playwright install ${installTarget}`,
          `  (or: ${npmHint})`,
          browserName === 'edge'
            ? '  Edge requires Microsoft Edge on this machine (Playwright uses channel msedge).'
            : ''
        ]
          .filter(Boolean)
          .join('\n')
      );
    }
    throw error;
  }
}
