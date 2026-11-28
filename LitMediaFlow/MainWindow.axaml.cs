using System.Diagnostics;
using System.Text.Json;
using Avalonia;
using Avalonia.Automation;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Interactivity;

namespace LitMediaFlow;

public partial class MainWindow : Window
{
    private const int AccountCount = 33;
    private static readonly string[] BrowserOptions =
    [
        "Chromium（預設）",
        "Firefox（備案）",
        "Edge（備案）"
    ];
    private readonly (string Root, string AuthDirectory) _workspace = FindWorkspace();
    private readonly GitHubActionsService _github;
    private readonly Dictionary<int, string> _aliases = LoadAliases();
    private readonly Dictionary<int, TextBox> _aliasInputs = new();
    private string _browser = LoadBrowserPreference();
    private Process? _loginProcess;
    private bool _loginCancelled;
    private bool _showingRunAccounts;
    private string? _latestRunUrl;
    private DashboardAccount[] _displayedAccounts = [];

    public MainWindow()
    {
        InitializeComponent();
        MacDockIcon.ApplyFromResource();
        _github = new GitHubActionsService(_workspace.Root);
        AccountComboBox.ItemsSource = Enumerable.Range(1, AccountCount).Select(number => $"帳號 {number:00}").ToArray();
        AccountComboBox.SelectedIndex = 0;
        AccountComboBox.SelectionChanged += (_, _) =>
        {
            StatusText.Text = "";
            LoginStatusText.Text = "";
            RefreshAccountState();
        };
        BrowserComboBox.ItemsSource = BrowserOptions;
        BrowserComboBox.SelectedIndex = BrowserToIndex(_browser);
        BrowserComboBox.SelectionChanged += (_, _) => OnBrowserSelectionChanged();
        AccountTableHeader.Child = BuildAccountHeader();
        RefreshAccountState();
        RefreshBrowserHint();
        RefreshLocalAccounts();
        Activated += (_, _) =>
        {
            if (LoginView.IsVisible) RefreshAccountState();
            if (DashboardView.IsVisible) RefreshLocalAccounts();
        };
        Opened += MainWindow_OnOpened;
        Closed += (_, _) => StopLogin();
    }

