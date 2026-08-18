/* 実ブラウザでの配置検査。
   ヘッドレスのDOMスタブでは querySelectorAll も描画も無いため、
   「ボタンが重なる」「文字が円から切れる」「画面外に出る」類は
   ここでしか捕まらない。数値だけを測って通したことが実際の不具合を見逃した反省から追加した。
   Playwright が無い環境では実行できないので npm run check には含めず、
   npm run check:layout で個別に実行する。 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { console.log('playwright が無いため配置検査をスキップ'); process.exit(0); }

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const html = await readFile(new URL('../public/index.html', import.meta.url));
const server = createServer((_, res) => { res.setHeader('content-type', 'text/html;charset=utf-8'); res.end(html); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless: true, executablePath: EXE });

const problems = [], rows = [];
const sizes = [[320, 568, 'iPhone5'], [375, 667, 'SE'], [390, 844, '標準'], [430, 932, 'ProMax'], [768, 1024, 'タブレット']];

for (const [width, height, name] of sizes) {
  const page = await (await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(base); await page.waitForTimeout(400);
  await page.evaluate(() => { S.tutorial = { phase: 'done' }; S.training = false; save(); });
  await page.reload(); await page.waitForTimeout(500);
  await page.evaluate(() => {
    S.tutorial = { phase: 'done' }; S.deepest = 60; S.base.lv = 50; S.base.str = 150; S.base.def = 80;
    for (const slot of SLOTK) { let item; do item = makeItem(30, 0, 0, 3); while (item.slot !== slot || (item.ac && item.ac !== S.cls) || (item.wt && WCLS[item.wt] !== S.cls)); S.gear[slot] = item; }
    for (const key of CONSUMABLE_KEYS) S.consumables[key] = 5;
    S.loadout = ['mend1', 'edge1', 'quake1', 'swift1']; S.p = newPlayer(); beginRun(20); S.paused = false;
  });
  await page.waitForTimeout(600);

  const report = await page.evaluate(() => {
    const boxes = [];
    for (const id of ['s0', 's1', 's2', 's3']) { const e = document.getElementById(id); if (e && getComputedStyle(e).display !== 'none') boxes.push({ id, box: e.getBoundingClientRect() }); }
    for (const el of document.querySelectorAll('#railR .railBtn, #autoBtn')) boxes.push({ id: el.id || ('item' + el.dataset.slot), box: el.getBoundingClientRect() });
    const overlaps = [], offscreen = [], small = [];
    for (let a = 0; a < boxes.length; a++) {
      const A = boxes[a].box;
      if (A.right > innerWidth + 1 || A.left < -1 || A.bottom > innerHeight + 1 || A.top < -1) offscreen.push(boxes[a].id);
      if (A.width < 40 || A.height < 40) small.push(`${boxes[a].id}(${Math.round(A.width)}x${Math.round(A.height)})`);
      for (let b = a + 1; b < boxes.length; b++) {
        const B = boxes[b].box;
        if (Math.min(A.right, B.right) - Math.max(A.left, B.left) > .5 && Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top) > .5)
          overlaps.push(`${boxes[a].id}x${boxes[b].id}`);
      }
    }
    /* 技名が円の内側に収まっているか。
       外接矩形ではなく「円」と比べる。ボタンは border-radius:50% + overflow:hidden で
       丸く切り抜かれるため、矩形に収まっていても円の縁では削れる。
       文字の四隅が円の内側にあることを見る。 */
    const clipped = [];
    for (let i = 1; i <= 3; i++) {
      const label = document.getElementById('s' + i).querySelector('.skName');
      const circle = document.getElementById('s' + i).getBoundingClientRect();
      const range = document.createRange(); range.selectNodeContents(label);
      const text = range.getBoundingClientRect();
      const cx = (circle.left + circle.right) / 2, cy = (circle.top + circle.bottom) / 2, r = circle.width / 2;
      // 円に内接する正方形（一辺 r√2）に収まっていれば、縦位置が多少ずれても丸い縁で削れない
      const safe = r * Math.SQRT2 - 2;
      if (text.width > safe) clipped.push(`${label.textContent}: 文字${Math.round(text.width)}px が内接正方形${Math.round(safe)}px を超える`);
      /* 「技名＋消費MP」をひとかたまりとして見たときの重心が円の中心にあること。
         名前だけを中心に置くと、下にぶら下がる消費の分だけ組が下へ傾く。 */
      const cost = document.getElementById('s' + i).querySelector('.cost');
      const cbox = cost ? cost.getBoundingClientRect() : text;
      const groupTop = Math.min(text.top, cbox.top), groupBottom = Math.max(text.bottom, cbox.bottom);
      const drift = Math.abs((groupTop + groupBottom) / 2 - cy);
      if (drift > 4) clipped.push(`${label.textContent}: 技名と消費の組が円の中心から${Math.round(drift)}pxずれている`);
      // 四隅が円の内側にあること（最終確認）
      const corners = [[text.left, text.top], [text.right, text.top], [text.left, text.bottom], [text.right, text.bottom]];
      const outside = corners.filter(([x, y]) => Math.hypot(x - cx, y - cy) > r - 1);
      if (outside.length) clipped.push(`${label.textContent}: 文字の隅${outside.length}箇所が円の外`);
    }
    const rail = document.getElementById('railR').getBoundingClientRect();
    const hud = document.getElementById('hud').getBoundingClientRect();
    /* 上部の表示物どうしの重なり。ボスバーをミニマップの下へ潜り込ませた前科がある。 */
    const hudOverlaps = [];
    const top = [['ボスバー', 'bossBar'], ['ミニマップ', 'mmW'], ['一時停止', 'pauseB']]
      .map(([n, id]) => ({ n, e: document.getElementById(id) }))
      .filter(x => x.e && getComputedStyle(x.e).display !== 'none')
      .map(x => ({ n: x.n, box: x.e.getBoundingClientRect() }));
    for (let a = 0; a < top.length; a++) for (let b = a + 1; b < top.length; b++) {
      const A = top[a].box, B = top[b].box;
      if (Math.min(A.right, B.right) - Math.max(A.left, B.left) > .5 && Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top) > .5)
        hudOverlaps.push(`${top[a].n}x${top[b].n}`);
    }
    return {
      overlaps, offscreen, small, clipped, hudOverlaps,
      items: document.querySelectorAll('#railR .railBtn').length,
      hasAuto: !!document.getElementById('autoBtn'),
      railOverHud: rail.top < hud.bottom - 1,
      horizontalScroll: document.documentElement.scrollWidth > innerWidth,
    };
  });
  await page.close();

  const label = `${name} ${width}x${height}`;
  rows.push({ 端末: label, アイテム: report.items, 切替: report.hasAuto ? '有' : '無', 重なり: report.overlaps.length, 切れ: report.clipped.length });
  if (report.overlaps.length) problems.push(`${label}: 操作ボタンが重なる ${report.overlaps.join(', ')}`);
  if (report.offscreen.length) problems.push(`${label}: 操作ボタンが画面外 ${report.offscreen.join(', ')}`);
  if (report.small.length) problems.push(`${label}: 操作ボタンが40px未満 ${report.small.join(', ')}`);
  if (report.clipped.length) problems.push(`${label}: 技名が円から切れる ${report.clipped.join(', ')}`);
  if (report.items !== 4) problems.push(`${label}: アイテムボタンが ${report.items}個（持ち込み4枠のはず）`);
  if (!report.hasAuto) problems.push(`${label}: 戦闘画面に操作モード切替が無い`);
  if (report.railOverHud) problems.push(`${label}: アイテム列が上部HUDへ重なる`);
  if (report.hudOverlaps.length) problems.push(`${label}: 上部の表示が重なる ${report.hudOverlaps.join(', ')}`);
  if (report.horizontalScroll) problems.push(`${label}: 横スクロールが発生`);
  if (errors.length) problems.push(`${label}: 例外 ${[...new Set(errors)][0]}`);
}
/* 拠点まわり。数字だけ見て通した反省から、実際の折り返しと画面内に収まるかを測る。 */
{
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base); await page.waitForTimeout(400);
  await page.evaluate(() => {
    S.tutorial = { phase: 'done' }; S.training = false; S.deepest = 60; S.diveFloor = 1; S.premium = 3000; S.gold = 48000;
    S.base.lv = 50;
    for (const slot of SLOTK) { let it; do it = makeItem(30, 0, 0, 3); while (it.slot !== slot || (it.ac && it.ac !== S.cls) || (it.wt && WCLS[it.wt] !== S.cls)); S.gear[slot] = it; }
    for (const key of CONSUMABLE_KEYS) S.consumables[key] = 5;
    S.loadout = ['mend1', 'edge1', 'quake1', 'swift1']; save();
  });
  await page.reload(); await page.waitForTimeout(600);

  // 到達済みなのに毎回1Fから、では潜るまでに±を何十回も押すことになる
  const dive = await page.evaluate(() => S.diveFloor);
  if (dive !== 56) problems.push(`拠点: 深度60の保存から開始階層が ${dive}F（最深の 56F になるはず）`);

  // 拠点タブは「誰で潜るか」がスクロールなしで見えること
  const prep = await page.evaluate(() => {
    const body = document.querySelector('#scTown .sbody'), form = document.querySelector('.formation');
    return { scroll: body.scrollHeight - body.clientHeight, formBottom: form.getBoundingClientRect().bottom, h: innerHeight };
  });
  if (prep.scroll > 2) problems.push(`拠点: 初期表示で ${Math.round(prep.scroll)}px スクロールが要る`);
  if (prep.formBottom > prep.h) problems.push('拠点: 編成がスクロールしないと見えない');

  // 階層一覧が開き、最深が選べること
  await page.evaluate(() => document.querySelector('#diveBar .fl').dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
  await page.waitForTimeout(300);
  const floors = await page.evaluate(() => document.querySelectorAll('.floorGrid .fbtn').length);
  if (floors !== 12) problems.push(`拠点: 階層一覧の選択肢が ${floors}件（1F〜56Fの12件のはず）`);
  await page.evaluate(() => $('itPop').classList.remove('on'));

  // 装備名が枠から溢れて語尾が落ちていないこと
  await page.evaluate(() => { document.querySelector('#scTown .tab[data-t="gear"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
  await page.waitForTimeout(200);
  await page.evaluate(() => { S.gearSub = 'equip'; openTown(); });
  await page.waitForTimeout(350);
  const names = await page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll('.gearPanel .slot .si, #townBody .slot .si')) {
      if (!el.textContent || el.textContent === '—') continue;
      /* 1行に収めようとすると「ウォーハン…」と切れて読めない。
         2行までは許し、枠からはみ出していないことだけを見る。 */
      const lines = Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight));
      if (lines > 2) bad.push(`${el.textContent}が${lines}行になっている`);
      if (el.scrollHeight > el.clientHeight + 1) bad.push(`${el.textContent}が枠に入りきらず切れている`);
      const tile = el.closest('.slot');
      if (tile) { const a = el.getBoundingClientRect(), t = tile.getBoundingClientRect();
        if (a.bottom > t.bottom + 1) bad.push(`${el.textContent}が枠の下へはみ出している`); }
    }
    return bad;
  });
  if (names.length) problems.push(`装備画面: 装備名が枠に収まらない ${names.join(', ')}`);

  // 技を差し替えると戦闘のボタンにもそのまま出ること
  await page.evaluate(() => { document.querySelector('#scTown .tab[data-t="gear"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
  await page.waitForTimeout(300);
  await page.evaluate(() => { S.gearSub = 'skill'; openTown(); });
  await page.waitForTimeout(300);
  const skillTab = await page.evaluate(() => ({
    slots: document.querySelectorAll('.skillSlot').length,
    cards: document.querySelectorAll('.skillCard').length,
    unlocked: skillPoolFor().filter(skillUnlocked).length,
  }));
  if (skillTab.slots !== 3) problems.push(`技タブ: 枠が ${skillTab.slots}個（3枠のはず）`);
  if (skillTab.cards !== 9) problems.push(`技タブ: 選択肢が ${skillTab.cards}個（共通8種＋固有1種のはず）`);
  if (skillTab.unlocked !== 9) problems.push(`技タブ: 深度60で解放済みが ${skillTab.unlocked}種`);
  const swapped = await page.evaluate(() => {
    // 保存はキャラクター単位。直接キーを書かず、実際の差し替え口を通す
    ['whirl', 'charge', 'verdict'].forEach((id, i) => setSkillSlot(S.cls, i, id));
    S.p = newPlayer(); beginRun(20); S.paused = false;
    return [1, 2, 3].map(i => $('s' + i).querySelector('.skName').textContent);
  });
  if (swapped.join('/') !== '旋風/疾駆/断罪') problems.push(`技タブ: 差し替えが戦闘に反映されない（${swapped.join('/')}）`);
  // 差し替えた技名も円からはみ出さないこと
  const skClip = await page.evaluate(() => {
    const bad = [];
    for (let i = 1; i <= 3; i++) {
      const el = document.getElementById('s' + i), label = el.querySelector('.skName');
      const c = el.getBoundingClientRect(), range = document.createRange(); range.selectNodeContents(label);
      const t = range.getBoundingClientRect();
      if (t.width > c.width / 2 * Math.SQRT2 - 2) bad.push(label.textContent);
    }
    return bad;
  });
  if (skClip.length) problems.push(`技タブ: 差し替えた技名が円から切れる ${skClip.join(', ')}`);
  await page.evaluate(() => { S.skillLoadout = {}; S.scene = 'town'; S.training = false; save(); openTown(); });
  await page.waitForTimeout(300);

  // 商店に10連と提供割合があること
  await page.evaluate(() => document.querySelector('#scTown .tab[data-t="shop"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
  await page.waitForTimeout(350);
  const shop = await page.evaluate(() => ({
    ten: [...document.querySelectorAll('.gachaBtns .btn')].filter(e => e.textContent.includes('10連')).length,
    rates: document.querySelectorAll('.rateLink').length,
  }));
  if (shop.ten !== 2) problems.push(`商店: 10連ボタンが ${shop.ten}個（2種のガチャそれぞれに要る）`);
  if (shop.rates !== 2) problems.push(`商店: 提供割合への導線が ${shop.rates}個`);

  if (errors.length) problems.push(`拠点: 例外 ${[...new Set(errors)][0]}`);
  rows.push({ 端末: '拠点', アイテム: '-', 切替: '-', 重なり: '-', 切れ: '-' });
  await page.close();
}
/* チュートリアル中は、案内を閉じた後でもスキップに手が届くこと。
   スキップが案内バナーの中だけにあると、閉じた時点で練習部屋から出られなくなる。 */
{
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await page.goto(base); await page.waitForTimeout(400);
  const phases = ['training_intro', 'training_cleave', 'training_potion', 'training_return', 'tour_prep', 'tour_inv', 'boss', 'equip', 'shop', 'formation_slot'];
  for (const phase of phases) {
    await page.evaluate(p => localStorage.setItem('descent_v5', JSON.stringify({ ...JSON.parse(localStorage.getItem('descent_v5') || '{}'), cls: 'warrior', tutorial: { phase: p, gearIndex: 0 } })), phase);
    await page.reload(); await page.waitForTimeout(450);
    // 案内が出ていれば「確認」で閉じる（ここでスキップが消えるのが以前の不具合）
    await page.evaluate(() => { const c = document.getElementById('tutorialConfirm'); if (c) c.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    await page.waitForTimeout(150);
    const reachable = await page.evaluate(() => {
      const visible = el => {
        if (!el) return false;
        const holder = el.closest('#tutorialBanner,#tutorialBar');
        if (holder && getComputedStyle(holder).display === 'none') return false;
        const box = el.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && getComputedStyle(el).visibility !== 'hidden'
          && box.top >= 0 && box.bottom <= innerHeight && box.left >= 0 && box.right <= innerWidth;
      };
      return visible(document.getElementById('tutorialSkip')) || visible(document.getElementById('tutorialQuit'));
    });
    if (!reachable) problems.push(`チュートリアル ${phase}: 案内を閉じた後にスキップへ手が届かない`);
  }
  rows.push({ 端末: 'チュートリアル', アイテム: '-', 切替: '-', 重なり: '-', 切れ: '-' });
  await page.close();
}
await browser.close(); server.close();

console.table(rows);
if (problems.length) { console.error('=== 配置の問題 ===\n' + problems.join('\n')); process.exit(1); }
console.log('配置検査: 全端末で重なり・切れ・画面外なし');
