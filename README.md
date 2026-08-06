# CronLitVideo

English | [中文](./README.zh-CN.md)

LitMedia daily check-in helper powered by Playwright and GitHub Actions.

## Desktop helper (Avalonia)

`LitMediaFlow` is a small Windows desktop companion inspired by AutoSignOiiOii. It keeps the existing Playwright workflow intact while making per-account sign-in state easier to prepare:

```powershell
dotnet run --project LitMediaFlow/LitMediaFlow.csproj
```

Choose an account, open the interactive login flow, then copy its Base64 storage state to the matching `LITMEDIA_STORAGE_STATE_BASE64_N` GitHub Secret. Passwords are never stored by the app; OTP, CAPTCHA, and risk checks must still be completed manually.

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

`npm run auth` opens **Chromium** by default (recommended). Log in to LitMedia, make sure your account is visible, then return to the terminal and press Enter. The login state is saved to:

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

### Browser choice (Chromium default; Firefox / Edge fallbacks)

Playwright can use **Chromium** (default), **Firefox**, or **Microsoft Edge** (fallbacks). Use the same browser for login and check-in.

```powershell
# Default: Chromium
cmd /c npm run auth -- 1

# Fallback: Firefox
cmd /c npm run auth -- 1 --browser firefox
# or:
cmd /c npm run auth:firefox -- 1

# Fallback: Microsoft Edge (requires Edge on this machine)
cmd /c npm run auth -- 1 --browser edge
# or:
cmd /c npm run auth:edge -- 1

# Optional: preinstall supported browsers
cmd /c npm run browsers
```

Environment variable (auth + check-in + CI):

```text
LITMEDIA_BROWSER=chromium
# or
LITMEDIA_BROWSER=firefox
# or
LITMEDIA_BROWSER=edge
```

PowerShell example for local Edge check-in:

```powershell
$env:LITMEDIA_BROWSER="edge"
cmd /c npm run checkin:all
```

In `LitMediaFlow`, open **建立登入狀態** and pick **Chromium（預設）**, **Firefox（備案）**, or **Edge（備案）** before starting login. Keep GitHub Actions on the same browser via repository variable `LITMEDIA_BROWSER` or the manual workflow input.

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
LITMEDIA_BROWSER=chromium
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

Optional repository variables:

```text
LITMEDIA_URL=https://www.litmedia.ai/tw/app/litvideo/home/
LITMEDIA_BROWSER=chromium
```

Set `LITMEDIA_BROWSER=firefox` or `LITMEDIA_BROWSER=edge` if you saved login state with that browser. Manual runs can also pick the browser from the workflow dispatch input (`chromium`, `firefox`, or `edge`).

### Daily schedule (three Taipei windows)

GitHub Actions runs every day in these Asia/Taipei windows (and can also be started manually):

| Window (Taipei) | How it starts |
| --- | --- |
| 05:00–06:00 | Fires on the hour, then waits a random 0–59 minutes |
| 13:00–14:00 | Fires on the hour, then waits a random 0–59 minutes |
| 21:00–22:00 | Fires on the hour, then waits a random 0–59 minutes |

(cron is UTC `0 21 * * *`, `0 5 * * *`, and `0 13 * * *`.)

### 33 accounts: staggered parallel starts

Each scheduled run launches up to **33 account jobs at once** (matrix), but **start times are staggered in order** so they do not all click in the same second:

1. Account 1 starts first (delay 0).
2. Account 2 starts a random **5–15 seconds** after account 1’s scheduled start.
3. Account 3 starts a random **5–15 seconds** after account 2’s scheduled start.
4. And so on through account 33.

If account 1 starts at `T`, account *n* starts around `T + Σ(5…15)` seconds. Neighboring accounts may overlap (no need to wait for the previous browser to finish), but they do not all click simultaneously. Each job uses its own storage state and browser process. Accounts without a matching secret are skipped. GitHub’s own scheduler can also drift, so wall-clock start may be slightly later than the window above.

Local `checkin:all` still runs accounts one after another and waits a random `5` to `15` seconds **between** finished runs (override with repository / env variables):

```text
LITMEDIA_DELAY_MIN_MS=5000
LITMEDIA_DELAY_MAX_MS=15000
```

### Streak days (continuous check-in)

Each successful or already-done check-in records LitMedia’s `continue_day` as **streak days**:

| File | Purpose |
| --- | --- |
| `test-results/checkin-result-N.json` | Per-account result including `streakDays` |
| `test-results/streaks.json` | Aggregate registry (local `checkin:all` or CI summarize) |
| `test-results/streaks.md` | Same data as a Markdown table |

Logs also emit a desktop-parsable compact line, for example:

```text
- #6 samafengtu: checked_in reward=+10 streak=4
```

Scheduled GitHub Actions runs upload artifact `litmedia-streaks-<run_id>` with the streak registry.

## Troubleshooting

- **Missing `auth/account-N.storageState.json` after auth:** you likely ran `npm run auth --N` (no space). Use `cmd /c npm run auth -- N` with a space after `--`. Check the terminal log: it must say `auth/account-N.storageState.json`, not `auth/litmedia.storageState.json`.
- If the action says the storage state is missing, confirm the matching numbered secret exists in GitHub Secrets, such as `LITMEDIA_STORAGE_STATE_BASE64_7`.
- If login expired, rerun `npm run auth` (with `-- N` for numbered accounts), regenerate the base64 value, and update the secret.
- If Chromium login or check-in fails oddly, try a fallback browser (`--browser firefox` / `--browser edge`, or `LITMEDIA_BROWSER=firefox|edge`), re-save the storage state, and use the same browser in CI.
- Edge uses the installed Microsoft Edge via Playwright channel `msedge` (`npx playwright install msedge`).
- If the page layout changes, check the uploaded `litmedia-checkin-failure` screenshot artifact from the failed workflow run.
