import assert from 'node:assert/strict';
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
assert.match(markdown, /剩餘點數合計 \| \*\*2291\*\*/);
assert.match(markdown, /\*\*2291\*\*/);

console.log('checkin-result.test.mjs: ok');
