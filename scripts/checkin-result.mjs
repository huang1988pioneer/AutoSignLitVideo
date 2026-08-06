import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * @typedef {object} CheckinRecord
 * @property {number | null} account
 * @property {string | null} label
 * @property {string} status
 * @property {string} message
 * @property {number | null} streakDays
 * @property {number | null} pointsAwarded
 * @property {number | null} creditBalance
 * @property {string | null} lastSignDay
 * @property {string} finishedAt
 */

/**
 * Build a stable per-account result row (streak = LitMedia continue_day).
 * @param {object} options
 * @param {string | number | undefined | null} options.accountIndex
 * @param {string | undefined | null} options.accountLabel
 * @param {{ status?: string, message?: string, continueDay?: number, pointsAwarded?: number, creditBalance?: number, lastSignDay?: string } | null | undefined} options.result
 * @param {string | undefined | null} options.error
 * @returns {CheckinRecord}
 */
export function buildCheckinRecord({ accountIndex, accountLabel, result, error } = {}) {
  const account =
    accountIndex === undefined || accountIndex === null || String(accountIndex).trim() === ''
      ? null
      : Number(accountIndex);

  const streakRaw = result?.continueDay;
  const streakDays =
    streakRaw != null && Number.isFinite(Number(streakRaw)) ? Number(streakRaw) : null;

  return {
    account: Number.isFinite(account) ? account : null,
    label: accountLabel ? String(accountLabel) : null,
    status: result?.status || (error ? 'failed' : 'unknown'),
    message: String(result?.message || error || '').trim(),
    streakDays,
    pointsAwarded:
      result?.pointsAwarded != null && Number.isFinite(Number(result.pointsAwarded))
        ? Number(result.pointsAwarded)
        : null,
    creditBalance:
      result?.creditBalance != null && Number.isFinite(Number(result.creditBalance))
        ? Number(result.creditBalance)
        : null,
    lastSignDay: result?.lastSignDay ? String(result.lastSignDay) : null,
    finishedAt: new Date().toISOString()
  };
}

/**
 * Compact line parsed by LitMediaFlow desktop (`streak=N`).
 * Example: `- #6 samafengtu-checkin: checked_in reward=+10 streak=4`
 * @param {CheckinRecord} record
 */
export function formatCompactResultLine(record) {
  const index = record.account != null ? record.account : '?';
  const label = shortLabel(record.label) || `account-${index}`;
  const parts = [record.status || 'unknown'];

  if (record.pointsAwarded != null) {
    parts.push(`reward=+${record.pointsAwarded}`);
  }
  if (record.streakDays != null) {
    parts.push(`streak=${record.streakDays}`);
  }
  if (record.status === 'failed' && record.message) {
    parts.push(`error=${compactMessage(record.message)}`);
  }

  return `- #${index} ${label}: ${parts.join(' ')}`;
}

/**
 * Write JSON + log compact line + optional GitHub Step Summary for one account.
 * @param {CheckinRecord} record
 * @param {{ resultDir?: string }} [options]
 */
export async function recordCheckinResult(record, options = {}) {
  const resultDir = options.resultDir || 'test-results';
  await mkdir(resultDir, { recursive: true });

  const accountSuffix = record.account != null ? String(record.account) : 'single';
  const jsonPath = join(resultDir, `checkin-result-${accountSuffix}.json`);
  const body = `${JSON.stringify(record, null, 2)}\n`;
  await writeFile(jsonPath, body, 'utf8');

  // Unnumbered file only for single-account local runs (avoid matrix artifact name clashes).
  if (record.account == null) {
    await writeFile(join(resultDir, 'checkin-result.json'), body, 'utf8');
  }

  const compact = formatCompactResultLine(record);
  console.log(compact);
  if (record.streakDays != null) {
    console.log(
      `Recorded streak for account ${record.account ?? 'single'}: ${record.streakDays} day(s).`
    );
  }

  await writeAccountStepSummary(record);
  return { record, jsonPath, compact };
}

/**
 * Write aggregate streak registry for multi-account local / summarize runs.
 * @param {CheckinRecord[]} records
 * @param {{ resultDir?: string }} [options]
 */
