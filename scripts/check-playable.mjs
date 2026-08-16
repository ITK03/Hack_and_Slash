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
    S.loadout = ['mend1', 'edge1', 'quake1', 'swift1'];
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
    S.consumables.mend1 = 3; S.loadout = ['mend1', 'edge1', 'quake1', 'swift1'];
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

/* 2c. 敵の種類が深さとともに増え、序盤は弱い型だけであること */
{
  const ladder = await page.evaluate(() => {
    const heavy = ['brute', 'bomber', 'warden', 'phaser', 'splitter', 'leech'];
    // ボスは種類数に数えない（5層ごとに必ず出るため、通常敵の増え方が読めなくなる）
    const kinds = f => { S.deepest = Math.max(S.deepest, f); enterFloor(f); return [...new Set(S.enemies.filter(e => !e.boss).map(e => e.k))]; };
    const shallow = new Set(); for (const f of [1, 3, 5, 8, 10]) for (const k of kinds(f)) shallow.add(k);
    const counts = [1, 10, 30, 60].map(f => ({ f, n: kinds(f).length }));
    return { 序盤に重い型: [...shallow].filter(k => heavy.includes(k)), counts };
  });
  if (ladder.序盤に重い型.length) problems.push(`深度10までに重い敵が出る: ${ladder.序盤に重い型.join(',')}`);
  for (let i = 1; i < ladder.counts.length; i++)
    if (ladder.counts[i].n < ladder.counts[i - 1].n)
      problems.push(`深度${ladder.counts[i].f}の敵の種類が深度${ladder.counts[i - 1].f}より少ない`);
  notes.push(`敵の種類: ${ladder.counts.map(c => `${c.f}F=${c.n}種`).join(' → ')}`);
}

/* 2d. 倒れて次の番手へ交代したとき、技ボタンの表示と中身が一致すること */
{
  const swap = await page.evaluate(() => {
    S.deepest = 60; S.base.lv = 40;
    S.unlockedCharacters = allRoster().map(x => x.k + ':' + x.ch.id);
    S.formation = ['warrior:leon', 'warrior:gai'];
    selectCharacter('warrior', 'leon', () => { });
    setSkillSlot('warrior', 0, 'u_leon');       // 1人目に固有技を差す
    S.loadout = ['mend1', null, null, null]; S.consumables.mend1 = 3;
    beginRun(20); S.paused = false;
    const before = { 表示: [1, 2, 3].map(i => $('s' + i).querySelector('.skName').textContent), 中身: activeSkills().map(x => x.n) };
    S.partyIndex = 0; S.p.hp = 0; endRun(false, 'テスト');
    const after = { 誰: currentCharacter().n, 表示: [1, 2, 3].map(i => $('s' + i).querySelector('.skName').textContent), 中身: activeSkills().map(x => x.n) };
    return { before, after };
  });
  if (swap.before.表示.join() !== swap.before.中身.join())
    problems.push(`交代前から技ボタンの表示と中身が食い違う（表示 ${swap.before.表示.join('/')} / 中身 ${swap.before.中身.join('/')}）`);
  if (swap.after.表示.join() !== swap.after.中身.join())
    problems.push(`交代後に技ボタンの表示と中身が食い違う（表示 ${swap.after.表示.join('/')} / 中身 ${swap.after.中身.join('/')}）`);
  notes.push(`交代: ${swap.before.表示.join('/')} → ${swap.after.誰} ${swap.after.表示.join('/')}`);
}

/* 2e. 枠の色＝レア度、絵の色＝系統。この2つの役割が入れ替わっていないこと。
       同じ系統の1段目と3段目を並べて、枠だけが変わることまで見る。 */
{
  const colors = await page.evaluate(() => {
    const rgbOf = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ');
    S.loadout = ['mend1', 'mend3', 'quake1', 'swift1'];
    for (const k of CONSUMABLE_KEYS) S.consumables[k] = 3;
    beginRun(20); S.paused = false;
    const bad = [], frames = {};
    for (const el of document.querySelectorAll('#railR .railBtn')) {
      const key = S.loadout[+el.dataset.slot]; if (!key) continue;
      const def = CONSUMABLES[key];
      if (!el.style.borderColor.includes(rgbOf(rareFrame(def.rar))))
        bad.push(`${def.n} の枠がレア度の色でない(${el.style.borderColor})`);
      if (!el.style.color.includes(rgbOf(def.col)))
        bad.push(`${def.n} の絵が系統の色でない(${el.style.color})`);
      frames[key] = el.style.borderColor;
    }
    if (frames.mend1 && frames.mend1 === frames.mend3) bad.push('癒血の1段目と3段目で枠の色が同じ');
    return bad;
  });
  if (colors.length) problems.push(`アイテムの色分けが規則どおりでない: ${colors.join(', ')}`);
}

