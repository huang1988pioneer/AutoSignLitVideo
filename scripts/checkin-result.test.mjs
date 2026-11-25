import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCheckinRecord, formatCompactResultLine, buildStreaksMarkdown } from './checkin-result.mjs';
import { interpretUserPoints } from './litmedia-checkin.mjs';

assert.equal(interpretUserPoints({ vip_times: 2291, free_times: 0 }), 2291);
assert.equal(interpretUserPoints({ vip_times: 2000, free_times: 291 }), 2291);
assert.equal(interpretUserPoints({ credit: 2291 }), 2291);
assert.equal(interpretUserPoints({ credits: '2,291' }), 2291);
assert.equal(interpretUserPoints({ points: 2291 }), 2291);
assert.equal(interpretUserPoints({ points_num: 5 }), null, 'daily reward tier is not remaining points');
assert.equal(interpretUserPoints({ continue_day: 4, button_status: 3 }), null);
assert.equal(interpretUserPoints({ credit: { credit: 2291 } }), 2291);
assert.equal(interpretUserPoints(2291), 2291);
assert.equal(interpretUserPoints(null), null);

const record = buildCheckinRecord({
  accountIndex: 6,
  accountLabel: 'samafengtu-checkin',
  result: {
    status: 'already_done',
    message: 'Already checked in today.',
    continueDay: 4,
    pointsAwarded: 5,
    creditBalance: 2291,
    lastSignDay: '2026-09-05'
  }
});

assert.equal(record.creditBalance, 2291);
assert.equal(
  formatCompactResultLine(record),
  '- #6 samafengtu: already_done reward=+5 streak=4 points=2291'
);

const markdown = buildStreaksMarkdown({
  generatedAt: '2026-09-05T00:00:00.000Z',
  accountCount: 1,
  streakReportedCount: 1,
  totalStreakDays: 4,
  pointsReportedCount: 1,
  totalPoints: 2291,
  accounts: [record]
});
assert.match(markdown, /剩餘點數合計 \| \*\*2,291\*\*/);
assert.match(markdown, /\*\*2291\*\*/);

const testDir = await mkdtemp(join(tmpdir(), 'litmedia-points-'));
try {
  const inputs = join(testDir, 'accounts');
  const summary = join(testDir, 'summary.md');
  await mkdir(inputs);
  async function summarize(balances) {
    const records = balances.map((creditBalance, i) => ({
      account: i + 1, status: 'already_done', pointsAwarded: 99, creditBalance
    }));
    await writeFile(join(inputs, 'checkin-result.json'), JSON.stringify(records));
    await writeFile(summary, '');
    execFileSync(process.execPath, [fileURLToPath(new URL('./summarize-checkin-results.mjs', import.meta.url)), inputs], {
      env: { ...process.env, LITMEDIA_SUMMARY_DIR: testDir, LITMEDIA_SCHEDULED_ACCOUNTS: '3', GITHUB_STEP_SUMMARY: summary }
    });
    return readFile(summary, 'utf8');
  }
  assert.match(await summarize([1500, 230, 0]), /1,730 點.*全部帳號[\s\S]*3 \/ 3 個帳號/);
  assert.match(await summarize([0, null]), /0 點.*已回報帳號小計[\s\S]*1 \/ 3 個帳號/);
  assert.match(await summarize([]), /尚無帳號回報點數[\s\S]*0 \/ 3 個帳號/);
} finally {
  await rm(testDir, { recursive: true, force: true });
}

console.log('checkin-result.test.mjs: ok');
