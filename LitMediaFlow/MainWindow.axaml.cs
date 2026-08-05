using System.Diagnostics;
using System.Text.Json;
using Avalonia.Controls;
using Avalonia.Interactivity;

namespace LitMediaFlow;

public partial class MainWindow : Window
{
    private const int AccountCount = 33;
    private readonly string _workspace = FindWorkspace();
    private readonly Dictionary<int, string> _aliases = LoadAliases();
    private readonly Dictionary<int, TextBox> _aliasInputs = new();

    public MainWindow()
    {
        InitializeComponent();
        AccountComboBox.ItemsSource = Enumerable.Range(1, AccountCount).Select(number => $"帳號 {number:00}").ToArray();
        AccountComboBox.SelectionChanged += (_, _) => RefreshAccountState();
        BuildAliasList();
        RefreshAccountState();
    }

    private int AccountNumber => AccountComboBox.SelectedIndex + 1;
    private string StateFile => Path.Combine(_workspace, "auth", $"account-{AccountNumber}.storageState.json");
    private string LegacyStateFile => Path.Combine(_workspace, "auth", "litmedia.storageState.json");
    private string SecretName => $"LITMEDIA_STORAGE_STATE_BASE64_{AccountNumber}";
    private static string AliasFile => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "LitMediaFlow", "account-aliases.json");

    private void RefreshAccountState()
    {
        SecretNameText.Text = SecretName;
        AliasText.Text = _aliases.GetValueOrDefault(AccountNumber) is { Length: > 0 } alias ? alias : "尚未命名";
        var state = ExistingStateFile();
        StateDescription.Text = state is null
            ? "尚未找到此帳號的登入狀態。完成第二步後即可複製。"
            : $"已找到 {Path.GetFileName(state)}，可複製 Base64 並貼到 GitHub。";
        CopyStateButton.IsEnabled = state is not null;
        CopySecretButton.IsEnabled = state is not null;
    }

    private void RunLoginButton_OnClick(object? sender, RoutedEventArgs e)
    {
        RunLoginButton.IsEnabled = false;
        CopyStateButton.IsEnabled = false;
        try
        {
            if (!OperatingSystem.IsWindows()) throw new PlatformNotSupportedException("目前登入啟動器需要 Windows 的 cmd.exe。");
            Process.Start(new ProcessStartInfo
            {
                FileName = "cmd.exe",
                Arguments = $"/k npm install && npm run auth -- {AccountNumber}",
                WorkingDirectory = _workspace,
                UseShellExecute = true,
            });
            StatusText.Text = "已開啟終端機與登入瀏覽器。完成登入後，請回到終端機按 Enter；接著回本工具複製 Base64。";
        }
        catch (Exception ex) { StatusText.Text = $"無法啟動登入流程：{ex.Message}"; }
        finally { RunLoginButton.IsEnabled = true; RefreshAccountState(); }
    }

    private async void CopyStateButton_OnClick(object? sender, RoutedEventArgs e)
    {
        var state = ExistingStateFile();
        if (state is null) { RefreshAccountState(); return; }
        var encoded = Convert.ToBase64String(await File.ReadAllBytesAsync(state));
        if (Clipboard is { } clipboard) await clipboard.SetTextAsync(encoded);
        StatusText.Text = $"已複製 {encoded.Length:N0} 個字元。請建立或更新 GitHub Secret：{SecretName}。";
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
            var input = new TextBox { Width = 340, Text = _aliases.GetValueOrDefault(number), Watermark = "例如：主要帳號" };
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
        StatusText.Text = "帳號別名已儲存到本機。";
        RefreshAccountState();
    }

    private void LoginNav_OnClick(object? sender, RoutedEventArgs e) => SetView(LoginView);
    private void AccountsNav_OnClick(object? sender, RoutedEventArgs e) => SetView(AccountsView);
    private void GuideNav_OnClick(object? sender, RoutedEventArgs e) => SetView(GuideView);
    private void SetView(Control active) { LoginView.IsVisible = active == LoginView; AccountsView.IsVisible = active == AccountsView; GuideView.IsVisible = active == GuideView; }

    private void OpenActionsButton_OnClick(object? sender, RoutedEventArgs e)
    {
        Process.Start(new ProcessStartInfo("https://github.com") { UseShellExecute = true });
        StatusText.Text = "已在預設瀏覽器開啟 GitHub。";
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
