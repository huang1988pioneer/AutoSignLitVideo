import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { runLitMediaCheckin } from '../scripts/litmedia-checkin.mjs';

test('a late sale dialog can be dismissed without closing the reward panel or buying anything', async () => {
  const browser = await chromium.launch();
  const previousDir = process.cwd();
  const directory = await mkdtemp(join(tmpdir(), 'litmedia-checkin-'));
  try {
    process.chdir(directory);
    await writeFile('state.json', '{"cookies":[],"origins":[]}');
    const actions = [];
    const fixtureBrowser = {
      async newContext(options) {
        const context = await browser.newContext(options);
        await context.route('**/*', async (route) => {
          const path = new URL(route.request().url()).pathname;
          if (path === '/home') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: fixture });
          const responses = {
            '/account/check-login': {},
            '/lit-video/get-user-info': { points: 760 },
            '/lit-video/get-web-sign-list': { button_status: 1 },
            '/lit-video/web-checkin': { points_num: 5 }
          };
          if (path === '/lit-video/web-checkin' || path.startsWith('/action/')) actions.push(path);
          return route.fulfill({ json: { code: 200, data: responses[path] ?? {} } });
        });
        return context;
      }
    };
    const result = await runLitMediaCheckin(fixtureBrowser, {
      storageStatePath: 'state.json',
      targetUrl: 'https://fixture.test/home'
    });
    assert.equal(result.status, 'checked_in');
    assert.deepEqual(actions, ['/action/dismiss-sale', '/lit-video/web-checkin']);
  } finally {
    process.chdir(previousDir);
    await browser.close();
    await rm(directory, { recursive: true, force: true });
  }
});

const fixture = `<!doctype html><meta charset="utf-8">
<style>#sale {position:fixed;inset:0;background:white;z-index:2}</style>
<img alt="Gift credit" width="32" height="32">
<div role="dialog" id="rewards">
  <h2>每日簽到獎勵</h2>
  <button aria-label="關閉" onclick="fetch('/action/close-rewards');rewards.hidden=true">×</button>
  <button onclick="fetch('/lit-video/web-checkin')">簽到</button>
</div>
<div role="dialog" data-state="open" id="sale" hidden>
  <button aria-label="關閉" onclick="fetch('/action/dismiss-sale');sale.hidden=true">×</button>
  <section class="pass-stub">限時優惠
    <button onclick="fetch('/action/buy')">立即購買</button>
  </section>
</div>
<script>
  fetch('/account/check-login');
  fetch('/lit-video/get-user-info');
  fetch('/lit-video/get-web-sign-list');
  setTimeout(() => { sale.hidden = false; }, 1000);
</script>`;
