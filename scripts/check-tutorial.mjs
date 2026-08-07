import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const server = spawn('python3', ['-m', 'http.server', '4173', '-d', 'public'], {
  stdio: 'ignore',
});
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (value, message) => {
  if (!value) throw new Error(message);
};

let browser;
try {
  await wait(500);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'domcontentloaded' });

  const originalSkills = await page.locator('#pad').evaluate((pad) =>
    [...pad.querySelectorAll('.sk')].map((el) => ({ id: el.id, left: el.offsetLeft, top: el.offsetTop })));
  await page.locator('#askY').click();
  assert(await page.evaluate(() => S.enemies.length === 1 && S.enemies[0].hp === 150),
    'The cleave training enemy did not appear.');
  assert(await page.locator('#tutorialMask').evaluate((el) => getComputedStyle(el).display === 'none'),
    'The tutorial obscured the dungeon.');
  await page.locator('#tutorialConfirm').click();
  const highlightedSkills = await page.locator('#pad').evaluate((pad) =>
    [...pad.querySelectorAll('.sk')].map((el) => ({ id: el.id, left: el.offsetLeft, top: el.offsetTop })));
  assert(JSON.stringify(originalSkills) === JSON.stringify(highlightedSkills),
    'Highlighting moved or duplicated a skill button.');
  await page.locator('#s1').click();
  await page.waitForFunction(() => S.tutorial.phase === 'training_dash' && S.enemies.length === 1);
  await page.locator('#tutorialConfirm').click();
  await page.locator('#s2').click();
  await page.waitForFunction(() => S.tutorial.phase === 'training_slam' && S.enemies.length === 3);
  await page.locator('#tutorialConfirm').click();
  await page.locator('#s3').click();
  await page.waitForFunction(() => S.tutorial.phase === 'training_potion' && S.enemies.length === 0);
  await page.locator('#tutorialConfirm').click();
  await page.locator('#pot').click();
  await page.waitForFunction(() => S.tutorial.phase === 'training_return');
  await page.locator('#tutorialConfirm').click();

  await page.evaluate(() => { S.p.x = S.portal.x; S.p.y = S.portal.y; updAction(); });
  await page.locator('#act').click();
  await page.locator('#askY').click();
  await page.waitForFunction(() => document.querySelector('#scEnd').classList.contains('on'));
  await page.locator('#btnBack').click();
  await page.waitForFunction(() => document.querySelector('#scTown').classList.contains('on'));
  assert(await page.locator('[data-t="gear"]').evaluate((el) => el.classList.contains('tutorialTarget')),
    'The first town-tour tab was not highlighted.');

  await page.locator('#tutorialConfirm').click();
  assert(await page.locator('#tutorialBanner').evaluate((el) => el.style.display === 'none'),
    'The tutorial explanation could not be confirmed.');
  await page.locator('[data-t="gear"]').click();
  await page.locator('#tutorialConfirm').click(); // The already-open equipment view is explanation-only.
  await page.locator('#tutorialConfirm').click();
  await page.locator('.innerTabs .btn').filter({ hasText: '能力' }).click();
  await page.locator('#tutorialConfirm').click();
  await page.locator('[data-t="inv"]').click();
  await page.locator('#tutorialConfirm').click();
  await page.locator('[data-t="shop"]').click();
  await page.locator('#tutorialConfirm').click(); // The already-open gacha view is explanation-only.
  await page.locator('#tutorialConfirm').click();
  await page.locator('.shopTabs .btn').filter({ hasText: 'ジェム' }).click();
  await page.locator('#tutorialConfirm').click();
  await page.locator('.shopTabs .btn').filter({ hasText: 'ゴールド' }).click();
  await page.locator('#tutorialConfirm').click();
  await page.locator('[data-t="conf"]').click();
  await page.locator('#tutorialConfirm').click();
  await page.locator('[data-t="prep"]').click();
  assert(await page.evaluate(() => S.tutorial.phase === 'boss'),
    'The town-tour tabs could not all be completed.');

  console.log('Tutorial flow passed: skills, return result, dismissal, and every town tab work.');
} finally {
  await browser?.close();
  server.kill();
}
