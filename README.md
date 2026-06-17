# CronLitVideo

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

Test the check-in locally:

```powershell
npm run checkin
```

PowerShell execution policy workaround:

```powershell
cmd /c npm run checkin
```

## GitHub Actions setup

Convert the storage state file to base64:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("auth/litmedia.storageState.json")) | Set-Clipboard
```

Or use the helper command to validate the JSON and copy the GitHub Secret value automatically:

```powershell
cmd /c npm run secret -- 1
```

The number maps to the secret name. For example, `1` copies the value for `LITMEDIA_STORAGE_STATE_BASE64_1`; `33` copies the value for `LITMEDIA_STORAGE_STATE_BASE64_33`.

Create numbered repository secrets from `1` to `33`:

```text
LITMEDIA_STORAGE_STATE_BASE64_1
LITMEDIA_STORAGE_STATE_BASE64_2
...
LITMEDIA_STORAGE_STATE_BASE64_33
```

Paste each account's copied base64 value into its matching secret.

For multiple accounts, repeat this flow:

1. Run `cmd /c npm run auth`.
2. Log in as the next LitMedia account.
3. Run `cmd /c npm run secret -- <account-number>`.
4. Save it as `LITMEDIA_STORAGE_STATE_BASE64_<account-number>`.

Optional repository variable:

```text
LITMEDIA_URL=https://litmedia.ai/tw/app/litvideo/ai-image/
```

The workflow runs every day at `05:05` and `17:05` Asia/Taipei time, and can also be started manually from the GitHub Actions tab. It runs accounts `1` through `33` with `max-parallel: 4`.

## Troubleshooting

- If the action says the storage state is missing, confirm the matching numbered secret exists in GitHub Secrets, such as `LITMEDIA_STORAGE_STATE_BASE64_7`.
- If login expired, rerun `npm run auth`, regenerate the base64 value, and update the secret.
- If the page layout changes, check the uploaded `litmedia-checkin-failure` screenshot artifact from the failed workflow run.
