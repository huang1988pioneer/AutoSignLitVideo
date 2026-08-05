using System.Diagnostics;
using System.Text.Json;
using Avalonia.Controls;
using Avalonia.Interactivity;

namespace LitMediaFlow;

public partial class MainWindow : Window
{
    private const int AccountCount = 33;
    private readonly string _workspace = FindWorkspace();
    private readonly GitHubActionsService _github = new();
    private readonly Dictionary<int, string> _aliases = LoadAliases();
    private readonly Dictionary<int, TextBox> _aliasInputs = new();

    public MainWindow()
    {
        InitializeComponent();
        AccountComboBox.ItemsSource = Enumerable.Range(1, AccountCount).Select(number => $"帳號 {number:00}").ToArray();
        AccountComboBox.SelectionChanged += (_, _) => RefreshAccountState();
        BuildAliasList();
        RefreshAccountState();
        RefreshDashboard();
    }

    private int AccountNumber => AccountComboBox.SelectedIndex + 1;
    private string StateFile => Path.Combine(_workspace, "auth", $"account-{AccountNumber}.storageState.json");
    private string LegacyStateFile => Path.Combine(_workspace, "auth", "litmedia.storageState.json");
    private string SecretName => $"LITMEDIA_STORAGE_STATE_BASE64_{AccountNumber}";
    private static string AliasFile => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "LitMediaFlow", "account-aliases.json");

    private void RefreshDashboard()
    {
        var ready = Enumerable.Range(1, AccountCount).Where(HasStateForAccount).ToList();
        var configured = _aliases.Count(pair => !string.IsNullOrWhiteSpace(pair.Value));
        ConfiguredAccountsText.Text = $"{configured} 個";
        StreakTotalText.Text = "—";
        DashboardStatusText.Text = ready.Count == 0
            ? "尚未偵測到已儲存的登入狀態。請從「建立登入狀態」開始。"
            : $"已偵測到 {ready.Count} 個可用登入狀態。GitHub Actions 的執行紀錄可由左側指引開啟。";

        RenderDashboardAccounts(Enumerable.Range(1, AccountCount).Select(number =>
        {
            var hasState = HasStateForAccount(number);
            var alias = _aliases.GetValueOrDefault(number);
            return new DashboardAccount(number, string.IsNullOrWhiteSpace(alias) ? "未設定別名" : alias, hasState ? "登入有效，等待執行" : "尚未設定登入狀態", hasState);
        }));
    }

    private void RenderDashboardAccounts(IEnumerable<DashboardAccount> accounts)
    {
        DashboardAccountsPanel.Children.Clear();
        foreach (var account in accounts)
        {
            var row = new Grid { ColumnDefinitions = new ColumnDefinitions("76,190,*") };
            var numberText = new TextBlock { Text = $"帳號 {account.Number:00}", Classes = { "account-row" } };
            var aliasText = new TextBlock { Text = account.Label, Classes = { "account-row" } };
            var stateText = new TextBlock { Text = account.State, Classes = { "account-row" }, Foreground = account.IsHealthy ? Avalonia.Media.Brushes.Teal : Avalonia.Media.Brushes.DimGray };
            Grid.SetColumn(aliasText, 1);
            Grid.SetColumn(stateText, 2);
            row.Children.Add(numberText);
            row.Children.Add(aliasText);
            row.Children.Add(stateText);
            DashboardAccountsPanel.Children.Add(row);
        }
    }

    private bool HasStateForAccount(int number) => File.Exists(Path.Combine(_workspace, "auth", $"account-{number}.storageState.json")) || number == 1 && File.Exists(LegacyStateFile);

    private void RefreshAccountState()
    {
        SecretNameText.Text = SecretName;
        AliasText.Text = _aliases.GetValueOrDefault(AccountNumber) is { Length: > 0 } alias ? alias : "未設定別名";
        var state = ExistingStateFile();
        StateDescription.Text = state is null
            ? "尚未找到登入狀態。請先完成登入流程，儲存後即可複製 Base64。"
            : $"已找到 {Path.GetFileName(state)}。可將 Base64 貼入 GitHub Secret。";
        CopyStateButton.IsEnabled = state is not null;
        CopySecretButton.IsEnabled = state is not null;
    }

    private void RunLoginButton_OnClick(object? sender, RoutedEventArgs e)
    {
        RunLoginButton.IsEnabled = false;
        try
        {
            if (!OperatingSystem.IsWindows()) throw new PlatformNotSupportedException("登入流程目前需要 Windows 的 cmd.exe。");
            Process.Start(new ProcessStartInfo { FileName = "cmd.exe", Arguments = $"/k npm install && npm run auth -- {AccountNumber}", WorkingDirectory = _workspace, UseShellExecute = true });
            StatusText.Text = "已開啟登入終端機。完成登入與必要驗證後，請在終端機按 Enter 儲存登入狀態。";
        }
        catch (Exception ex) { StatusText.Text = $"無法開啟登入流程：{ex.Message}"; }
        finally { RunLoginButton.IsEnabled = true; RefreshAccountState(); }
    }

    private async void RunCheckinButton_OnClick(object? sender, RoutedEventArgs e)
    {
        await WithDashboardBusy(async () =>
        {
            DashboardStatusText.Text = "正在觸發 GitHub Actions 簽到流程。";
            var repository = await _github.GetRepositoryAsync();
            await _github.TriggerAsync(repository);
            DashboardStatusText.Text = "已觸發 GitHub Actions。請稍候執行完成，再按「更新執行結果」。";
        });
    }

    private async void RefreshDashboardButton_OnClick(object? sender, RoutedEventArgs e)
    {
        await WithDashboardBusy(async () =>
        {
            DashboardStatusText.Text = "正在讀取 GitHub Actions 的最新執行結果。";
            var repository = await _github.GetRepositoryAsync();
            var run = await _github.GetLatestAsync(repository);
            if (run is null)
            {
                CheckinStatusText.Text = "尚無紀錄";
                StreakTotalText.Text = "—";
                DashboardStatusText.Text = "尚未找到 Daily LitMedia Check-in 的執行紀錄。";
                return;
            }

            CheckinStatusText.Text = string.IsNullOrWhiteSpace(run.Conclusion) ? run.Status : run.Conclusion;
            var accountResults = await _github.GetAccountResultsAsync(repository, run.DatabaseId);
            var summary = await _github.GetStreakSummaryAsync(repository, run.DatabaseId);
            StreakTotalText.Text = summary is null ? "—" : $"{summary.AccountCount} / {accountResults.Count} 個";
            if (accountResults.Count > 0)
            {
                ConfiguredAccountsText.Text = $"{accountResults.Count} 個";
                RenderDashboardAccounts(accountResults.Select(result => new DashboardAccount(
                    result.AccountNumber,
                    result.Label,
                    FormatRemoteAccountState(result),
                    result.Status is "checked_in" or "already_done")));
            }
            DashboardStatusText.Text = summary is null
                ? $"最近執行：{run.Url}。此執行沒有可讀取的連續簽到資料。"
                : $"最近執行：{run.Url}；{summary.AccountCount} 個帳號回報連續天數，請於下方帳號清單分別查看。";
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
            _ => result.Status
        };
        return result.StreakDays is { } days ? $"{state}，連續 {days} 天" : state;
    }

    private async void CopyStateButton_OnClick(object? sender, RoutedEventArgs e)
    {
        var state = ExistingStateFile();
        if (state is null) { RefreshAccountState(); return; }
        var encoded = Convert.ToBase64String(await File.ReadAllBytesAsync(state));
        if (Clipboard is { } clipboard) await clipboard.SetTextAsync(encoded);
        StatusText.Text = $"已複製 {encoded.Length:N0} 個字元的 Base64。請貼入 GitHub Secret：{SecretName}。";
    }

    private async void CopySecretButton_OnClick(object? sender, RoutedEventArgs e)
    {
        if (Clipboard is { } clipboard) await clipboard.SetTextAsync(SecretName);
        StatusText.Text = $"已複製 Secret 名稱：{SecretName}。";
    }

    private void BuildAliasList()
    {
        for (var number = 1; number <= AccountCount; number++)
        {
            var input = new TextBox { Width = 340, Text = _aliases.GetValueOrDefault(number), Watermark = "例如：工作帳號" };
            _aliasInputs[number] = input;
            var row = new StackPanel { Orientation = Avalonia.Layout.Orientation.Horizontal, Spacing = 12 };
            row.Children.Add(new TextBlock { Text = $"帳號 {number:00}", Width = 74, VerticalAlignment = Avalonia.Layout.VerticalAlignment.Center });
            row.Children.Add(input);
            AliasListPanel.Children.Add(row);
        }
    }

    private async void SaveAliasesButton_OnClick(object? sender, RoutedEventArgs e)
    {
        foreach (var (number, input) in _aliasInputs)
            if (string.IsNullOrWhiteSpace(input.Text)) _aliases.Remove(number); else _aliases[number] = input.Text.Trim();
        Directory.CreateDirectory(Path.GetDirectoryName(AliasFile)!);
        await File.WriteAllTextAsync(AliasFile, JsonSerializer.Serialize(_aliases));
        StatusText.Text = "帳號設定已儲存於此電腦。";
        RefreshAccountState();
        RefreshDashboard();
    }

    private void DashboardNav_OnClick(object? sender, RoutedEventArgs e) => SetView(DashboardView);
    private void LoginNav_OnClick(object? sender, RoutedEventArgs e) => SetView(LoginView);
    private void AccountsNav_OnClick(object? sender, RoutedEventArgs e) => SetView(AccountsView);
    private void GuideNav_OnClick(object? sender, RoutedEventArgs e) => SetView(GuideView);
    private void SetView(Control active)
    {
        DashboardView.IsVisible = active == DashboardView;
        LoginView.IsVisible = active == LoginView;
        AccountsView.IsVisible = active == AccountsView;
        GuideView.IsVisible = active == GuideView;
        DashboardNavButton.Classes.Set("nav-active", active == DashboardView);
        LoginNavButton.Classes.Set("nav-active", active == LoginView);
        AccountsNavButton.Classes.Set("nav-active", active == AccountsView);
        GuideNavButton.Classes.Set("nav-active", active == GuideView);
        if (active == DashboardView) RefreshDashboard();
    }

    private void OpenActionsButton_OnClick(object? sender, RoutedEventArgs e)
    {
        Process.Start(new ProcessStartInfo("https://github.com/huang1988pioneer/AutoSignLitVideo/actions") { UseShellExecute = true });
        StatusText.Text = "已開啟 GitHub Actions。";
    }

    private string? ExistingStateFile() => File.Exists(StateFile) ? StateFile : AccountNumber == 1 && File.Exists(LegacyStateFile) ? LegacyStateFile : null;
    private static Dictionary<int, string> LoadAliases()
    {
        try { return File.Exists(AliasFile) ? JsonSerializer.Deserialize<Dictionary<int, string>>(File.ReadAllText(AliasFile)) ?? [] : []; }
        catch (JsonException) { return []; }
    }

    private static string FindWorkspace()
    {
        foreach (var start in new[] { Environment.CurrentDirectory, AppContext.BaseDirectory })
            for (var dir = new DirectoryInfo(start); dir is not null; dir = dir.Parent)
                if (File.Exists(Path.Combine(dir.FullName, "package.json"))) return dir.FullName;
        return Environment.CurrentDirectory;
    }
}

internal sealed record DashboardAccount(int Number, string Label, string State, bool IsHealthy);