/* 2f. 素材。固有素材が敵から落ち、倉庫にレア度の枠つきで並ぶこと。 */
{
  const parts = await page.evaluate(() => {
    const rgbOf = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ');
    // 出どころの敵を倒したときに、その素材だけが落ちること
    S.stock = {}; S.training = false; S.drops = [];
    let tries = 0, got = null;
    while (tries++ < 4000 && !got) {
      S.drops.length = 0;
      dropPart({ k: 'grunt', x: 5, y: 5 });
      if (S.drops.length) got = S.drops[0].part;
    }
    const wrongSource = [];
    S.drops.length = 0;
    for (let i = 0; i < 3000; i++) dropPart({ k: 'grunt', x: 5, y: 5 });
    for (const d of S.drops) if (d.part !== 'ashfang') wrongSource.push(d.part);
    const rate = S.drops.length / 3000;
    // 倉庫の素材棚
    S.stock = Object.fromEntries(PART_KEYS.map(k => [k, 5]));
    S.tab = 'inv'; S.invSub = 'mat'; openTown();
    const cards = [...document.querySelectorAll('#townBody .card')];
    const badFrames = [];
    for (const key of PART_KEYS) {
      const card = cards.find(c => c.textContent.includes(PARTS[key].n));
      if (!card) { badFrames.push(`${PARTS[key].n} が倉庫に出ない`); continue; }
      if (!card.style.borderColor.includes(rgbOf(rareFrame(PARTS[key].rar))))
        badFrames.push(`${PARTS[key].n} の枠がレア度の色でない`);
      if (!card.querySelector('svg')) badFrames.push(`${PARTS[key].n} に絵が無い`);
    }
    // 絵は全種で違う形であること（形が同じだと一目で見分けられない）
    const shapes = new Set(PART_KEYS.map(k => PARTS[k].ic));
    return { got, wrongSource: [...new Set(wrongSource)], rate, badFrames, shapes: shapes.size, total: PART_KEYS.length };
  });
  if (parts.got !== 'ashfang') problems.push(`下僕から落ちる素材が想定と違う（${parts.got}）`);
  if (parts.wrongSource.length) problems.push(`下僕から別の素材が落ちた: ${parts.wrongSource.join(', ')}`);
  if (parts.rate > .12) problems.push(`固有素材のドロップ率 ${(parts.rate * 100).toFixed(1)}% が高すぎる`);
  if (parts.badFrames.length) problems.push(`素材の表示: ${parts.badFrames.join(', ')}`);
  if (parts.shapes !== parts.total) problems.push(`素材の絵が重複している（${parts.shapes}/${parts.total}種）`);
  notes.push(`固有素材: ${parts.total}種 / 灰の牙 ${(parts.rate * 100).toFixed(1)}%`);
}

