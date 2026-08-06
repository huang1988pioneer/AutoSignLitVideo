import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  buildStreaksMarkdown,
  compactMessage,
  shortLabel,
  writeStreakRegistry
} from './checkin-result.mjs';

const rootDir = process.argv[2] || process.env.LITMEDIA_RESULT_DIR || 'test-results';
const outDir = process.env.LITMEDIA_SUMMARY_DIR || 'test-results';

const rows = loadResultRows(rootDir);
if (rows.length === 0) {
  console.warn(`No checkin-result*.json found under ${rootDir}`);
}

const { payload, jsonPath, mdPath } = await writeStreakRegistry(rows, { resultDir: outDir });
const dailyMd = buildDailySummaryMarkdown(payload);
const dailyMdPath = join(outDir, 'checkin-summary.md');
await mkdir(outDir, { recursive: true });
await writeFile(dailyMdPath, dailyMd, 'utf8');

console.log(`Wrote ${jsonPath}`);
console.log(`Wrote ${mdPath}`);
console.log(`Wrote ${dailyMdPath}`);

const summaryPath = process.env.GITHUB_STEP_SUMMARY;
if (summaryPath) {
  await appendFile(summaryPath, dailyMd, 'utf8');
  console.log(`Appended summary to ${summaryPath}`);
}

function loadResultRows(dir) {
  const files = walkResultFiles(dir);
  /** @type {Map<string, object>} */
  const byKey = new Map();

  for (const file of files) {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(file, 'utf8'));
    } catch (error) {
      console.warn(`Skip invalid JSON: ${file} (${error instanceof Error ? error.message : error})`);
      continue;
    }

    const list = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      if (item.account == null && !item.label && !item.status) continue;

      const account =
        item.account != null && Number.isFinite(Number(item.account))
          ? Number(item.account)
          : null;
      const row = {
        account,
        label: item.label ?? null,
        status: item.status || 'unknown',
        message: item.message || '',
        streakDays:
          item.streakDays != null && Number.isFinite(Number(item.streakDays))
            ? Number(item.streakDays)
            : item.continueDay != null && Number.isFinite(Number(item.continueDay))
              ? Number(item.continueDay)
              : null,
        pointsAwarded:
          item.pointsAwarded != null && Number.isFinite(Number(item.pointsAwarded))
            ? Number(item.pointsAwarded)
            : null,
        creditBalance:
          item.creditBalance != null && Number.isFinite(Number(item.creditBalance))
            ? Number(item.creditBalance)
            : null,
        lastSignDay: item.lastSignDay ?? null,
        finishedAt: item.finishedAt || null
      };

      const key = account != null ? `account:${account}` : `file:${file}`;
      byKey.set(key, row);
    }
  }

  return [...byKey.values()].sort((a, b) => (a.account ?? 9999) - (b.account ?? 9999));
}

function walkResultFiles(root) {
  const files = [];

  function visit(current) {
    if (!existsSync(current)) return;
    const stat = statSync(current);
    if (stat.isFile()) {
      const base = current.replace(/\\/g, '/').split('/').pop() || '';
      if (/^checkin-result(-\d+)?\.json$/i.test(base)) {
        files.push(current);
      }
      return;
    }
    if (!stat.isDirectory()) return;
    for (const entry of readdirSync(current)) {
      visit(join(current, entry));
    }
  }

  visit(root);
  return files;
}

function buildDailySummaryMarkdown(payload) {
  const accounts = payload.accounts || [];
  const checkedIn = accounts.filter((r) => r.status === 'checked_in');
  const alreadyDone = accounts.filter((r) => r.status === 'already_done');
  const failed = accounts.filter((r) => r.status === 'failed' || r.status === 'missing');
  const skipped = accounts.filter((r) => r.status === 'skipped');
  const ok = checkedIn.length + alreadyDone.length;

  const headline =
    failed.length === 0 && accounts.length - skipped.length > 0
      ? '✅ All configured accounts OK'
      : failed.length > 0
        ? `⚠️ ${failed.length} account(s) need attention`
        : 'ℹ️ No configured accounts';

  const lines = [
    '## LitMedia daily check-in',
    '',
    `**${headline}**`,
    '',
    '| Metric | Count |',
    '| --- | ---: |',
    `| Configured (ran) | ${accounts.length - skipped.length} |`,
    `| New check-in | ${checkedIn.length} |`,
    `| Already done | ${alreadyDone.length} |`,
    `| OK total | ${ok} |`,
    `| Failed | ${failed.length} |`,
    `| Skipped | ${skipped.length} |`,
    `| Streak reported | ${payload.streakReportedCount} |`,
    `| Streak days total | ${payload.totalStreakDays} |`,
    '',
    `<sub>${payload.generatedAt}</sub>`,
    ''
  ];

  if (failed.length > 0) {
    lines.push('### ⚠️ Needs attention', '');
    lines.push('| # | Account | Error |');
    lines.push('| ---: | --- | --- |');
    for (const row of failed) {
      lines.push(
        `| ${row.account ?? '—'} | ${escapeMd(shortLabel(row.label))} | ${escapeMd(compactMessage(row.message || 'failed', 160))} |`
      );
    }
    lines.push('');
  }

  lines.push(buildStreaksMarkdown(payload).replace(/^## LitMedia 連續簽到天數\n+/, '### 連續簽到天數\n\n'));

  return lines.join('\n');
}

function escapeMd(value) {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ');
}
