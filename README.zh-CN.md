# CronLitVideo

[English](./README.md) | 中文

以 Playwright 與 GitHub Actions 實作的 LitMedia 每日簽到助手。

## 運作方式

1. 在本機互動登入，並為每個帳號保存 Playwright storage state。
2. 將每個 storage state 存成對應編號的 GitHub Secret。
3. GitHub Actions 每天為已設定的帳號開啟 LitMedia，並在可簽到時點擊每日簽到。

本工具**不會**繞過 CAPTCHA、真人驗證或帳號風控。若 LitMedia 要求重新登入或完成驗證，請在本機重新保存 storage state，並更新對應 Secret。

## 本機設定

```powershell
npm install
npm run auth
```

若 PowerShell 擋下 `npm.ps1`，請改用 `cmd` 執行相同指令：

```powershell
cmd /c npm install
cmd /c npm run auth
```

`npm run auth` 會開啟 Chromium。登入 LitMedia、確認帳號已顯示後，回到終端機按 Enter。登入狀態會保存到：

```text
auth/litmedia.storageState.json
```

多帳號時請傳入帳號編號，讓每個登入狀態存成獨立檔案：

```powershell
cmd /c npm run auth -- 1
```

帳號 `1` 會保存到：

```text
auth/account-1.storageState.json
```

> **重要：`--` 後面一定要有空格。**
>
> npm 需要 `--`（後面加空格）才能把帳號編號傳給腳本。
>
> | 指令 | 結果 |
> | --- | --- |
> | `cmd /c npm run auth -- 4` | 正確 → 保存 `auth/account-4.storageState.json` |
> | `cmd /c npm run auth --4` | 錯誤 → 編號**沒有**傳入；會保存成 `auth/litmedia.storageState.json` |
>
> `secret` 也一樣：請用 `cmd /c npm run secret -- 4`，不要寫成 `--4`。
> 成功後終端應顯示 `Saved Playwright storage state to auth/account-N.storageState.json`。若看到 `litmedia.storageState.json`，代表帳號編號沒有傳入。

## 本機測試簽到

### 單帳號

預設讀取 `auth/litmedia.storageState.json`：

```powershell
npm run checkin
```

PowerShell 執行原則規避寫法：

```powershell
cmd /c npm run checkin
```

### 多帳號（`checkin:all`）

在本機依序跑所有已設定帳號（隔離方式與 GitHub Actions 相同）。對每個帳號 `N`：

1. 優先使用環境變數 `LITMEDIA_STORAGE_STATE_BASE64_N`
2. 否則使用本機檔案 `auth/account-N.storageState.json`
3. 兩者都沒有則跳過該帳號

```powershell
cmd /c npm run checkin:all
```

若 PowerShell 不擋 npm，也可以：

```powershell
npm run checkin:all
```

本機多帳號可選用的環境變數：

```text
LITMEDIA_ACCOUNT_MIN=1
LITMEDIA_ACCOUNT_MAX=33
LITMEDIA_DELAY_MIN_MS=5000
LITMEDIA_DELAY_MAX_MS=15000
LITMEDIA_URL=https://www.litmedia.ai/tw/app/litvideo/home/
LITMEDIA_FAIL_ON_ACCOUNT_ERROR=false
HEADLESS=true
```

範例：只跑帳號 1–5，並顯示瀏覽器視窗：

```powershell
$env:LITMEDIA_ACCOUNT_MIN="1"
$env:LITMEDIA_ACCOUNT_MAX="5"
$env:HEADLESS="false"
cmd /c npm run checkin:all
```

執行摘要會寫到 `test-results/checkin-summary.md`。

## GitHub Actions 設定

將 storage state 轉成 base64：

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("auth/litmedia.storageState.json")) | Set-Clipboard
```

或使用輔助指令：驗證 JSON 並自動複製 GitHub Secret 值：

```powershell
cmd /c npm run secret -- 1
```

編號會同時對應本機檔案與 Secret 名稱。例如 `1` 讀取 `auth/account-1.storageState.json`，並複製 `LITMEDIA_STORAGE_STATE_BASE64_1` 的值；`33` 則對應 `auth/account-33.storageState.json` 與 `LITMEDIA_STORAGE_STATE_BASE64_33`。

在倉庫建立編號 Secret（`1` 到 `33`）：

```text
LITMEDIA_STORAGE_STATE_BASE64_1
LITMEDIA_STORAGE_STATE_BASE64_2
...
LITMEDIA_STORAGE_STATE_BASE64_33
```

將每個帳號複製出的 base64 值貼到對應 Secret。

多帳號請重複：

1. 執行 `cmd /c npm run auth -- <帳號編號>`。
2. 以該 LitMedia 帳號登入。
3. 執行 `cmd /c npm run secret -- <帳號編號>`。
4. 存成 `LITMEDIA_STORAGE_STATE_BASE64_<帳號編號>`。

範例：

```powershell
cmd /c npm run auth -- 1
cmd /c npm run secret -- 1

cmd /c npm run auth -- 2
cmd /c npm run secret -- 2
```

可選倉庫變數：

```text
LITMEDIA_URL=https://www.litmedia.ai/tw/app/litvideo/home/
```

工作流程每天在 Asia/Taipei 時區的 `05:05` 與 `17:05` 執行，也可從 GitHub Actions 頁籤手動觸發。會先安裝一次 Playwright，再依序跑帳號 `1` 到 `33`。每個帳號各自啟動 Chromium、使用自己的 storage state，結束後關閉瀏覽器再處理下一個。沒有對應 Secret 的帳號會跳過。

設計上優先保證帳號隔離：雖然仍是循序執行（非大量並行），但 cookies、localStorage、browser context 與瀏覽器行程都按帳號分開。

已設定帳號之間預設隨機等待 `5` 到 `15` 秒。可用倉庫變數覆蓋：

```text
LITMEDIA_DELAY_MIN_MS=5000
LITMEDIA_DELAY_MAX_MS=15000
```

## 疑難排除

- **auth 後沒有 `auth/account-N.storageState.json`：** 多半是執行了 `npm run auth --N`（`--` 後沒空格）。請改用 `cmd /c npm run auth -- N`，並確認日誌顯示的是 `auth/account-N.storageState.json`，而不是 `auth/litmedia.storageState.json`。
- 若 Action 提示找不到 storage state，請確認 GitHub Secrets 中有對應編號，例如 `LITMEDIA_STORAGE_STATE_BASE64_7`。
- 若登入過期，請重新執行 `npm run auth`（多帳號用 `-- N`），再產生 base64 並更新 Secret。
- 若頁面版面變更，請查看失敗 workflow 上傳的 `litmedia-checkin-failure` 截圖 artifact。
