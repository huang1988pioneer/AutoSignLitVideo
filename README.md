# CronLitVideo

English | [中文](./README.zh-CN.md)

LitMedia daily check-in helper powered by Playwright and GitHub Actions.

## How it works

1. Run an interactive login locally and save Playwright storage state for each account.
2. Store each storage state as a numbered GitHub Secret.
3. GitHub Actions opens LitMedia for each configured account every day and clicks the daily check-in button when it is available.

This does not bypass CAPTCHA, human verification, or account risk checks. If LitMedia requires a fresh login or verification challenge, refresh the saved storage state locally and update the secret.

## Local setup

```powershell
npm install
npm run auth
```

If PowerShell blocks `npm.ps1`, run the same commands through `cmd`:

```powershell
cmd /c npm install
cmd /c npm run auth
```

`npm run auth` opens Chromium. Log in to LitMedia, make sure your account is visible, then return to the terminal and press Enter. The login state is saved to:

```text
auth/litmedia.storageState.json
```

For numbered multi-account setup, pass the account number so each login state is saved to a separate file:

```powershell
cmd /c npm run auth -- 1
```

That saves account `1` to:

```text
auth/account-1.storageState.json
```

> **Important: put a space after `--`.**
>
> npm needs `--` (with a space after it) to pass the account number into the script.
>
> | Command | Result |
> | --- | --- |
> | `cmd /c npm run auth -- 4` | Correct → saves `auth/account-4.storageState.json` |
> | `cmd /c npm run auth --4` | Wrong → number is **not** passed; saves `auth/litmedia.storageState.json` instead |
>
> The same rule applies to `secret`: use `cmd /c npm run secret -- 4`, not `--4`.
> After a successful auth, the terminal should print `Saved Playwright storage state to auth/account-N.storageState.json`. If you see `litmedia.storageState.json`, the account number was not passed.
Test the check-in locally (single account; default file `auth/litmedia.storageState.json`):

```powershell
npm run checkin
```

PowerShell execution policy workaround:

```powershell
cmd /c npm run checkin
```

To run all configured accounts locally in sequence (same isolation model as GitHub Actions), use `checkin:all`. For each account `N` it prefers the env secret `LITMEDIA_STORAGE_STATE_BASE64_N`, otherwise the local file `auth/account-N.storageState.json`. Accounts with neither are skipped.

```powershell
cmd /c npm run checkin:all
```

Or, if PowerShell does not block npm:

```powershell
npm run checkin:all
```

Optional environment variables for local multi-account runs:

```text
LITMEDIA_ACCOUNT_MIN=1
LITMEDIA_ACCOUNT_MAX=33
LITMEDIA_DELAY_MIN_MS=5000
LITMEDIA_DELAY_MAX_MS=15000
LITMEDIA_URL=https://www.litmedia.ai/tw/app/litvideo/home/
LITMEDIA_FAIL_ON_ACCOUNT_ERROR=false
HEADLESS=true
```

Example: only accounts 1–5, with a visible browser:

```powershell
$env:LITMEDIA_ACCOUNT_MIN="1"
$env:LITMEDIA_ACCOUNT_MAX="5"
$env:HEADLESS="false"
cmd /c npm run checkin:all
```

A run summary is written to `test-results/checkin-summary.md`.

## GitHub Actions setup

Convert the storage state file to base64:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("auth/litmedia.storageState.json")) | Set-Clipboard
```

Or use the helper command to validate the JSON and copy the GitHub Secret value automatically:

```powershell
cmd /c npm run secret -- 1
```

The number maps to both the local storage file and the secret name. For example, `1` reads `auth/account-1.storageState.json` and copies the value for `LITMEDIA_STORAGE_STATE_BASE64_1`; `33` reads `auth/account-33.storageState.json` and copies the value for `LITMEDIA_STORAGE_STATE_BASE64_33`.

Create numbered repository secrets from `1` to `33`:

```text
LITMEDIA_STORAGE_STATE_BASE64_1
LITMEDIA_STORAGE_STATE_BASE64_2
...
LITMEDIA_STORAGE_STATE_BASE64_33
```

Paste each account's copied base64 value into its matching secret.

For multiple accounts, repeat this flow:

1. Run `cmd /c npm run auth -- <account-number>`.
2. Log in as the next LitMedia account.
3. Run `cmd /c npm run secret -- <account-number>`.
4. Save it as `LITMEDIA_STORAGE_STATE_BASE64_<account-number>`.

Example:

```powershell
cmd /c npm run auth -- 1
cmd /c npm run secret -- 1

cmd /c npm run auth -- 2
cmd /c npm run secret -- 2
```

Optional repository variable:

```text
LITMEDIA_URL=https://www.litmedia.ai/tw/app/litvideo/home/
```

The workflow runs every day at `05:05` and `17:05` Asia/Taipei time, and can also be started manually from the GitHub Actions tab. It installs Playwright once, then runs configured accounts `1` through `33` in sequence. Each account launches its own Chromium browser, uses its own storage state, and closes that browser before the next account starts. Accounts without a matching secret are skipped.

The design intentionally prioritizes account isolation. The accounts still run sequentially instead of in bulk parallel jobs, but cookies, localStorage, browser contexts, and browser processes are separated per account.

Configured accounts wait a random `5` to `15` seconds between runs by default. You can override this with repository variables:

```text
LITMEDIA_DELAY_MIN_MS=5000
LITMEDIA_DELAY_MAX_MS=15000
```

## Troubleshooting

- **Missing `auth/account-N.storageState.json` after auth:** you likely ran `npm run auth --N` (no space). Use `cmd /c npm run auth -- N` with a space after `--`. Check the terminal log: it must say `auth/account-N.storageState.json`, not `auth/litmedia.storageState.json`.
- If the action says the storage state is missing, confirm the matching numbered secret exists in GitHub Secrets, such as `LITMEDIA_STORAGE_STATE_BASE64_7`.
- If login expired, rerun `npm run auth` (with `-- N` for numbered accounts), regenerate the base64 value, and update the secret.
- If the page layout changes, check the uploaded `litmedia-checkin-failure` screenshot artifact from the failed workflow run.