/* 2g. 調合。1段目は結晶だけ、上の段は固有素材が要ること。 */
{
  const craft = await page.evaluate(() => {
    S.mats = { crystal: { 1: 9999 }, core: { 1: 9999 } }; S.stock = {}; S.consumables = {};
    const onlyCrystal = CONSUMABLE_KEYS.filter(k => craftableCount(k) > 0);
    const needParts = CONSUMABLE_KEYS.filter(k => CONSUMABLES[k].craft.parts);
    const before = craftableCount('mend3');
    S.stock = Object.fromEntries(PART_KEYS.map(k => [k, 99]));
    const after = craftableCount('mend3');
    // 段が上がるほど効果が強いこと
    const heals = ['mend1', 'mend2', 'mend3'].map(k => CONSUMABLES[k].heal);
    const rising = heals.every((v, i) => i === 0 || v > heals[i - 1]);
    // 実際に作れること（材料が減り、所持数が増える）
    const stock = partCount('sapvein');
    const made = craftItem('mend3', 1);
    askFn && askFn();   // 確認ダイアログは実際に「はい」を押したときだけ消費する
    return { onlyCrystal, needParts: needParts.length, before, after, rising,
      made: !!made, spent: stock - partCount('sapvein'), have: S.consumables.mend3 || 0 };
  });
  const g1 = craft.onlyCrystal.filter(k => k.endsWith('1'));
  if (craft.onlyCrystal.some(k => !k.endsWith('1')))
    problems.push(`結晶だけで2段目以降が作れる: ${craft.onlyCrystal.filter(k => !k.endsWith('1')).join(', ')}`);
  if (!g1.length) problems.push('結晶だけでは1段目すら作れない');
  if (craft.needParts < 10) problems.push(`固有素材を要求する消耗品が ${craft.needParts} 種しかない`);
  if (craft.before !== 0 || craft.after <= 0) problems.push(`上位品が固有素材なしで作れる（前 ${craft.before} / 後 ${craft.after}）`);
  if (!craft.rising) problems.push('癒血の効果が段階で上がっていない');
  if (!craft.made || craft.spent <= 0 || craft.have < 1) problems.push(`調合が成立しない（${JSON.stringify(craft)}）`);
  notes.push(`調合: 結晶のみ ${g1.length}種 / 固有素材要求 ${craft.needParts}種`);
}

/* 2h. 深部の圧力。烙印が深度で増え、その弾は走っても振り切れないこと。 */
{
  const seek = await page.evaluate(() => {
    const out = { counts: [], escaped: null, dodged: null };
    S.cls = 'warrior'; S.training = false; S.scene = 'dungeon'; S.paused = false;
    S.returnInvulnerable = false; S.p = newPlayer();
    for (const f of [40, 64, 100, 150]) {
      let t = 0; for (let r = 0; r < 3; r++) { _s = (f * 2654435761 + r * 7919) >>> 0; enterFloor(f); t += S.enemies.filter(e => e.k === 'brander').length; }
      out.counts.push({ f, n: +(t / 3).toFixed(1) });
    }
    /* 全力で逃げても距離を詰められること。命中そのもので判定すると、
       弾が壁に当たって消えた回で結果が揺れる。詰められるかどうかは地形に依らない。 */
    _s = 777; enterFloor(70); S.enemies.length = 0;
    S.p.hp = S.p.max; S.p.hurtT = 0; S.p.invulT = 0; S.p.d.agiD = 0;
    let closed = null;
    for (let attempt = 0; attempt < 24 && closed === null; attempt++) {
      const ang = attempt / 24 * Math.PI * 2;
      S.bullets.length = 0;
      const bx = S.p.x + Math.cos(ang) * 4, by = S.p.y + Math.sin(ang) * 4;
      if (!walk(bx, by, .3)) continue;
      const sx = S.p.x, sy = S.p.y;
      S.bullets.push({ x: bx, y: by, vx: (sx - bx) / 4 * 5, vy: (sy - by) / 4 * 5,
        dmg: 1, t: 0, r: .26, col: '#f0f', seek: 1, seekT: 6, life: 6.5 });
      const first = Math.hypot(bx - sx, by - sy);
      let last = first, moved = 0;
      for (let t = 0; t < 2 && S.bullets.length; t += .05) {
        const b = S.bullets[0], a = Math.atan2(S.p.y - b.y, S.p.x - b.x);
        const nx = S.p.x + Math.cos(a) * 3.5 * .05, ny = S.p.y + Math.sin(a) * 3.5 * .05;
        if (walk(nx, ny, S.p.r)) { S.p.x = nx; S.p.y = ny; moved++; }
        update(.05);
        if (S.bullets.length) last = Math.hypot(S.bullets[0].x - S.p.x, S.bullets[0].y - S.p.y);
      }
      // 逃げ切れた区間が十分あり、弾が生きていた回だけを採用する
      if (moved > 30 && S.bullets.length) closed = first - last;
      S.p.x = sx; S.p.y = sy;
    }
    out.closed = closed;
    out.escaped = !(closed > 0);
    // ただし素早さ（回避率）では避けられること
    S.p.d.agiD = 4000; S.floor = 1;
    let d = 0; for (let i = 0; i < 200; i++) { _s = i * 99991; S.p.hp = S.p.max; S.p.hurtT = 0; S.p.invulT = 0; const h = S.p.hp; hurtP(50, 't', true); if (S.p.hp === h) d++; }
    out.dodged = d / 200;
    return out;
  });
  const at = f => seek.counts.find(x => x.f === f).n;
  if (at(40) !== 0) problems.push(`烙印が深度40で出ている（${at(40)}体）`);
  if (at(64) < 1) problems.push('烙印が解放深度で出ていない');
  if (!(at(150) > at(64))) problems.push(`烙印が深度で増えていない（64F:${at(64)} → 150F:${at(150)}）`);
  if (seek.closed === null) problems.push('烙印の弾の追尾を測れる開けた場所が見つからない');
  else if (seek.escaped) problems.push(`烙印の弾を全力で逃げて振り切れてしまう（2秒で ${seek.closed.toFixed(2)} しか詰められない）`);
  if (seek.dodged < .2) problems.push(`素早さを上げても烙印の弾を回避できない（${(seek.dodged * 100).toFixed(0)}%）`);
  notes.push(`烙印: 64F ${at(64)}体 → 150F ${at(150)}体 / 全力逃走2秒でも ${seek.closed?.toFixed(2)} 距離を詰められる / 素早さでの回避 ${(seek.dodged * 100).toFixed(0)}%`);
}

