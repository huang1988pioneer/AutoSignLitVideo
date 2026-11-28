# 自動提交與推送

本專案的提交目的地是 [huang1988pioneer/AutoSignLitVideo](https://github.com/huang1988pioneer/AutoSignLitVideo)。

1. 任務產生檔案變更時，執行相關檢查。檢查通過後，暫存本次任務的變更，以 `git diff --cached` 核對內容，再建立說明修改目的的提交。
2. 確認 `origin` 的推送網址指向上述儲存庫，自動將提交推送到與目前本機分支同名的遠端分支。
3. 確認遠端分支已包含該提交，並在回覆中附上 GitHub 提交連結。若本次任務沒有檔案變更，直接回報任務結果。