export async function writeStreakRegistry(records, options = {}) {
  const resultDir = options.resultDir || 'test-results';
  await mkdir(resultDir, { recursive: true });

  const accounts = [...records]
    .filter((row) => row && typeof row === 'object')
    .sort((a, b) => (a.account ?? 9999) - (b.account ?? 9999));

  const withStreak = accounts.filter((row) => row.streakDays != null && row.streakDays > 0);
  const payload = {
    generatedAt: new Date().toISOString(),
    accountCount: accounts.length,
    streakReportedCount: withStreak.length,
    totalStreakDays: withStreak.reduce((sum, row) => sum + (row.streakDays || 0), 0),
    accounts: accounts.map((row) => ({
      account: row.account,
      label: row.label,
      status: row.status,
      streakDays: row.streakDays,
      lastSignDay: row.lastSignDay,
      pointsAwarded: row.pointsAwarded,
      finishedAt: row.finishedAt
    }))
  };

  const jsonPath = join(resultDir, 'streaks.json');
  const mdPath = join(resultDir, 'streaks.md');
  await writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await writeFile(mdPath, buildStreaksMarkdown(payload), 'utf8');

  console.log(
    `Wrote streak registry: ${withStreak.length}/${accounts.length} account(s) reported streak (total ${payload.totalStreakDays} day(s)).`
  );

  return { payload, jsonPath, mdPath };
}

/**
 * @param {CheckinRecord} record
 */
async function writeAccountStepSummary(record) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;

  const index = record.account != null ? record.account : '—';
  const label = escapeMd(shortLabel(record.label) || 'account');
  const streak =
    record.streakDays != null ? String(record.streakDays) : '—';
  const reward =
    record.pointsAwarded != null ? `+${record.pointsAwarded}` : '—';
  const status = statusBadge(record.status);

  const lines = [
    `## Account ${index} — ${label}`,
    '',
    '| 項目 | 值 |',
    '| --- | --- |',
    `| 狀態 | ${status} |`,
    `| 連續簽到天數 | **${streak}** |`,
    `| 本次獎勵 | ${reward} |`,
    record.lastSignDay ? `| 最近簽到日 | ${escapeMd(record.lastSignDay)} |` : null,
    '',
    record.message ? `_${escapeMd(compactMessage(record.message, 200))}_` : null,
    '',
    '```',
    formatCompactResultLine(record),
    '```',
    ''
  ].filter((line) => line !== null);

  try {
    await appendFile(summaryPath, `${lines.join('\n')}\n`, 'utf8');
  } catch (error) {
    console.warn(
      `Could not write GITHUB_STEP_SUMMARY: ${error instanceof Error ? error.message : error}`
    );
  }
}

/**
 * @param {{ generatedAt: string, accountCount: number, streakReportedCount: number, totalStreakDays: number, accounts: Array<object> }} payload
 */
export function buildStreaksMarkdown(payload) {
  const lines = [
    '## LitMedia 連續簽到天數',
    '',
    '| 項目 | 值 |',
    '| --- | ---: |',
    `| 回報連續天數帳號 | **${payload.streakReportedCount}** / ${payload.accountCount} |`,
    `| 連續天數合計 | **${payload.totalStreakDays}** |`,
    '',
    `<sub>${payload.generatedAt}</sub>`,
    '',
    '### 各帳號',
    '',
    '| # | 帳號 | 狀態 | 連續天數 | 最近簽到 | 獎勵 |',
    '| ---: | --- | --- | ---: | --- | ---: |'
  ];

  for (const row of payload.accounts) {
    const no = row.account ?? '—';
    const label = escapeMd(shortLabel(row.label) || `account-${no}`);
    const streak = row.streakDays != null ? String(row.streakDays) : '—';
    const last = row.lastSignDay ? escapeMd(row.lastSignDay) : '—';
    const reward = row.pointsAwarded != null ? `+${row.pointsAwarded}` : '—';
    lines.push(
      `| ${no} | ${label} | ${statusBadge(row.status)} | **${streak}** | ${last} | ${reward} |`
    );
  }

  lines.push(
    '',
    '---',
    '',
    '<sub>連續天數來自 LitMedia `continue_day`（簽到面板 API）。</sub>',
    ''
  );

  return `${lines.join('\n')}\n`;
}

export function shortLabel(label) {
  if (!label) return '';
  return String(label)
    .replace(/\s*\(\d+\)\s*$/, '')
    .replace(/-checkin$/i, '')
    .trim();
}

export function compactMessage(message, max = 120) {
  const text = String(message || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

export function statusBadge(status) {
  switch (status) {
    case 'checked_in':
      return '✅ checked_in';
    case 'already_done':
      return '☑️ already_done';
    case 'failed':
    case 'missing':
      return '❌ failed';
    case 'skipped':
      return '⏭️ skipped';
    default:
      return `❓ ${status || 'unknown'}`;
  }
}

function escapeMd(value) {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ');
}