/* 2i. 遠距離職の通常攻撃は狙いがずれても当たり、貫通する。 */
{
  const mage = await page.evaluate(() => ({
    aim: CLASSES.mage.aim, warriorAim: CLASSES.warrior.aim,
    pierce: CLASSES.mage.proj.pierce, kb: CLASSES.mage.proj.kb,
  }));
  if (!(mage.aim >= 1.0)) problems.push(`遠距離職の照準扇 ${mage.aim} が狭い`);
  if (!(mage.pierce >= 2)) problems.push('遠距離職の通常攻撃が貫通しない');
  if (!(mage.kb > .24)) problems.push('遠距離職の通常攻撃にノックバックが無い');
  notes.push(`魔術師: 照準扇 ${mage.aim}（戦士 ${mage.warriorAim}）/ 貫通 ${mage.pierce} / ノックバック ${mage.kb}`);
}

/* 2j. 伝説専用効果の重ねがけ。効果は伸びるが2.00倍を超えないこと。 */
{
  const pw = await page.evaluate(() => {
    const slots = ['weapon','helm','armor','glove','boot','ring','amulet'];
    S.cls = 'warrior'; S.formation = ['warrior:gai']; S.scene = 'dungeon'; S.paused = false; S.training = false;
    S.base = { lv: 60, xp: 0, pts: 0, str: 180, mag: 0, def: 60, agi: 60, spi: 0, luk: 0 };
    const curve = [0,1,2,3,4,7].map(n => +pwStack(n).toFixed(3));
    const build = (n, id) => { S.gear = Object.fromEntries(slots.map(s => [s, null]));
      slots.forEach((slot, i) => { let it; do it = makeItem(60,0,0,2); while (it.slot !== slot || (it.ac && it.ac !== 'warrior'));
        it.rar = i < n ? 4 : 2; it.pw = i < n ? id : null; it.lv = 1; it.element = 'neutral'; S.gear[slot] = it; });
      S.p = newPlayer(); return S.p.d; };
    build(3, 'berserk');
    const stacked = { n: pwCount(S.p.d, 'berserk'), mul: +pwMul('berserk').toFixed(3) };
    // 別々の効果は従来どおりそれぞれ等倍で全部乗る
    S.gear = Object.fromEntries(slots.map(s => [s, null]));
    const ids = ['burst','echo','vamp','haste','greed','berserk','chainL'];
    slots.forEach((slot, i) => { let it; do it = makeItem(60,0,0,2); while (it.slot !== slot || (it.ac && it.ac !== 'warrior'));
      it.rar = 4; it.pw = ids[i]; it.lv = 1; it.element = 'neutral'; S.gear[slot] = it; });
    S.p = newPlayer();
    const distinct = { count: S.p.d.pw.length, muls: S.p.d.pw.map(id => pwMul(id)) };
    return { curve, stacked, distinct };
  });
  if (pw.curve[1] !== 1) problems.push(`固有効果1個の倍率が1.00でない（${pw.curve[1]}）`);
  if (!(pw.curve[2] > pw.curve[1])) problems.push('固有効果を重ねても効果が上がらない');
  if (pw.curve[2] >= 2) problems.push(`固有効果2個で ${pw.curve[2]}倍。単純な2倍以上になっている`);
  if (pw.curve.some(v => v > 2)) problems.push(`固有効果の重ねがけが2.00倍を超える（${pw.curve.join('/')}）`);
  if (!(pw.curve[3] - pw.curve[2] < pw.curve[2] - pw.curve[1])) problems.push('重ねるほど伸びが小さくなっていない');
  if (pw.stacked.n !== 3) problems.push(`同じ効果3個が数えられていない（${pw.stacked.n}）`);
  if (pw.distinct.count !== 7) problems.push(`別々の固有効果7種が乗らない（${pw.distinct.count}）`);
  if (pw.distinct.muls.some(m => m !== 1)) problems.push('別々の固有効果に重ねがけ倍率がかかっている');
  notes.push(`固有効果の重ねがけ: ${pw.curve.slice(1).map((v,i)=>`${i+1}個${v.toFixed(2)}倍`).join(' / ')}`);
}

