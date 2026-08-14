/* テストプレイ前の通し確認。
   実ブラウザで「はじめから始めて、遊んで、拠点の全画面を触る」までを一周し、
   例外・進行不能・数値の異常が出ないかを見る。
   数値だけを測って通したことが実際の不具合を見逃した反省から、
   ここでは必ず「実際に押して、実際に進むか」で判定する。
   Playwright が無い環境では実行できないので npm run check には含めない。 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { console.log('playwright が無いため通し確認をスキップ'); process.exit(0); }

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const html = await readFile(new URL('../public/index.html', import.meta.url));
const server = createServer((_, res) => { res.setHeader('content-type', 'text/html;charset=utf-8'); res.end(html); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless: true, executablePath: EXE });

const problems = [], notes = [];
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const tap = sel => page.evaluate(s => {
  const el = document.querySelector(s); if (!el) return false;
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); return true;
}, sel);

await page.goto(base); await page.waitForTimeout(500);

/* 1. 初回起動: 練習部屋が始まり、スキップで遊べる拠点へ出られること */
{
  const started = await page.evaluate(() => ({ scene: S.scene, training: S.training, phase: (S.tutorial || {}).phase }));
  if (started.scene !== 'dungeon' || !started.training) problems.push(`初回起動で練習部屋が始まらない（${JSON.stringify(started)}）`);
  await page.evaluate(() => { const c = document.getElementById('tutorialConfirm'); if (c) c.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
  await page.waitForTimeout(200);
  const skipped = await page.evaluate(() => {
    for (const id of ['tutorialSkip', 'tutorialQuit']) {
      const el = document.getElementById(id);
      if (el && el.getBoundingClientRect().width > 0) { el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); return id; }
    }
    return null;
  });
  if (!skipped) problems.push('練習部屋からスキップに手が届かない');
  await page.waitForTimeout(400);
  await page.evaluate(() => { const y = [...document.querySelectorAll('.btn')].find(e => /はい|スキップ/.test(e.textContent)); if (y) y.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
  await page.waitForTimeout(600);
  /* 練習部屋からのスキップは帰還画面を経由する。そこで止まらず拠点まで行けること。 */
  const viaEnd = await page.evaluate(() => document.getElementById('scEnd').classList.contains('on'));
  if (viaEnd) {
    await page.evaluate(() => { const b = document.getElementById('btnBack'); if (b) b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    await page.waitForTimeout(600);
  }
  const after = await page.evaluate(() => ({ scene: S.scene, training: S.training, phase: (S.tutorial || {}).phase, 潜れる: !!document.querySelector('#diveBar .go'), 帰還画面経由: false }));
  after.帰還画面経由 = viaEnd;
  if (after.scene !== 'town' || after.training) problems.push(`スキップ後に拠点へ戻れない（${JSON.stringify(after)}）`);
  if (!after.潜れる) problems.push('スキップ後に潜るボタンが無い');
  notes.push(`初回起動→スキップ→拠点: ${after.scene} / 練習フラグ ${after.training} / 帰還画面経由 ${after.帰還画面経由}`);
}

/* 2. 実際に潜って、敵を倒して、経験値と戦利品が入ること */
{
  const run = await page.evaluate(async () => {
    S.deepest = 40; S.base.lv = 40; S.base.str = 120; S.base.def = 50;
    for (const slot of SLOTK) { let it; do it = makeItem(25, 0, 0, 2); while (it.slot !== slot || (it.ac && it.ac !== S.cls) || (it.wt && WCLS[it.wt] !== S.cls)); S.gear[slot] = it; }
    for (const k of CONSUMABLE_KEYS) S.consumables[k] = 5;
    S.loadout = ['heal', 'power', 'sonic', 'gale'];
    beginRun(21); S.paused = false;
    const xp0 = S.base.xp, lv0 = S.base.lv;
    let killed = 0;
    HELD.fill(true);
    for (let t = 0; t < 30 && S.scene === 'dungeon'; t += .05) {
      if (!S.enemies.length) break;
      let e = S.enemies[0], best = 1e9;
      for (const x of S.enemies) { const z = d2(S.p.x, S.p.y, x.x, x.y); if (z < best) { best = z; e = x; } }
      const a = Math.atan2(e.y - S.p.y, e.x - S.p.x);
      S.p.x = e.x - Math.cos(a) * 1.15; S.p.y = e.y - Math.sin(a) * 1.15; S.p.face = a;
      S.p.hp = S.p.max;                       // 死なせずに「進むか」だけを見る
      for (let i = 0; i < 3; i++) if (S.p.cds[i] <= 0 && S.p.mp >= activeSkills()[i].c) useSkill(i);
      update(.05);
      killed = S.p.kills;
    }
    HELD.fill(false);
    return { killed, xp増: S.base.xp !== xp0 || S.base.lv !== lv0, 戦利品: S.bag.length, 金: S.runGold, 敵残: S.enemies.length };
  });
  if (!run.killed) problems.push('潜行して30秒攻撃しても1体も倒せない');
  if (run.killed && !run.xp増) problems.push('敵を倒しても経験値が入らない（練習部屋フラグの残留を疑う）');
  notes.push(`深度21で30秒: ${run.killed}体撃破 / 戦利品${run.戦利品}個 / ${run.金}G / 敵残${run.敵残}`);
}

/* 2b. 回復薬は道中で持ち込み上限を超えて拾えること */
{
  const heal = await page.evaluate(() => {
    S.consumables.heal = 3; S.loadout = ['heal', 'power', 'sonic', 'gale'];
    beginRun(20); S.paused = false;
    const start = S.runItems[0];
    for (let i = 0; i < 12; i++) {
      S.drops.push({ x: S.p.x, y: S.p.y, pot: 1, t: 1 });
      for (let f = 0; f < 12; f++) update(1 / 60);
    }
    return { start, end: S.runItems[0], cap: CFG.HEAL_RUN_CAP };
  });
  if (heal.end <= heal.start) problems.push(`道中で回復薬を1つも拾えない（持ち込み${heal.start}個のまま）`);
  if (heal.end !== heal.cap) problems.push(`道中の回復薬が ${heal.end}個で止まる（上限${heal.cap}のはず）`);
  notes.push(`回復薬: 持ち込み${heal.start} → 道中で${heal.end}（上限${heal.cap}）`);
}

/* 3. 帰還して拠点へ戻れること */
{
  const back = await page.evaluate(() => { endRun(true); return { scene: S.scene }; });
  await page.waitForTimeout(400);
  await page.evaluate(() => { const b = document.getElementById('btnBack'); if (b) b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
  await page.waitForTimeout(500);
  const town = await page.evaluate(() => ({ scene: S.scene, 潜れる: !!document.querySelector('#diveBar .go') }));
  if (town.scene !== 'town' || !town.潜れる) problems.push(`帰還後に拠点へ戻れない（${JSON.stringify(town)}）`);
  notes.push(`帰還→拠点: ${town.scene}`);
}

/* 4. 拠点の全タブと主要ポップアップが開くこと */
{
  await page.evaluate(() => {
    S.premium = 5000; S.gold = 90000; S.deepest = 60;
    S.unlockedCharacters = allRoster().map(x => x.k + ':' + x.ch.id);
    for (let i = 0; i < 12; i++) S.stash.push(makeItem(28, 0, 0, i % 5));
    for (const k of ['crystal', 'core']) for (const t of [1, 2, 3]) addMat(k, t, 40);
    save(); openTown();
  });
  await page.waitForTimeout(300);
  for (const [t, name] of [['prep', '拠点'], ['gear', '装備'], ['inv', '倉庫'], ['shop', '商店'], ['conf', '設定']]) {
    if (!await tap(`#scTown .tab[data-t="${t}"]`)) { problems.push(`${name}タブが無い`); continue; }
    await page.waitForTimeout(300);
    const shown = await page.evaluate(() => document.querySelector('#scTown .sbody').children.length);
    if (!shown) problems.push(`${name}タブの中身が空`);
  }
  // 装備の3サブタブ
  await tap('#scTown .tab[data-t="gear"]'); await page.waitForTimeout(250);
  for (const label of ['装備', '技', '能力']) {
    const ok = await page.evaluate(l => {
      const b = [...document.querySelectorAll('.innerTabs .btn')].find(e => e.textContent === l);
      if (!b) return false; b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); return true;
    }, label);
    if (!ok) problems.push(`装備タブに「${label}」が無い`);
    await page.waitForTimeout(250);
  }
  // 倉庫の4区画すべてが開くこと
  await tap('#scTown .tab[data-t="inv"]'); await page.waitForTimeout(250);
  for (const label of ['装備', '結晶', '分解', '調合']) {
    const ok = await page.evaluate(l => {
      const b = [...document.querySelectorAll('.innerTabs .btn')].find(e => e.textContent === l);
      if (!b) return false; b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); return true;
    }, label);
    if (!ok) { problems.push(`倉庫に「${label}」タブが無い`); continue; }
    await page.waitForTimeout(250);
    const n = await page.evaluate(() => document.querySelector('#scTown .sbody').children.length);
    if (n < 2) problems.push(`倉庫の「${label}」タブが空`);
  }
  // 枠の大きさが揃っていること（装備あり/なしで段の高さが変わっていた）
  // 一部だけ装備した状態にして、埋まった段と空の段を並べて測る
  await page.evaluate(() => {
    S.gearSub = 'equip'; S.tab = 'gear';
    for (const slot of SLOTK) S.gear[slot] = null;
    for (const slot of ['weapon', 'helm', 'armor']) { let it; do it = makeItem(30, 0, 0, 3); while (it.slot !== slot || (it.ac && it.ac !== S.cls) || (it.wt && WCLS[it.wt] !== S.cls)); it.lv = 5; S.gear[slot] = it; }
    save(); openTown();
  });
  await page.waitForTimeout(350);
  const sizes = await page.evaluate(() => {
    const h = [...document.querySelectorAll('.slot')].map(e => Math.round(e.getBoundingClientRect().height));
    const m = [...document.querySelectorAll('.member')].map(e => Math.round(e.getBoundingClientRect().height));
    return { 装備: [...new Set(h)], 編成: [...new Set(m)] };
  });
  if (!sizes.装備.length) problems.push('装備枠が1つも描画されていない');
  if (sizes.装備.length > 1) problems.push(`装備枠の高さが揃っていない ${sizes.装備.join('/')}`);
  // 固有技が一覧の先頭にあること
  await page.evaluate(() => [...document.querySelectorAll('.innerTabs .btn')].find(e => e.textContent === '技').dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
  await page.waitForTimeout(300);
  const firstSkill = await page.evaluate(() => {
    const c = document.querySelector('.skillCard');
    return c ? { uniq: c.classList.contains('uniqSkill'), name: c.querySelector('.nm').textContent.trim() } : null;
  });
  if (!firstSkill || !firstSkill.uniq) problems.push(`技一覧の先頭が固有技でない（${firstSkill ? firstSkill.name : '無し'}）`);
  notes.push(`装備枠 ${sizes.装備.join('/')}px / 技一覧の先頭 ${firstSkill ? firstSkill.name : '無し'}`);
  await tap('#scTown .tab[data-t="prep"]'); await page.waitForTimeout(250);

  // 階層一覧・提供割合・編成
  await tap('#scTown .tab[data-t="prep"]'); await page.waitForTimeout(250);
  await tap('#diveBar .fl'); await page.waitForTimeout(300);
  const floors = await page.evaluate(() => document.querySelectorAll('.floorGrid .fbtn').length);
  if (floors < 2) problems.push(`階層一覧が開かない（選択肢${floors}）`);
  await page.evaluate(() => $('itPop').classList.remove('on'));
  await tap('#scTown .tab[data-t="shop"]'); await page.waitForTimeout(250);
  await tap('.rateLink'); await page.waitForTimeout(300);
  const rates = await page.evaluate(() => document.querySelectorAll('.rateRow').length);
  if (!rates) problems.push('提供割合が開かない');
  await page.evaluate(() => $('itPop').classList.remove('on'));
  notes.push(`拠点の全タブ・階層一覧(${floors}件)・提供割合(${rates}行) 開通`);
}

/* 5. 管理者モードの説明ボタン。テストプレイ中に仕様を引くための入口。 */
{
  await tap('#scTown .tab[data-t="conf"]'); await page.waitForTimeout(300);
  const before = await page.evaluate(() => [...document.querySelectorAll('.btn')].filter(e => e.textContent.includes('遊び方')).length);
  if (before) problems.push('管理者モードに入る前から説明ボタンが見えている');
  await page.evaluate(() => {
    const i = [...document.querySelectorAll('input')].find(x => (x.getAttribute('aria-label') || '').includes('モード切替コード'));
    if (i) { i.value = 'pM97342Gamt'; i.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  await page.waitForTimeout(400);
  const opened = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.btn')].find(e => e.textContent.includes('遊び方'));
    if (!b) return null;
    b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); return true;
  });
  if (!opened) problems.push('管理者モードに説明ボタンが出ない');
  await page.waitForTimeout(300);
  const help = await page.evaluate(() => ({
    見出し: document.querySelectorAll('.helpHead').length,
    行: document.querySelectorAll('.helpList li').length,
    横溢れ: document.getElementById('itC').scrollWidth > document.getElementById('itC').clientWidth + 1,
  }));
  if (help.見出し < 5) problems.push(`説明の見出しが ${help.見出し}個しかない`);
  if (help.横溢れ) problems.push('説明が横にはみ出している');
  await page.evaluate(() => $('itPop').classList.remove('on'));
  notes.push(`管理者モードの説明: 見出し${help.見出し} / ${help.行}行`);
}

/* 6. 全ボスが出現して動くこと（テストプレイで最初に触る所） */
{
  const bosses = await page.evaluate(() => {
    const out = [];
    for (let f = 5; f <= 50; f += 5) {
      beginRun(f); S.paused = false;
      const b = S.boss;
      if (!b) { out.push(`${f}F:ボス不在`); continue; }
      S.p.x = b.x + 3; S.p.y = b.y; b.agro = true;
      let err = null;
      try { for (let i = 0; i < 240; i++) { S.p.hp = S.p.max; update(1 / 60); if (i === 120) b.hp = b.max * .4; } }
      catch (e) { err = e.message; }
      out.push(`${f}F:${b.n}${err ? ' 例外:' + err : b.phase === 2 ? '' : ' 激昂せず'}`);
    }
    return out;
  });
  const bad = bosses.filter(r => r.includes('例外') || r.includes('不在') || r.includes('激昂せず'));
  if (bad.length) problems.push(`ボスの異常: ${bad.join(' / ')}`);
  notes.push(`ボス10体: ${bosses.map(r => r.split(':')[1]).join(' / ')}`);
}

if (errors.length) problems.push(`実行中の例外: ${[...new Set(errors)].slice(0, 3).join(' | ')}`);
await page.close(); await browser.close(); server.close();

for (const n of notes) console.log('  ' + n);
if (problems.length) { console.error('=== 通し確認の問題 ===\n' + problems.map(p => '・' + p).join('\n')); process.exit(1); }
console.log('通し確認: 初回起動からボスまで、進行不能・例外なし');