    private int AccountNumber => AccountComboBox.SelectedIndex + 1;
    private string StateFile => Path.Combine(_workspace.AuthDirectory, $"account-{AccountNumber}.storageState.json");
    private string LegacyStateFile => Path.Combine(_workspace.AuthDirectory, "litmedia.storageState.json");
    private string SecretName => $"LITMEDIA_STORAGE_STATE_BASE64_{AccountNumber}";
    private static string AppDataDir => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "LitMediaFlow");
    private static string AliasFile => Path.Combine(AppDataDir, "account-aliases.json");
    private static string SettingsFile => Path.Combine(AppDataDir, "settings.json");

    private void RefreshLocalAccounts()
    {
        if (_showingRunAccounts) return;
        var accounts = Enumerable.Range(1, AccountCount).Select(number =>
        {
            var hasState = HasStateForAccount(number);
            var alias = _aliases.GetValueOrDefault(number);
            return new DashboardAccount(number, string.IsNullOrWhiteSpace(alias) ? "未設定別名" : alias, hasState ? "已儲存登入狀態" : "尚未儲存", hasState);
        }).ToArray();
        AccountsHeading.Text = "本機帳號狀態";
        AccountCountLabel.Text = "已儲存登入";
        ConfiguredAccountsText.Text = $"{accounts.Count(account => account.IsHealthy)} 個";
        RenderDashboardAccounts(accounts);
    }

    private void RenderDashboardAccounts(DashboardAccount[] accounts)
    {
        if (_displayedAccounts.SequenceEqual(accounts)) return;
        _displayedAccounts = accounts;
        DashboardAccountsPanel.Children.Clear();
        foreach (var account in accounts)
        {
            var row = CreateAccountGrid();
            var accountNumber = new TextBlock { Text = $"{account.Number:00}", Classes = { "data", "cell" } };
            var alias = new TextBlock
            {
                Text = account.Label, Classes = { "cell" },
                TextTrimming = TextTrimming.CharacterEllipsis
            };
            ToolTip.SetTip(alias, account.Label);
            var points = new TextBlock { Text = account.Points?.ToString("N0") ?? "—", Classes = { "data", "cell" } };
            var state = new TextBlock { Text = account.State, Classes = { "cell", "state" } };
            state.Classes.Set("healthy", account.IsHealthy);
            Grid.SetColumn(alias, 1);
            Grid.SetColumn(points, 2);
            Grid.SetColumn(state, 3);
            row.Children.Add(accountNumber);
            row.Children.Add(alias);
            row.Children.Add(points);
            row.Children.Add(state);
            DashboardAccountsPanel.Children.Add(new Border { Classes = { "row" }, Child = row });
        }
    }

    private static Grid CreateAccountGrid() => new()
    {
        ColumnDefinitions = new ColumnDefinitions("56,5*,3*,6*"),
        ColumnSpacing = 10
    };

    private static Grid BuildAccountHeader()
    {
        var row = CreateAccountGrid();
        string[] headings = ["帳號", "別名", "點數", "狀態"];
        for (var column = 0; column < headings.Length; column++)
        {
            var label = new TextBlock { Text = headings[column], Classes = { "caption" } };
            Grid.SetColumn(label, column);
            row.Children.Add(label);
        }
        return row;
    }

    private bool HasStateForAccount(int number) => File.Exists(Path.Combine(_workspace.AuthDirectory, $"account-{number}.storageState.json")) || number == 1 && File.Exists(LegacyStateFile);

    private void RefreshAccountState()
    {
        SecretNameText.Text = SecretName;
        AliasText.Text = _aliases.GetValueOrDefault(AccountNumber) is { Length: > 0 } alias ? alias : "未設定別名";
        var state = ExistingStateFile();
        StateDescription.Text = state is null
            ? "尚未找到登入狀態。請先完成登入流程，儲存後即可複製 Base64 或寫入 GitHub Secret。"
            : $"已找到 {Path.GetFileName(state)}。可複製 Base64 後到 Secrets 頁面貼上，或直接寫入 GitHub Secret。";
        RunLoginButton.IsEnabled = AccountComboBox.IsEnabled;
        CopyStateButton.IsEnabled = state is not null && AccountComboBox.IsEnabled;
        CopySecretButton.IsEnabled = AccountComboBox.IsEnabled;
        UploadSecretButton.IsEnabled = CopyStateButton.IsEnabled;
    }

    private void OnBrowserSelectionChanged()
    {
        _browser = IndexToBrowser(BrowserComboBox.SelectedIndex);
        SaveBrowserPreference(_browser);
        RefreshBrowserHint();
    }

    private void RefreshBrowserHint()
    {
        var label = BrowserShortLabel(_browser);
        BrowserHintText.Text = $"GitHub Actions 的 LITMEDIA_BROWSER 請設為 {_browser}。";
        LoginFlowHintText.Text =
            $"程式會開啟 {label}。請在瀏覽器完成登入與所需的 OTP 或 CAPTCHA 驗證，再回到 App 按「儲存登入狀態」。";
    }

    private async void RunLoginButton_OnClick(object? sender, RoutedEventArgs e)
    {
        if (_loginProcess is not null || !AccountComboBox.IsEnabled) return;
        var account = AccountNumber;
        var browser = _browser;
        using var process = new Process { StartInfo = CreateLoginStartInfo(account, browser) };
        _loginCancelled = false;
        LoginStatusText.Text = $"正在準備 {BrowserShortLabel(browser)}。首次使用可能需要下載瀏覽器。";
        StatusText.Text = "";
        try
        {
            process.Start();
            _loginProcess = process;
            AccountComboBox.IsEnabled = BrowserComboBox.IsEnabled = false;
            RunLoginButton.IsVisible = false;
            CancelLoginButton.IsVisible = CancelLoginButton.IsEnabled = true;
            RefreshAccountState();

            var errors = process.StandardError.ReadToEndAsync();
            while (await process.StandardOutput.ReadLineAsync() is { } line)
            {
                if (line == "LITMEDIA_LOGIN_READY" && !_loginCancelled)
                {
                    SaveLoginButton.IsVisible = SaveLoginButton.IsEnabled = true;
                    LoginStatusText.Text = $"請在瀏覽器登入帳號 {account:00}，確認完成後回到此處儲存。";
                }
            }
            await process.WaitForExitAsync();
            var error = (await errors).Trim();
            if (_loginCancelled)
                LoginStatusText.Text = "已取消登入。";
            else if (process.ExitCode == 0)
                LoginStatusText.Text = $"已儲存帳號 {account:00} 的登入狀態，可繼續設定 GitHub Secret。";
            else
                LoginStatusText.Text = $"登入流程已結束，尚未儲存。{(error.Length > 900 ? error[..900] : error)}";
        }
        catch (Exception ex) { LoginStatusText.Text = $"無法啟動或完成登入。請確認已安裝 Node.js 與 npm。{ex.Message}"; }
        finally
        {
            _loginProcess = null;
            AccountComboBox.IsEnabled = BrowserComboBox.IsEnabled = true;
            RunLoginButton.IsVisible = true;
            SaveLoginButton.IsVisible = CancelLoginButton.IsVisible = false;
            RefreshAccountState();
        }
    }

    private ProcessStartInfo CreateLoginStartInfo(int account, string browser)
    {
        bool windows = OperatingSystem.IsWindows();
        var start = new ProcessStartInfo
        {
            FileName = windows ? "cmd.exe" : "/bin/sh",
            WorkingDirectory = _workspace.Root,
            UseShellExecute = false, CreateNoWindow = true,
            RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true
        };
        // Account and browser come from the fixed choices in the UI. All paths
        // are passed via WorkingDirectory or the environment, including paths with spaces.
        var command = $"npm install && {(windows ? "" : "exec ")}node scripts/save-auth.mjs {account} --browser {browser} --desktop";
        if (windows)
            start.Arguments = "/d /c " + command;
        else
        {
            start.ArgumentList.Add("-c");
            start.ArgumentList.Add(command);
            if (OperatingSystem.IsMacOS())
                start.Environment["PATH"] = (Environment.GetEnvironmentVariable("PATH") ?? "/usr/bin:/bin") + ":/opt/homebrew/bin:/usr/local/bin";
        }
        start.Environment["LITMEDIA_STORAGE_STATE_PATH"] = StateFile;
        return start;
    }

    private void SaveLoginButton_OnClick(object? sender, RoutedEventArgs e)
    {
        if (_loginProcess is not { } process || !SaveLoginButton.IsEnabled) return;
        SaveLoginButton.IsEnabled = CancelLoginButton.IsEnabled = false;
        try
        {
            process.StandardInput.WriteLine("save");
            process.StandardInput.Flush();
            LoginStatusText.Text = "正在儲存登入狀態。";
        }
        catch (IOException) { LoginStatusText.Text = "登入視窗已關閉。"; }
    }

    private void CancelLoginButton_OnClick(object? sender, RoutedEventArgs e) => StopLogin();

    private void StopLogin()
    {
        if (_loginProcess is not { } process) return;
        _loginCancelled = true;
        SaveLoginButton.IsEnabled = CancelLoginButton.IsEnabled = false;
        try { if (!process.HasExited) process.Kill(entireProcessTree: true); }
        catch (InvalidOperationException) { /* The browser session already ended. */ }
    }

    private async void RunCheckinButton_OnClick(object? sender, RoutedEventArgs e)
    {
        await WithDashboardBusy(async () =>
        {
            DashboardStatusText.Text = "正在觸發 GitHub Actions 簽到流程。";
            await _github.TriggerAsync(GitHubActionsService.Repository);
            DashboardStatusText.Text = "已觸發 GitHub Actions。請稍候執行完成，再按「更新執行結果」。";
        });
    }

    private async void MainWindow_OnOpened(object? sender, EventArgs e)
    {
        var dashboard = RefreshRemoteDashboardAsync();
        CodeLineCountText.Text = $"{await Task.Run(CountCodeLines):N0} 行";
        await dashboard;
    }

    private async void RefreshDashboardButton_OnClick(object? sender, RoutedEventArgs e)
    {
        await RefreshRemoteDashboardAsync();
    }

    private async Task RefreshRemoteDashboardAsync()
    {
        await WithDashboardBusy(async () =>
        {
            DashboardStatusText.Text = "正在讀取 GitHub Actions 的最新執行結果與歷史摘要。";
            var repository = GitHubActionsService.Repository;
            var overview = await _github.GetRunOverviewAsync(repository);
            var run = overview.LatestRun;
            var reportRun = overview.LatestCompletedRun;
            var report = new RunAccountReport([], null);
            string message;
            if (run is null)
                message = "尚無簽到紀錄。下方顯示本機帳號狀態。";
            else if (reportRun is null)
                message = "簽到流程尚未結束。完成後可更新結果，下方先顯示本機帳號狀態。";
            else
            {
                try
                {
                    report = await _github.GetAccountReportAsync(repository, reportRun.DatabaseId);
                    var sourceTime = FormatRunTime(reportRun.UpdatedAt);
                    message = report.Accounts.Count > 0
                        ? run.DatabaseId == reportRun.DatabaseId
                            ? $"顯示 {sourceTime} 的簽到結果。"
                            : $"最新流程{FormatRunConclusion(run)}。點數與帳號明細取自上次完成的簽到（{sourceTime}）。"
                        : "最近一次執行沒有回報帳號明細。下方顯示本機帳號狀態。";
                }
                catch (Exception ex) { message = $"無法讀取本次執行明細：{ex.Message}"; }
            }

            ApplyRunTimeline(overview.Timeline);
            DashboardStatusText.Text = message;
            _latestRunUrl = run?.Url;
            ViewRunButton.IsVisible = !string.IsNullOrEmpty(_latestRunUrl);
            CheckinStatusText.Text = run is null ? "尚無紀錄" : FormatRunConclusion(run);
            var accountResults = report.Accounts;
            var scheduled = Math.Max(report.ScheduledAccountCount ?? accountResults.Count, accountResults.Count);
            var withPoints = accountResults.Where(account => account.Points.HasValue).ToArray();
            PointsTotalText.Text = withPoints.Length > 0 ? $"{withPoints.Sum(account => account.Points!.Value):N0}" : "—";
            PointsCoverageText.Text = scheduled > 0
                ? $"{withPoints.Length} / {scheduled} 個帳號回報" + (withPoints.Length > 0 && withPoints.Length < scheduled ? "（小計）" : "")
                : "尚無點數資料";
            _showingRunAccounts = accountResults.Count > 0;
            if (!_showingRunAccounts)
            {
                StreakTotalText.Text = "—";
                RefreshLocalAccounts();
                return;
            }

            var reportedStreaks = accountResults.Count(result => result.StreakDays is not null);
            StreakTotalText.Text = $"{reportedStreaks} / {accountResults.Count}";
            AccountsHeading.Text = run?.DatabaseId == reportRun?.DatabaseId ? "本次簽到結果" : "上次完成的簽到結果";
            AccountCountLabel.Text = "回報帳號";
            ConfiguredAccountsText.Text = $"{accountResults.Count} 個";
            RenderDashboardAccounts(accountResults.Select(result => new DashboardAccount(
                result.AccountNumber, result.Label, FormatRemoteAccountState(result),
                result.Status is "checked_in" or "already_done", result.Points)).ToArray());
        });
    }

    private async Task WithDashboardBusy(Func<Task> action)
    {
        RunCheckinButton.IsEnabled = RefreshDashboardButton.IsEnabled = false;
        try { await action(); }
        catch (Exception ex) { DashboardStatusText.Text = $"無法連線 GitHub Actions：{ex.Message}"; }
        finally { RunCheckinButton.IsEnabled = RefreshDashboardButton.IsEnabled = true; }
    }

    private static string FormatRemoteAccountState(AccountRunResult result)
    {
        var state = result.Status switch
        {
            "checked_in" => "本次簽到成功",
            "already_done" => "今日已簽到",
            "failed" => "簽到失敗",
            "skipped" => "已略過",
            "missing" => "未回報結果",
            _ => result.Status
        };
        return result.StreakDays is { } days ? $"{state}，連續 {days} 天" : state;
    }

    private void ApplyRunTimeline(RunTimelineSummary timeline)
    {
        LastSuccessText.Text = FormatRunTime(timeline.LastSuccessAt);
        LastFailureText.Text = FormatRunTime(timeline.LastFailureAt);
        ConsecutiveSuccessDaysText.Text =
            timeline.LastSuccessAt is null && timeline.LastFailureAt is null && timeline.ConsecutiveSuccessDays == 0
                ? "—"
                : $"{timeline.ConsecutiveSuccessDays} 天";
    }

    private static string FormatRunConclusion(RunInfo run) => run.Conclusion?.ToLowerInvariant() switch
    {
        "success" => "成功",
        "failure" => "失敗",
        "cancelled" => "已取消",
        "timed_out" => "逾時",
        "skipped" => "已略過",
        "neutral" => "中立",
        "action_required" => "需處理",
        null or "" => RunStatusLabel(run.Status),
        _ => RunStatusLabel(run.Conclusion)
    };

    private static string FormatRunTime(DateTimeOffset? value) =>
        value is { } timestamp ? timestamp.ToLocalTime().ToString("yyyy/MM/dd HH:mm") : "—";

    private static string RunStatusLabel(string? value) => value?.ToLowerInvariant() switch
    {
        "queued" => "排隊中",
        "in_progress" => "執行中",
        "completed" => "已完成",
        null or "" => "—",
        _ => value
    };

    private int CountCodeLines()
    {
        var total = 0;
        foreach (var file in EnumerateSourceFiles(_workspace.Root))
        {
            try
            {
                total += File.ReadLines(file).Count(line => !string.IsNullOrWhiteSpace(line));
            }
            catch (IOException)
            {
                // A locked or partially written source file should not hide the other files' count.
            }
            catch (UnauthorizedAccessException)
            {
                // A protected source file should not hide the other files' count.
            }
        }

        return total;
    }

    private static bool IsCountedSourceFile(string path) => Path.GetExtension(path).ToLowerInvariant() is ".cs" or ".xaml" or ".axaml" or ".js" or ".mjs";

    private static IEnumerable<string> EnumerateSourceFiles(string root)
    {
        var pending = new Stack<string>();
        pending.Push(root);
        while (pending.Count > 0)
        {
            var directory = pending.Pop();
            string[] files;
            try { files = Directory.GetFiles(directory); }
            catch (IOException) { continue; }
            catch (UnauthorizedAccessException) { continue; }

            foreach (var file in files)
                if (IsCountedSourceFile(file)) yield return file;

            string[] children;
            try { children = Directory.GetDirectories(directory); }
            catch (IOException) { continue; }
            catch (UnauthorizedAccessException) { continue; }

            foreach (var child in children)
            {
                if (IsIgnoredDirectory(child)) continue;
                try
                {
                    if ((File.GetAttributes(child) & FileAttributes.ReparsePoint) != 0) continue;
                }
                catch (IOException) { continue; }
                catch (UnauthorizedAccessException) { continue; }
                pending.Push(child);
            }
        }
    }

    private static bool IsIgnoredDirectory(string path) => Path.GetFileName(path).ToLowerInvariant() is "bin" or "obj" or ".git" or ".agents" or "node_modules";

    private async void CopyStateButton_OnClick(object? sender, RoutedEventArgs e)
    {
        var state = ExistingStateFile();
        if (state is null) { RefreshAccountState(); return; }
        var name = SecretName;
        try
        {
            var clipboard = Clipboard ?? throw new InvalidOperationException("剪貼簿無法使用。");
            var encoded = Convert.ToBase64String(await File.ReadAllBytesAsync(state));
            await clipboard.SetTextAsync(encoded);
            StatusText.Text = $"已複製 Base64。請開啟 Secrets 頁面，貼入 {name}。";
        }
        catch (Exception ex) { StatusText.Text = $"無法複製 Base64：{ex.Message}"; }
    }

    private async void CopySecretButton_OnClick(object? sender, RoutedEventArgs e)
    {
        var name = SecretName;
        try
        {
            var clipboard = Clipboard ?? throw new InvalidOperationException("剪貼簿無法使用。");
            await clipboard.SetTextAsync(name);
            StatusText.Text = $"已複製 Secret 名稱：{name}。";
        }
        catch (Exception ex) { StatusText.Text = $"無法複製 Secret 名稱：{ex.Message}"; }
    }

    private async void UploadSecretButton_OnClick(object? sender, RoutedEventArgs e)
    {
        var state = ExistingStateFile();
        if (state is null) { RefreshAccountState(); return; }

        var name = SecretName;
        AccountComboBox.IsEnabled = false;
        RefreshAccountState();
        try
        {
            var encoded = Convert.ToBase64String(await File.ReadAllBytesAsync(state));
            if (Clipboard is { } clipboard) await clipboard.SetTextAsync(encoded);
            StatusText.Text = $"正在寫入 GitHub Actions Secret：{name}。";
            await _github.SetActionsSecretAsync(GitHubActionsService.Repository, name, encoded);
            StatusText.Text = $"已寫入 GitHub Actions Secret：{name}。";
        }
        catch (Exception ex)
        {
            StatusText.Text = $"無法寫入 GitHub Secret：{ex.Message} 可改按「開啟 Secrets 頁面」手動貼上。";
        }
        finally
        {
            AccountComboBox.IsEnabled = true;
            RefreshAccountState();
        }
    }

    private void OpenSecretsButton_OnClick(object? sender, RoutedEventArgs e) =>
        OpenGitHubUrl(GitHubActionsService.SecretsSettingsUrl(GitHubActionsService.Repository), "已開啟 GitHub Actions Secrets 頁面。");

    private void ViewRunButton_OnClick(object? sender, RoutedEventArgs e)
    {
        if (_latestRunUrl is not null) OpenGitHubUrl(_latestRunUrl, "已開啟本次執行紀錄。");
    }

    private void BuildAliasList()
    {
        for (var number = 1; number <= AccountCount; number++)
        {
            var label = new TextBlock
            {
                Text = $"帳號 {number:00}", Classes = { "cell" }
            };
            var input = new TextBox
            {
                Text = _aliases.GetValueOrDefault(number), Watermark = "例如：工作帳號",
                HorizontalAlignment = HorizontalAlignment.Stretch
            };
            AutomationProperties.SetName(input, $"帳號 {number:00} 別名");
            _aliasInputs[number] = input;
            var row = new Grid
            {
                ColumnDefinitions = new ColumnDefinitions("76,*"), ColumnSpacing = 12,
                MaxWidth = 680, HorizontalAlignment = HorizontalAlignment.Stretch,
                Margin = new Thickness(0, 0, 12, 0)
            };
            Grid.SetColumn(input, 1);
            row.Children.Add(label);
            row.Children.Add(input);
            AliasListPanel.Children.Add(row);
        }
    }

    private async void SaveAliasesButton_OnClick(object? sender, RoutedEventArgs e)
    {
        var aliases = _aliasInputs.ToDictionary(pair => pair.Key, pair => pair.Value.Text?.Trim() ?? "");
        SaveAliasesButton.IsEnabled = false;
        try
        {
            Directory.CreateDirectory(AppDataDir);
            var tempFile = Path.Combine(AppDataDir, Path.GetRandomFileName());
            try
            {
                await File.WriteAllTextAsync(tempFile, JsonSerializer.Serialize(aliases));
                File.Move(tempFile, AliasFile, overwrite: true);
            }
            finally { File.Delete(tempFile); }
            foreach (var (number, alias) in aliases) _aliases[number] = alias;
            AliasStatusText.Text = "已儲存到這台電腦。";
            RefreshAccountState();
            RefreshLocalAccounts();
        }
        catch (Exception ex) { AliasStatusText.Text = $"儲存失敗：{ex.Message}"; }
        finally { SaveAliasesButton.IsEnabled = true; }
    }

    private void DashboardNav_OnClick(object? sender, RoutedEventArgs e) => SetView(DashboardView);
    private void LoginNav_OnClick(object? sender, RoutedEventArgs e) => SetView(LoginView);
    private void AccountsNav_OnClick(object? sender, RoutedEventArgs e) => SetView(AccountsView);
    private void GuideNav_OnClick(object? sender, RoutedEventArgs e) => SetView(GuideView);
    private void SetView(Control active)
    {
        if (active.IsVisible) return;
        if (active == AccountsView && _aliasInputs.Count == 0) BuildAliasList();
        DashboardView.IsVisible = active == DashboardView;
        LoginView.IsVisible = active == LoginView;
        AccountsView.IsVisible = active == AccountsView;
        GuideView.IsVisible = active == GuideView;
        DashboardNavButton.Classes.Set("nav-active", active == DashboardView);
        LoginNavButton.Classes.Set("nav-active", active == LoginView);
        AccountsNavButton.Classes.Set("nav-active", active == AccountsView);
        GuideNavButton.Classes.Set("nav-active", active == GuideView);
        ContentScroll.ScrollToHome();
        if (active == DashboardView) RefreshLocalAccounts();
        if (active == LoginView) RefreshAccountState();
    }

    private void OpenActionsButton_OnClick(object? sender, RoutedEventArgs e) =>
        OpenGitHubUrl(GitHubActionsService.ActionsUrl(GitHubActionsService.Repository), "已開啟 GitHub Actions。");

    private void OpenGitHubUrl(string url, string status)
    {
        var feedback = DashboardView.IsVisible ? DashboardStatusText : GuideView.IsVisible ? GuideStatusText : StatusText;
        try
        {
            Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
            feedback.Text = status;
        }
        catch (Exception ex)
        {
            feedback.Text = $"無法開啟網頁：{ex.Message}";
        }
    }

    private string? ExistingStateFile() => File.Exists(StateFile) ? StateFile : AccountNumber == 1 && File.Exists(LegacyStateFile) ? LegacyStateFile : null;

    // daily-checkin.yml named labels 1–21, without the `-checkin` suffix.
    private static readonly Dictionary<int, string> DefaultAliases = new()
    {
        [1] = "samafengtu",
        [2] = "fengtusama",
        [3] = "tushenbyfengbro",
        [4] = "fengwithting0831",
        [5] = "fengwithfeng1127",
        [6] = "fengwithtu1127",
        [7] = "akaonda333",
        [8] = "fbussinesseng",
        [9] = "engdictatorf",
        [10] = "fengtuprinfo",
        [11] = "flottojackpoteng",
        [12] = "feng33feng35feng3",
        [13] = "chbondg2",
        [14] = "chbondg_outlook",
        [15] = "gaokaolevel3iptopscorer_outlook",
        [16] = "huang1988pioneer_outlook",
        [17] = "fengtuta_tutamail",
        [18] = "fengfence_mailfence",
        [19] = "goldshoot0720",
        [20] = "abuhg17",
        [21] = "huang1988pioneer"
    };

    private static Dictionary<int, string> LoadAliases()
    {
        var aliases = new Dictionary<int, string>(DefaultAliases);
        try
        {
            if (!File.Exists(AliasFile)) return aliases;
            var saved = JsonSerializer.Deserialize<Dictionary<int, string>>(File.ReadAllText(AliasFile));
            if (saved is null) return aliases;
            foreach (var (number, alias) in saved)
            {
                if (string.IsNullOrWhiteSpace(alias)) aliases.Remove(number);
                else aliases[number] = alias.Trim();
            }
            return aliases;
        }
        catch (JsonException)
        {
            return aliases;
        }
    }

    private static int BrowserToIndex(string browser) => browser switch
    {
        "firefox" => 1,
        "edge" => 2,
        _ => 0
    };

    private static string IndexToBrowser(int index) => index switch
    {
        1 => "firefox",
        2 => "edge",
        _ => "chromium"
    };

    private static string NormalizeBrowser(string? value) => value?.Trim().ToLowerInvariant() switch
    {
        "firefox" or "ff" => "firefox",
        "edge" or "msedge" or "microsoft-edge" or "microsoftedge" => "edge",
        _ => "chromium"
    };

    private static string BrowserShortLabel(string browser) => browser switch
    {
        "firefox" => "Firefox",
        "edge" => "Edge",
        _ => "Chromium"
    };

    private static string LoadBrowserPreference()
    {
        try
        {
            if (!File.Exists(SettingsFile)) return "chromium";
            using var doc = JsonDocument.Parse(File.ReadAllText(SettingsFile));
            if (doc.RootElement.TryGetProperty("browser", out var browser) &&
                browser.GetString()?.Trim().ToLowerInvariant() is { Length: > 0 } value)
            {
                return NormalizeBrowser(value);
            }
        }
        catch (JsonException) { /* fall through */ }
        catch (IOException) { /* fall through */ }

        return "chromium";
    }

    private static void SaveBrowserPreference(string browser)
    {
        try
        {
            Directory.CreateDirectory(AppDataDir);
            var payload = JsonSerializer.Serialize(new Dictionary<string, string>
            {
                ["browser"] = NormalizeBrowser(browser)
            });
            File.WriteAllText(SettingsFile, payload);
        }
        catch (IOException)
        {
            // Preference is best-effort; login still works with the in-memory selection.
        }
    }

    private static (string Root, string AuthDirectory) FindWorkspace()
    {
        // A single-file app's base directory can be the extraction cache. Also look
        // beside the executable so earlier releases keep using their existing auth/.
        var executableDirectory = Path.GetDirectoryName(Environment.ProcessPath) ?? AppContext.BaseDirectory;
        foreach (var start in new[] { Environment.CurrentDirectory, executableDirectory, AppContext.BaseDirectory })
            for (var dir = new DirectoryInfo(start); dir is not null; dir = dir.Parent)
                if (File.Exists(Path.Combine(dir.FullName, "package.json")) &&
                    File.Exists(Path.Combine(dir.FullName, "scripts", "save-auth.mjs")))
                    return (dir.FullName, Path.Combine(dir.FullName, "auth"));

        var bundled = Path.Combine(AppContext.BaseDirectory, "workflow");
        if (File.Exists(Path.Combine(bundled, "scripts", "save-auth.mjs")))
        {
            // The runtime cache changes with each build. Keep macOS login state across upgrades.
            var authDirectory = OperatingSystem.IsMacOS() ? Path.Combine(AppDataDir, "auth") : Path.Combine(bundled, "auth");
            return (bundled, authDirectory);
        }
        return (Environment.CurrentDirectory, Path.Combine(Environment.CurrentDirectory, "auth"));
    }
}

internal sealed record DashboardAccount(int Number, string Label, string State, bool IsHealthy, long? Points = null);
