# CronLitVideo

LitMedia daily check-in helper powered by Playwright and GitHub Actions.

## How it works

1. Run an interactive login locally and save Playwright storage state.
2. Store that storage state as a GitHub Secret.
3. GitHub Actions opens LitMedia every day and clicks the daily check-in button when it is available.

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

Create this repository secret:

```text
LITMEDIA_STORAGE_STATE_BASE64
```

Paste the copied base64 value into that secret.

Optional repository variable:

```text
LITMEDIA_URL=https://litmedia.ai/tw/app/litvideo/ai-image/
```

The workflow runs every day at `05:05` and `17:05` Asia/Taipei time, and can also be started manually from the GitHub Actions tab.

## Troubleshooting

- If the action says the storage state is missing, confirm `LITMEDIA_STORAGE_STATE_BASE64` exists in GitHub Secrets.
- If login expired, rerun `npm run auth`, regenerate the base64 value, and update the secret.
- If the page layout changes, check the uploaded `litmedia-checkin-failure` screenshot artifact from the failed workflow run.
