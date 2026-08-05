using System.Diagnostics;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace LitMediaFlow;

internal sealed class GitHubActionsService
{
    private const string Workflow = "daily-checkin.yml";

    public async Task<string> GetRepositoryAsync() =>
        (await RunGhAsync(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"])).Trim();

    public async Task TriggerAsync(string repository) =>
        await RunGhAsync(["workflow", "run", Workflow, "--repo", repository, "--ref", "main"]);

    public async Task<RunInfo?> GetLatestAsync(string repository)
    {
        var output = await RunGhAsync([
            "run", "list", "--workflow", Workflow, "--repo", repository, "--limit", "1",
            "--json", "databaseId,status,conclusion,updatedAt,url"
        ]);
        return JsonSerializer.Deserialize<List<RunInfo>>(output, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        })?.FirstOrDefault();
    }

    public async Task<StreakSummary?> GetStreakSummaryAsync(string repository, long runId)
    {
        var output = await GetRunLogAsync(repository, runId);
        // `gh run view --log` prefixes Job Summary rows with job metadata. The
        // compact per-account result line is intentionally emitted by our script
        // and remains stable under that prefix, e.g. "- #6 name: ... streak=4".
        var values = Regex.Matches(output, @"- #\d+ .*?\bstreak=(\d+)\b")
            .Select(match => int.TryParse(match.Groups[1].Value, out var days) ? days : 0)
            .Where(days => days > 0)
            .ToArray();

        return values.Length == 0 ? null : new StreakSummary(values.Sum(), values.Length);
    }

    public async Task<IReadOnlyList<AccountRunResult>> GetAccountResultsAsync(string repository, long runId)
    {
        var output = await GetRunLogAsync(repository, runId);
        var rows = Regex.Matches(
                output,
                @"- #(?<number>\d+)\s+(?<label>.+?):\s+(?<status>[a-z_]+)(?<detail>[^\r\n]*)",
                RegexOptions.Multiline)
            .Select(match =>
            {
                var streak = Regex.Match(match.Groups["detail"].Value, @"\bstreak=(\d+)\b");
                return new AccountRunResult(
                    int.Parse(match.Groups["number"].Value),
                    match.Groups["label"].Value.Trim(),
                    match.Groups["status"].Value,
                    streak.Success ? int.Parse(streak.Groups[1].Value) : null);
            })
            .GroupBy(result => result.AccountNumber)
            .Select(group => group.Last())
            .OrderBy(result => result.AccountNumber)
            .ToList();

        return rows;
    }

    private static Task<string> GetRunLogAsync(string repository, long runId) =>
        RunGhAsync(["run", "view", runId.ToString(), "--repo", repository, "--log"]);

    private static async Task<string> RunGhAsync(IEnumerable<string> arguments)
    {
        using var process = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = "gh",
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true
            }
        };
        foreach (var argument in arguments) process.StartInfo.ArgumentList.Add(argument);
        if (!process.Start()) throw new InvalidOperationException("找不到 GitHub CLI（gh）。請先安裝並執行 gh auth login。");

        var stdout = process.StandardOutput.ReadToEndAsync();
        var stderr = process.StandardError.ReadToEndAsync();
        await process.WaitForExitAsync();
        var output = await stdout;
        var error = await stderr;
        if (process.ExitCode == 0) return output;
        throw new InvalidOperationException(string.IsNullOrWhiteSpace(error) ? output.Trim() : error.Trim());
    }
}

internal sealed record RunInfo(long DatabaseId, string Status, string? Conclusion, DateTimeOffset UpdatedAt, string Url);
internal sealed record StreakSummary(int TotalDays, int AccountCount);
internal sealed record AccountRunResult(int AccountNumber, string Label, string Status, int? StreakDays);