/* 2k. 編成中のキャラが一覧の先頭に来ること。 */
{
  const order = await page.evaluate(() => {
    S.unlockedCharacters = CHARACTERS.warrior.map(c => 'warrior:' + c.id);
    const last = CHARACTERS.warrior[CHARACTERS.warrior.length - 1];
    S.formation = ['warrior:' + last.id];
    S.cls = 'warrior'; openCharacterChoices('warrior');
    const names = [...document.querySelectorAll('#itC .card .nm')].map(x => x.textContent.trim());
    document.getElementById('itPop').classList.remove('on');
    return { first: names[0] || '', want: last.n };
  });
  if (!order.first.includes(order.want)) problems.push(`編成中のキャラが先頭に出ない（先頭 ${order.first} / 期待 ${order.want}）`);
  notes.push(`キャラ一覧の先頭: ${order.first}`);
}

/* 2l. 階層引き上げ（継承）。素材のうち最も浅い階層までしか上がらないこと。 */
{
  const inh = await page.evaluate(() => {
    S.cls = 'warrior'; S.formation = ['warrior:gai']; S.gear = {}; S.stash = [];
    S.base = { lv: 60, xp: 0, pts: 0, str: 180, mag: 0, def: 60, agi: 60, spi: 0, luk: 0 };
    S.paidInventory = { catalysts: [], feathers: [], slots: [], sigils: [{ id: 'x' }] };
    let fav; do fav = makeItem(30, 0, 0, 4); while (fav.rar !== 4 || fav.slot !== 'weapon');
    fav.ilvl = 30;
    const before = { score: Math.round(iScore(fav)), name: fav.name, pw: fav.pw, affs: fav.affs.map(a => a.id).join() };
    const mats = [];
    for (const d of [150, 180, 120]) { let x; do x = makeItem(d, 0, 0, 4); while (x.rar !== 4); x.ilvl = d; mats.push(x); S.stash.push(x); }
    // レア度が違う装備は素材にならないこと
    let wrong; do wrong = makeItem(200, 0, 0, 2); while (wrong.rar !== 2); wrong.ilvl = 200; S.stash.push(wrong);
    const cand = inheritCandidates(fav);
    const target = inheritTarget(fav, mats);
    const short = inheritTarget(fav, mats.slice(0, 2));
    const r = applyInherit(fav, target);
    return { candRar: [...new Set(cand.map(x => x.rar))], target, short,
      lowest: Math.min(...mats.map(m => m.ilvl)),
      before, after: { score: Math.round(iScore(fav)), name: fav.name, pw: fav.pw, affs: fav.affs.map(a => a.id).join(), ilvl: fav.ilvl } };
  });
  if (inh.candRar.length !== 1 || inh.candRar[0] !== 4) problems.push(`継承の素材候補に別レア度が混じる（${inh.candRar.join()}）`);
  if (inh.target !== inh.lowest) problems.push(`引き上げ先が最も浅い素材と違う（${inh.target} / 最浅 ${inh.lowest}）`);
  if (inh.short !== null) problems.push('素材が足りなくても引き上げ先が決まってしまう');
  if (inh.after.ilvl !== inh.target) problems.push('引き上げ後の深度が反映されていない');
  if (!(inh.after.score > inh.before.score)) problems.push('引き上げても強くならない');
  if (inh.after.name !== inh.before.name) problems.push('引き上げで名前が変わる');
  if (inh.after.pw !== inh.before.pw) problems.push('引き上げで固有効果が変わる');
  if (inh.after.affs !== inh.before.affs) problems.push('引き上げでオプション構成が変わる');
  notes.push(`継承: 深度${inh.before.score ? 30 : 30} → ${inh.target}（素材の最浅）/ 強さ ${inh.before.score} → ${inh.after.score} / 名前と固有効果は維持`);
}

/* 2m. 誰を編集中かが装備・技・能力のどれでも分かり、1タップで切り替わること。 */
{
  const bar = await page.evaluate(() => {
    S.unlockedCharacters = CHARACTERS.warrior.map(c => 'warrior:' + c.id).concat(CHARACTERS.mage.map(c => 'mage:' + c.id));
    S.formation = ['warrior:leon', 'mage:noa'];
    S.cls = 'warrior'; S.avatars.warrior = 'leon';
    const out = {};
    for (const sub of ['equip', 'skill', 'ability']) {
      S.tab = 'gear'; S.gearSub = sub; openTown();
      out[sub] = {
        chips: [...document.querySelectorAll('.charBar .charChip .nm')].map(x => x.textContent),
        note: (document.querySelector('.charBarNote') || {}).textContent || '',
      };
    }
    // チップを押すだけで切り替わること
    S.gearSub = 'skill'; openTown();
    const chips = [...document.querySelectorAll('.charBar .charChip')];
    const other = chips.find(c => !c.classList.contains('on'));
    if (other) other.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    return { ...out, switched: currentCharacter().n };
  });
  for (const sub of ['equip', 'skill', 'ability']) {
    if (!bar[sub].chips.length) problems.push(`${sub}タブにキャラ切替が出ていない`);
    if (!bar[sub].note.includes('編集中')) problems.push(`${sub}タブに編集中のキャラが出ていない`);
  }
  if (bar.switched !== 'ノア') problems.push(`チップのタップで切り替わらない（${bar.switched}）`);
  notes.push(`キャラ切替: ${bar.skill.chips.join('/')} — ${bar.skill.note.replace(/\s+/g, '')} → タップで ${bar.switched}`);
}

/* 2n. 所持品が拠点の倉庫とダンジョン内の両方で見えること。 */
{
  const hold = await page.evaluate(() => {
    S.consumables = { mend1: 5, edge2: 2 }; S.stock = { ashfang: 12, riftcore: 1 };
    S.mats = { crystal: { 3: 240 }, core: { 3: 5 } };
    S.tab = 'inv'; S.invSub = 'item'; openTown();
    const town = document.getElementById('townBody').textContent;
    S.scene = 'dungeon'; S.ptab = 'drops'; S.p = S.p || newPlayer(); S.bag = [];
    S.runPick = { crystal: 7, core: 1, parts: { ashfang: 3 }, pots: 0 };
    openPause();
    const dungeon = document.getElementById('pauseBody').textContent;
    document.getElementById('scPause').classList.remove('on'); S.paused = false;
    return { tabs: INV_TABS.map(t => t[1]), town, dungeon };
  });
  if (!hold.tabs.includes('道具')) problems.push('倉庫に道具タブが無い');
  for (const [where, text] of [['倉庫', hold.town], ['ダンジョン内', hold.dungeon]]) {
    for (const want of ['癒血の雫', '灰の牙', '結晶']) {
      if (!text.includes(want)) problems.push(`${where}の所持品に「${want}」が出ていない`);
    }
  }
  if (!hold.dungeon.includes('+3')) problems.push('ダンジョン内で今回拾った素材の数が出ていない');
  notes.push(`所持品: 倉庫タブ ${hold.tabs.join('/')} / ダンジョン内でも素材と道具を表示`);
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
