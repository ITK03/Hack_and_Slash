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

/* 2b2. 敵限定のハートが落ち、満タンでは残り、負傷時には即時回復すること */
{
  const heart = await page.evaluate(() => {
    S.training = false; S.floor = 20; S.drops = [];
    if (!S.p) S.p = newPlayer();
    let tries = 0;
    while (tries++ < 500 && !S.drops.some(d => d.heart)) {
      const e = spawnE('grunt', S.p.x, S.p.y, S.floor, false);
      killE(e);
    }
    const d = S.drops.find(x => x.heart); if (!d) return { dropped: false, tries };
    S.drops = [d]; d.x = S.p.x; d.y = S.p.y; d.t = 1;
    S.p.hp = S.p.max; update(1 / 60); const fullRemains = S.drops.includes(d);
    S.p.hp = S.p.max * .5; const before = S.p.hp; update(1 / 60);
    return { dropped: true, tries, fullRemains, before, after: S.p.hp, max: S.p.max,
      picked: !S.drops.includes(d), ratio: (S.p.hp - before) / S.p.max };
  });
  if (!heart.dropped) problems.push(`敵を${heart.tries}体倒してもハートが落ちない`);
  else {
    if (!heart.fullRemains) problems.push('満タン時にハートが消費される');
    if (!heart.picked || Math.abs(heart.ratio - .04) > 1e-9)
      problems.push(`ハートの即時回復が最大HPの4%でない（${JSON.stringify(heart)}）`);
  }
  notes.push(`ハート: ${heart.tries || 0}体で出現 / 満タン時に残る ${!!heart.fullRemains} / 回復率 ${heart.ratio == null ? '-' : (heart.ratio * 100).toFixed(1) + '%'}`);
}

/* 2b3. 戦士の剣線より内側は全周・半威力で、外側の扇と二重に当たらないこと */
{
  const melee = await page.evaluate(() => {
    selectCharacter('warrior', 'gai', () => {}); S.training = true; S.floor = 1; S.p = newPlayer();
    S.p.d.crit = 0; S.p.mCrit = 0; S.p.x = 20; S.p.y = 20;
    const hitAt = (dist, face) => {
      S.enemies = []; S.dmgLog = []; S.p.face = face; S.p.comboT = 0; S.p.comboStep = 0;
      const e = spawnE('grunt', S.p.x + dist, S.p.y, 1, false); e.hp = e.max = 10000;
      const hp = e.hp; basicAttack(); return { damage: hp - e.hp, hits: S.dmgLog.length };
    };
    const range = S.p.d.C.range * S.p.mRange * S.p.d.rng;
    const inner = Array.from({ length: 24 }, (_, i) => hitAt(0, i * TAU / 24));
    const innerBehind = hitAt(range * .2, Math.PI);
    const outer = hitAt(range * .8, 0);
    return { inner, innerBehind, outer };
  });
  if (melee.inner.some(x => x.damage <= 0)) problems.push('密着した敵に当たらない向きがある');
  if (Math.abs(melee.innerBehind.damage * 2 - melee.outer.damage) > 1e-9)
    problems.push(`内側補完のダメージが外側の半分でない（内${melee.innerBehind.damage} / 外${melee.outer.damage}）`);
  if (melee.inner.some(x => x.hits !== 1) || melee.innerBehind.hits !== 1 || melee.outer.hits !== 1)
    problems.push(`通常攻撃が二重に当たる（密着${melee.inner.map(x => x.hits).join('/')} / 内${melee.innerBehind.hits} / 外${melee.outer.hits}）`);
  notes.push(`戦士密着24方向: ${melee.inner.map(x => x.damage).join('/')} / 内側補完 ${melee.innerBehind.damage} / 外側 ${melee.outer.damage} / 各1ヒット`);
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
    // ただし装備の回避率では避けられること
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

/* 2m. 4区画を一体化した100px以下のヘッダーでキャラと区画を切り替えられること。 */
{
  const bar = await page.evaluate(() => {
    S.unlockedCharacters = CHARACTERS.warrior.map(c => 'warrior:' + c.id).concat(CHARACTERS.mage.map(c => 'mage:' + c.id));
    S.formation = ['warrior:leon', 'mage:noa'];
    S.cls = 'warrior'; S.avatars.warrior = 'leon';
    const out = {};
    for (const sub of ['equip', 'skill', 'ability', 'break']) {
      S.tab = 'gear'; S.gearSub = sub; openTown();
      const card = document.querySelector('.gearHead');
      out[sub] = {
        framed: !!card && getComputedStyle(card).borderLeftWidth !== '0px',
        name: card ? card.querySelector('.gearIdentity').textContent : '',
        height: card ? card.getBoundingClientRect().height : 999,
        tabs: card ? card.querySelectorAll('.innerTabs .btn').length : 0,
        hero: !!(card && card.querySelector('.gearHero')),
      };
    }
    /* キャラの切り替えは、横並びのチップではなく左上のアイコンから開く一覧に変わった。
       アイコンを押して一覧が出ること、そこから別のキャラへ移れることを見る。 */
    S.gearSub = 'equip'; openTown();
    const hero = document.querySelector('.gearHead .gearHero');
    out.heroTappable = !!hero;
    if (hero) hero.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    out.pickerOpened = document.getElementById('itPop').classList.contains('on');
    const other = [...document.querySelectorAll('#itC .card.tap, #itC .member, #itC .allyCard')]
      .find(e => /ノア/.test(e.textContent));
    if (other) other.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    out.switched = currentCharacter().n;
    return out;
  });
  for (const sub of ['equip', 'skill', 'ability', 'break']) {
    const b = bar[sub];
    if (!b.framed) problems.push(`${sub}タブの編集中の枠が付いていない`);
    if (!b.name) problems.push(`${sub}タブに編集中のキャラ名が出ていない`);
    if (!/Lv\d/.test(b.name) || !/戦闘力/.test(b.name)) problems.push(`${sub}タブにLvと戦闘力が出ていない（${b.name}）`);
    if (!b.hero || b.tabs !== 4 || b.height > 100) problems.push(`${sub}タブの統合ヘッダーが要件外（${b.height}px / ${b.tabs}区画）`);
  }
  if (!bar.heroTappable) problems.push('左上のキャラクターアイコンが無い');
  if (!bar.pickerOpened) problems.push('キャラクターアイコンを押しても一覧が開かない');
  notes.push(`統合ヘッダー: ${bar.equip.height}px / ${bar.equip.tabs}区画 — ${bar.equip.name.replace(/\s+/g, ' ').trim()}`);
  notes.push(`  アイコンを押して一覧 → 選択後 ${bar.switched}`);
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
  if (hold.tabs.includes('分解')) problems.push('分解が単独タブのまま（装備区画へ統合したはず）');
  for (const [where, text] of [['倉庫', hold.town], ['ダンジョン内', hold.dungeon]]) {
    for (const want of ['癒血の雫', '灰の牙', '結晶']) {
      if (!text.includes(want)) problems.push(`${where}の所持品に「${want}」が出ていない`);
    }
  }
  if (!hold.dungeon.includes('+3')) problems.push('ダンジョン内で今回拾った素材の数が出ていない');
  notes.push(`所持品: 倉庫タブ ${hold.tabs.join('/')} / ダンジョン内でも素材と道具を表示`);
}

/* 2o. 押せる要素の大きさ。指の腹に足りない当たり判定を作らない。 */
{
  const tapSizes = await page.evaluate(() => {
    const vis = el => { const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.top < innerHeight && r.bottom > 0; };
    /* 押せるものだけを測る。tapEl / repeatBtn が data-tap を残すので、
       class 名から当てにいかずに済む（飾りの枠を押せると誤認していた）。 */
    /* 当たり判定は見た目の枠とは限らない。小さな印は透明な疑似要素で
       44pxまで広げてあるので、枠と疑似要素の大きい方で測る。 */
    const hit = el => {
      const r = el.getBoundingClientRect();
      let w = r.width, h = r.height;
      for (const pseudo of ['::before', '::after']) {
        const st = getComputedStyle(el, pseudo);
        if (!st || st.content === 'none' || st.position !== 'absolute') continue;
        w = Math.max(w, parseFloat(st.width) || 0, parseFloat(st.minWidth) || 0);
        h = Math.max(h, parseFloat(st.height) || 0, parseFloat(st.minHeight) || 0);
      }
      return Math.round(Math.min(w, h));
    };
    const scan = () => [...document.querySelectorAll('#scTown [data-tap],#scTown .tab')].filter(vis)
      .map(e => ({ min: hit(e), t: (e.textContent || '').trim().slice(0, 12) }));
    const out = {};
    for (const [tab, sub] of [['prep', null], ['gear', 'equip'], ['gear', 'skill'], ['gear', 'ability'], ['inv', 'gear'], ['shop', null]]) {
      S.tab = tab; if (sub) S.gearSub = sub;
      if (tab === 'inv') S.invSub = 'gear';
      openTown();
      const tooSmall = scan().filter(x => x.min < 44);
      out[tab + (sub ? ':' + sub : '')] = tooSmall;
    }
    return out;
  });
  const bad = Object.entries(tapSizes).filter(([, v]) => v.length);
  if (bad.length) problems.push(`44px未満の操作がある: ${bad.map(([k, v]) => `${k}(${v.map(x => x.t + ':' + x.min).join(',')})`).join(' / ')}`);
  notes.push(`タップ領域: 全${Object.keys(tapSizes).length}画面で44px以上`);
}

/* 2p2. 戦闘中の画面まわり。
   - 上のHPバーと二重だった技の近くのHPバーが無いこと
   - 拾った物の行が戦闘中に出ず、一時停止の「戦利品」には出ること
   - 道具の丸が真円で、操作切替が列のいちばん下にあり、空き枠も出ていること
   - 地図は入った部屋から埋まり、押すと大きくなること
   - 行き先の矢印は伏せてあること（CFG.GUIDE_ARROWS で戻せる） */
{
  const hud = await page.evaluate(() => {
    S.loadout = ['mend1', null, null, null];
    beginRun(20); S.paused = false;
    for (let i = 0; i < 30; i++) update(1 / 60);
    const out = {};
    out.pill = !!document.getElementById('hpPill');
    out.loot = !!document.getElementById('loot');
    out.arrows = getComputedStyle(document.getElementById('mmGuide')).display;
    /* 右端の列。下から: 切替 → 道具4枠 */
    const rail = [...document.querySelectorAll('#railR > *')]
      .map(e => { const r = e.getBoundingClientRect();
        return { id: e.id, w: Math.round(r.width), h: Math.round(r.height), bottom: Math.round(r.bottom) }; });
    out.rail = rail;
    out.railRound = rail.filter(x => x.w !== x.h);
    out.autoLowest = rail.length > 1 && rail.find(x => x.id === 'autoBtn')
      && rail.every(x => x.id === 'autoBtn' || x.bottom < rail.find(y => y.id === 'autoBtn').bottom);
    out.slots = rail.filter(x => x.id !== 'autoBtn').length;
    /* 地図。最初は自分のいる部屋だけ。別の部屋の真ん中はまだ出ていないこと */
    let lit = 0; for (let i = 0; i < MW * MH; i++) if (seen[i]) lit++;
    out.seenAtStart = lit;
    out.floorTiles = (() => { let n = 0; for (let i = 0; i < MW * MH; i++) if (map[i]) n++; return n; })();
    out.roomsSeen = rooms.filter(r => r.seen).length;
    out.roomsTotal = rooms.length;
    /* 未踏の部屋へ運ぶと、その部屋が丸ごと出ること */
    const far = rooms.find(r => !r.seen);
    if (far) { S.p.x = far.cx; S.p.y = far.cy; update(1 / 60); }
    out.roomsSeenAfter = rooms.filter(r => r.seen).length;
    let lit2 = 0; for (let i = 0; i < MW * MH; i++) if (seen[i]) lit2++;
    out.seenAfter = lit2;
    /* 地図を押すと大きくなり、もう一度押すと戻ること。時間は止まらないこと */
    const small = document.getElementById('mm').getBoundingClientRect().width;
    toggleMap();
    const big = document.getElementById('mm').getBoundingClientRect().width;
    out.pausedWhileBig = S.paused;
    toggleMap();
    out.small = Math.round(small); out.big = Math.round(big);
    out.backToSmall = Math.round(document.getElementById('mm').getBoundingClientRect().width);
    return out;
  });
  if (hud.pill) problems.push('技の近くのHPバーがまだある');
  if (hud.loot) problems.push('戦闘中の取得アイテムの行がまだある');
  if (hud.arrows !== 'none') problems.push('行き先の矢印が出たまま');
  if (hud.railRound.length) problems.push(`道具の丸が真円でない: ${hud.railRound.map(x => `${x.id || '道具'} ${x.w}x${x.h}`).join(',')}`);
  if (!hud.autoLowest) problems.push('操作切替が列のいちばん下にない');
  if (hud.slots !== 4) problems.push(`道具の枠が4つでない（${hud.slots}）— 空き枠も出すこと`);
  if (!(hud.roomsSeen >= 1 && hud.roomsSeen < hud.roomsTotal)) problems.push(`開始時に見えている部屋が ${hud.roomsSeen}/${hud.roomsTotal}`);
  if (!(hud.seenAtStart < hud.floorTiles * .5)) problems.push(`開始時に床の ${Math.round(hud.seenAtStart / hud.floorTiles * 100)}% が見えている`);
  if (!(hud.roomsSeenAfter > hud.roomsSeen)) problems.push('部屋へ入っても地図に出ない');
  if (!(hud.big > hud.small * 3)) problems.push(`地図を押しても大きくならない（${hud.small}→${hud.big}）`);
  if (hud.pausedWhileBig) problems.push('地図を開くと時間が止まる');
  if (hud.backToSmall !== hud.small) problems.push('地図をもう一度押しても戻らない');
  notes.push(`戦闘画面: HPバー二重なし / 取得行なし / 矢印なし / 道具${hud.slots}枠+切替が最下段・真円${hud.rail[0].w}px`);
  notes.push(`  地図: 開始 ${hud.roomsSeen}/${hud.roomsTotal}部屋（床の${Math.round(hud.seenAtStart / hud.floorTiles * 100)}%）→ 入室で ${hud.roomsSeenAfter}部屋 / 押すと ${hud.small}→${hud.big}px`);
}

/* 2p4. 属性がアイコンだけで見分けられること。
   装備には属性が付いているのに、画面のどこにも形として出ていなかった。
   詳細は等級/部位/深度しか出さず、装備枠は絵を属性色で塗るだけで、
   色は等級の枠色・強化値の水色と混ざって読めなかった。 */
{
  const el = await page.evaluate(() => {
    const keys = ['fire', 'water', 'wood', 'light', 'dark', 'neutral'];
    /* 6属性が別々の輪郭を持つこと。色を落としても見分けられるのが要件なので、
       同じパスを色違いで使い回していないかを見る。 */
    const paths = keys.map(k => ICONP['el_' + k] || '');
    const out = { missing: keys.filter((k, i) => !paths[i]), dup: paths.length - new Set(paths).size };
    /* 実画面に出ていること。装備枠・倉庫の格子・装備の詳細の3か所。 */
    S.tutorial = { phase: 'done', gearIndex: 0 }; S.deepest = 60; S.base.lv = 60;
    S.stash = []; S.gear = emptyGear(); _s = 4242;
    SLOTK.forEach((k, i) => { let it, n = 0; do it = makeItem(40, 0, 0, 2); while (++n < 900 && it.slot !== k); if (it.slot === k) { it.element = keys[i % 5]; S.gear[k] = it; } });
    for (let i = 0; i < 6; i++) S.stash.push(makeItem(40, .5, 0, 2));
    for (const p of document.querySelectorAll('.pop')) p.classList.remove('on');
    S.tab = 'gear'; S.scene = 'town'; openTown();
    out.slotIcons = document.querySelectorAll('#scTown .slot .slotTop .elIc').length;
    out.resoIcons = document.querySelectorAll('#scTown .gearStatsHead .reso .elIc').length;
    S.tab = 'inv'; S.inv.tab = 'gear'; openTown();
    out.cellIcons = document.querySelectorAll('#scTown .cell .cellBtm .elIc').length;
    out.cells = document.querySelectorAll('#scTown .cell').length;
    showItem(S.stash[0], false);
    out.detailIcon = document.querySelectorAll('#itC .elItemLine .elIc').length;
    /* 説明が開き、倍率を本体から取っていること（写した数字だと本体を変えても古いまま） */
    openElementHelp(openTown);
    out.helpText = document.getElementById('itC').textContent;
    out.helpOpen = document.getElementById('itPop').classList.contains('on');
    out.helpIcons = document.querySelectorAll('#itC .elGuide .elIc').length;
    /* 説明の倍率は本体から取っていること。表示は「×1.95」ではなく「+95%」。
       区切りも 3/5/7 から 4/6/7 に変わったので、振り切った7個で照合する。 */
    const r7 = resonanceStageInfo(7);
    out.helpWant = `+${Math.round((r7.advantage - 1) * 100)}%`;
    out.helpShowsReal = out.helpText.includes(out.helpWant);
    document.getElementById('itPop').classList.remove('on');
    /* 潜ったら「この階層で自分は有利か」が出ること */
    SLOTK.forEach(k => { if (S.gear[k]) S.gear[k].element = 'fire'; });
    beginRun(31); S.paused = false; updHUD();
    out.floorHud = document.getElementById('floorElement').textContent;
    out.floorHudIcon = document.querySelectorAll('#floorElement .elIc').length;
    /* 幅が足りずに省略記号で消えていないこと */
    const meta = document.querySelector('#meta>div:first-child');
    out.metaClipped = meta.scrollWidth > meta.clientWidth + 1;
    endRun(true); S.scene = 'town'; openTown();
    return out;
  });
  if (el.missing.length) problems.push(`属性アイコンが無い: ${el.missing.join(',')}`);
  if (el.dup) problems.push(`属性アイコンの輪郭が${el.dup}組かぶっている（色でしか見分けられない）`);
  if (el.slotIcons !== 7) problems.push(`装備枠7つのうち属性アイコンが出ているのは${el.slotIcons}枠`);
  if (el.resoIcons !== 7) problems.push(`共鳴の行に7部位ぶんの属性が並んでいない（${el.resoIcons}個）`);
  if (el.cellIcons !== el.cells) problems.push(`倉庫の格子${el.cells}件のうち属性アイコンは${el.cellIcons}件`);
  if (!el.detailIcon) problems.push('装備の詳細に属性が出ていない');
  if (!el.helpOpen || el.helpIcons < 6) problems.push(`属性の説明が開かない、または属性が出ていない（${el.helpIcons}個）`);
  if (!el.helpShowsReal) problems.push(`属性の説明の倍率が本体の resonance() と一致しない（${el.helpWant} が出ていない。数字を写している）`);
  if (/×[0-9]+\.[0-9]/.test(el.helpText)) problems.push(`属性の説明に「×1.95」形式が残っている（+95% 表記に統一する）`);
  if (!el.floorHudIcon) problems.push('潜行中の深度表示に階層の属性アイコンが無い');
  if (!el.floorHud.includes('有利')) problems.push(`火でそろえて木優勢の31階へ入ったのに「有利」が出ない（${el.floorHud}）`);
  if (el.metaClipped) problems.push('潜行中の深度の行が幅に収まらず省略記号で切れている');
  notes.push(`属性: 6種とも別の輪郭 / 装備枠${el.slotIcons} 共鳴の行${el.resoIcons} 倉庫${el.cellIcons}/${el.cells} 詳細${el.detailIcon} 説明${el.helpIcons}`);
  notes.push(`  潜行中の深度表示 属性アイコン${el.floorHudIcon}個＋「${el.floorHud.trim()}」（火でそろえて木優勢の31階）`);
}

/* 2p6. 潜行中に見えなければならないもの。
   伝説を拾っても戦利品一覧が空白のままだった（.c4 は虹色を出すために
   color:transparent にしており、自前の背景を持つ行に付くと
   グラデーションだけ上書きされて透明な文字が残る）。
   継続回復も、効いているのか残り何秒なのかが画面のどこにも出ていなかった。 */
{
  const run = await page.evaluate(() => {
    const out = {};
    for (const p of document.querySelectorAll('.pop')) p.classList.remove('on');
    S.tutorial = { phase: 'done', gearIndex: 0 }; S.deepest = 60;
    beginRun(40); S.paused = false;
    S.bag.length = 0; S.drops.length = 0;
    /* 5等級ぶんを実際にドロップさせ、実際に拾わせる */
    for (let rar = 0; rar < 5; rar++) {
      let it, n = 0; do it = makeItem(40, 0, 0, rar); while (++n < 900 && it.rar !== rar);
      S.drops.push({ it, x: S.p.x, y: S.p.y, t: 9, vx: 0, vy: 0 });
    }
    for (let i = 0; i < 40; i++) update(.05);
    out.picked = S.bag.map(x => x.rar).sort().join(',');
    S.ptab = 'drops'; openPause();
    const alpha = c => { const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return 1; const p = m[1].split(','); return p.length > 3 ? parseFloat(p[3]) : 1; };
    out.rows = [...document.querySelectorAll('#scPause .bagRow')].map(el => {
      const sp = el.querySelector('span');
      return { cls: el.className.replace('bagRow ', ''), text: (el.textContent || '').trim(),
        a: alpha(getComputedStyle(el).color), sa: sp ? alpha(getComputedStyle(sp).color) : 1 };
    });
    /* 装備候補の右下の深度も同じ理由で消えていた */
    S.stash = []; for (let rar = 0; rar < 5; rar++) { let it, n = 0; do it = makeItem(40, 0, 0, rar); while (++n < 900 && (it.rar !== rar || it.slot !== 'helm')); if (it.rar === rar && it.slot === 'helm') S.stash.push(it); }
    document.getElementById('scPause').classList.remove('on'); S.paused = false; S.scene = 'town'; S.tab = 'gear'; S.gearSlot = 'helm'; S.gearCompareChoice = null; openTown();
    out.cands = [...document.querySelectorAll('#scTown .gearCandidate')].map(el => {
      const sm = el.querySelector('small');
      return { cls: el.className.replace('gearCandidate ', ''), a: sm ? alpha(getComputedStyle(sm).color) : 1 };
    });
    /* 継続回復は残り時間が出ること */
    S.scene = 'dungeon'; beginRun(40); S.paused = false;
    const hotKey = CONSUMABLE_KEYS.find(k => CONSUMABLES[k].hot);
    out.hotKey = hotKey || null;
    if (hotKey) {
      S.p.hp = S.p.max * .3; S.consumables[hotKey] = 5; S.loadout = [hotKey, null, null, null]; S.runItems = [5, 0, 0, 0];
      out.used = useItem(0); update(.05); updBuffs();
      out.buffs = [...document.querySelectorAll('#buffs .buff')].map(e => e.textContent.trim());
      out.hotT = +S.p.hotT.toFixed(2);
    }
    /* 危険度の表示が残っていないこと */
    updHUD(); out.depthLine = (document.querySelector('#meta>div:first-child') || {}).textContent || '';
    out.hasDanger = typeof dangerOf !== 'undefined';
    endRun(true); S.scene = 'town';
    return out;
  });
  if (run.picked !== '0,1,2,3,4') problems.push(`拾った装備が5等級そろわない（${run.picked}）`);
  const invisible = run.rows.filter(r => r.a === 0 || r.sa === 0 || !r.text);
  if (invisible.length) problems.push(`潜行中の戦利品一覧で文字が見えない行がある: ${invisible.map(r => r.cls).join(' / ')}`);
  const candInvisible = run.cands.filter(r => r.a === 0);
  if (candInvisible.length) problems.push(`装備候補の深度が見えない: ${candInvisible.map(r => r.cls).join(' / ')}`);
  if (!run.hotKey) problems.push('継続回復の道具が存在しない');
  else if (!run.buffs.some(t => /継続回復/.test(t) && /\d+s/.test(t))) problems.push(`継続回復を使っても残り時間が出ない（${JSON.stringify(run.buffs)}）`);
  if (/余裕|適正|危険|高危険|致命的/.test(run.depthLine)) problems.push(`潜行中の深度表示に危険度が残っている（${run.depthLine.trim()}）`);
  if (run.hasDanger) problems.push('dangerOf が残っている（危険度の表示は消した）');
  notes.push(`潜行中の戦利品: ${run.rows.map(r => r.cls + (r.a ? '' : '(透明)')).join(' ')} / 装備候補 ${run.cands.length}件`);
  notes.push(`  継続回復: ${JSON.stringify(run.buffs)} 残り${run.hotT}s / 深度表示「${run.depthLine.trim()}」`);
}

/* 2p5. 拠点まわりの作業性。倉庫のタブ固定・開始階層の刻み・ミッションの名前・
   はじめての支援が「押した瞬間に中盤の強さ」にならないこと。 */
{
  const town = await page.evaluate(async () => {
    const out = {};
    for (const p of document.querySelectorAll('.pop')) p.classList.remove('on');
    S.tutorial = { phase: 'done', gearIndex: 0 }; S.deepest = 137; S.base.lv = 12;
    S.admin = false; S.debug = false;
    /* 倉庫のタブ（装備/道具/素材/調合）は、下へスクロールしても上に残ること。 */
    S.stash = []; for (let i = 0; i < 60; i++) S.stash.push(makeItem(30, .5, 0, i % 5));
    S.tab = 'inv'; S.invSub = 'gear'; openTown();
    const body = document.querySelector('#scTown>.sbody'), tabs = body.querySelector(':scope>.innerTabs');
    out.tabsFound = !!tabs;
    if (tabs) {
      const top0 = tabs.getBoundingClientRect().top;
      body.scrollTop = 400; await new Promise(r => requestAnimationFrame(r));
      out.scrolled = body.scrollTop;
      out.tabDrift = Math.round(top0 - tabs.getBoundingClientRect().top);
      body.scrollTop = 0;
    }
    /* 開始階層は 1+5n だけ。管理者でも出撃バーからは刻みを外せないこと。 */
    const snap = v => { setDiveFloor(v); return S.diveFloor; };
    out.snapPlain = [1, 2, 5, 6, 23, 100].map(snap);
    S.admin = true; out.snapAdmin = [23, 44].map(snap);
    /* 管理者パネルの1階層単位テストだけは刻みを外せること */
    S.formation = ['warrior:gai']; confirmDive(23, true); out.exactAdmin = S.diveFloor;
    document.getElementById('askPop').classList.remove('on');
    S.admin = false; confirmDive(23); out.confirmPlain = S.diveFloor;
    document.getElementById('askPop').classList.remove('on');
    /* 拠点のミッションのボタンは名前だけ。中身の目次を並べない。 */
    S.tab = 'prep'; openTown();
    const mission = [...document.querySelectorAll('#scTown .fold,#scTown .card,#scTown [data-tap]')]
      .find(e => (e.textContent || '').startsWith('ミッション'));
    out.missionLabel = mission ? mission.textContent.replace(/\s+/g, ' ').trim() : null;
    /* はじめての支援。レベルは上がらず、深度1の最低等級が7部位。 */
    S.beginnerClaimed = false; S.stash = []; const lvBefore = S.base.lv;
    claimBeginnerMission();
    out.gift = { lvBefore, lvAfter: S.base.lv, n: S.stash.length,
      maxIlvl: Math.max(0, ...S.stash.map(x => x.ilvl)), maxRar: Math.max(0, ...S.stash.map(x => x.rar)),
      slots: new Set(S.stash.map(x => x.slot)).size };
    return out;
  });
  if (!town.tabsFound) problems.push('倉庫のタブが .sbody の直下に無い（固定できない）');
  else if (town.tabDrift > 1) problems.push(`倉庫のタブが中身と一緒に流れる（${town.scrolled}px スクロールで ${town.tabDrift}px 動いた）`);
  if (town.snapPlain.join(',') !== '1,1,1,6,21,96') problems.push(`開始階層が1+5nに切り下がらない（${town.snapPlain.join(',')}）`);
  if (town.snapAdmin.join(',') !== '21,41') problems.push(`管理者だと出撃バーから1階層単位で潜れる（${town.snapAdmin.join(',')}）`);
  if (town.exactAdmin !== 23) problems.push(`管理者パネルの1階層単位テストまで刻まれている（${town.exactAdmin}）`);
  if (town.confirmPlain !== 21) problems.push(`潜る確認で刻みが外れる（${town.confirmPlain}）`);
  /* 名前は「ミッション」。受取可能の件数は他の折りたたみ（プレイ記録 最深60F）と
     同じ形の状態表示なので残す。消したかったのは中身の目次のほう。 */
  if (!town.missionLabel || !town.missionLabel.startsWith('ミッション')) problems.push(`拠点のミッションのボタンが見つからない（「${town.missionLabel}」）`);
  if (/デイリー|恒常|到達報酬/.test(town.missionLabel || '')) problems.push(`拠点のミッションのボタン名に中身の目次が並んでいる（「${town.missionLabel}」）`);
  const g = town.gift;
  if (g.lvAfter !== g.lvBefore) problems.push(`はじめての支援でレベルが上がる（${g.lvBefore}→${g.lvAfter}）`);
  if (g.n !== 7 || g.slots !== 7) problems.push(`はじめての支援が7部位ぶんでない（${g.n}個 / ${g.slots}部位）`);
  if (g.maxIlvl !== 1) problems.push(`はじめての支援の装備が深度1でない（最大${g.maxIlvl}）`);
  if (g.maxRar !== 0) problems.push(`はじめての支援の装備が最低等級でない（最大レア${g.maxRar}）`);
  notes.push(`拠点: 倉庫タブ固定(${town.scrolled}pxで${town.tabDrift}px) / 階層 ${town.snapPlain.join(',')}（管理者も${town.snapAdmin.join(',')}・専用入力だけ${town.exactAdmin}） / ボタン名「${town.missionLabel}」`);
  notes.push(`  はじめての支援: Lv${g.lvBefore}→${g.lvAfter} / 深度${g.maxIlvl}・レア${g.maxRar} を${g.n}部位`);
}

/* 2p3. 操作を任せるほど与ダメージが下がること。手動 ＞ 片手 ＞ オート。
   切替は3つを必ず一巡すること（最深で潜っている間もオートに手が届く）。 */
{
  const modes = await page.evaluate(() => {
    beginRun(20); S.paused = false;
    const hit = mode => {
      S.settings.controlMode = mode;
      const e = { x: S.p.x + 1, y: S.p.y, hp: 1e9, max: 1e9, r: .4, res: {}, element: 'neutral' };
      const before = e.hp; hurtE(e, 1000, false, 0, 0, true);
      return Math.round(before - e.hp);
    };
    const dmg = { manual: hit('manual'), onehand: hit('onehand'), auto: hit('auto') };
    /* 未到達の深度でも、押していけばオートまで回ること */
    S.floor = S.deepest = 20; S.settings.controlMode = 'manual';
    const cycle = []; for (let i = 0; i < 3; i++) { cycleControlMode(); cycle.push(S.settings.controlMode); }
    return { dmg, cycle, cfg: { one: CFG.ONEHAND_DMG, auto: CFG.AUTO_DMG } };
  });
  const d = modes.dmg;
  const r1 = d.onehand / d.manual, r2 = d.auto / d.manual;
  const near = (got, want) => Math.abs(got - want) < .02;
  if (!near(r1, modes.cfg.one)) problems.push(`片手の与ダメージが手動の ${(r1 * 100).toFixed(0)}%（${Math.round(modes.cfg.one * 100)}%のはず）`);
  if (!near(r2, modes.cfg.auto)) problems.push(`オートの与ダメージが手動の ${(r2 * 100).toFixed(0)}%（${Math.round(modes.cfg.auto * 100)}%のはず）`);
  if (!(d.manual > d.onehand && d.onehand > d.auto)) problems.push(`手動 ＞ 片手 ＞ オート になっていない（${d.manual}/${d.onehand}/${d.auto}）`);
  if (modes.cycle.join() !== 'onehand,auto,manual') problems.push(`切替が3つを一巡しない（${modes.cycle.join(' → ')}）`);
  notes.push(`与ダメージ: 手動${d.manual} / 片手${d.onehand}（${(r1 * 100).toFixed(0)}%）/ オート${d.auto}（${(r2 * 100).toFixed(0)}%）— 切替 手動→${modes.cycle.join('→')}`);
}

/* 2m2. 全滅と「ここで力尽きる」で必ず拠点へ戻れること。
   PR#40 の「死んでもフロアを再生成せず同じ場所から再開」が、次の番手がいない
   全滅の場合にも効いてしまい、最後の1人が倒れてもHP55%で復活を繰り返して
   ダンジョンから永久に出られなくなっていた。「ここで力尽きる」も
   partyIndex を末尾へ送って同じ経路を通るため、同様に出られなかった。
   さらにこの不具合は計測も壊していた（ボットが死なないので死亡率が低く出て、
   50%死亡深度が 45 相当から 107 まで跳ね上がっていた）。 */
{
  const wipe = await page.evaluate(() => {
    const out = {};
    const setup = n => {
      S.unlockedCharacters = allRoster().map(x => x.k + ':' + x.ch.id);
      S.formation = ['warrior:leon', 'warrior:gai'].slice(0, n);
      S.cls = 'warrior'; S.avatars.warrior = 'leon'; S.base.lv = 30;
      beginRun(12); S.paused = false; S.partyIndex = 0;
    };
    /* 次の番手がいるうちは、同じフロアで交代して続くこと（PR#40 の狙い） */
    setup(2); S.p.hp = 0;
    /* 交代した次の番手が「倒れた場所」から始まること。
       selectCharacter が交代の途中で S.p を作り直すので、控えておかないと
       地図の隅(0,0)＝壁の中から再開してしまう。 */
    const fell = { x: S.p.x, y: S.p.y };
    endRun(false, 'テスト');
    out.swap = { scene: S.scene, who: currentCharacter().n, idx: S.partyIndex,
      ずれ: +Math.hypot(S.p.x - fell.x, S.p.y - fell.y).toFixed(2) };
    /* 最後の1人が倒れたら全滅。死亡画面が出て、戻ると拠点へ行けること */
    S.p.hp = 0; endRun(false, 'テスト');
    out.wipeShown = document.getElementById('scEnd').classList.contains('on');
    out.wipeTitle = document.getElementById('endT').textContent;
    leaveEnd(); out.wipeScene = S.scene;
    /* 「ここで力尽きる」も同じく拠点へ戻れること */
    setup(2); S.partyIndex = S.formation.length; endRun(false, '探索を断念した');
    out.giveShown = document.getElementById('scEnd').classList.contains('on');
    leaveEnd(); out.giveScene = S.scene;
    return out;
  });
  if (wipe.swap.scene !== 'dungeon' || wipe.swap.idx !== 1) problems.push(`次の番手がいるのに潜行が続かない（${JSON.stringify(wipe.swap)}）`);
  if (wipe.swap.ずれ > .01) problems.push(`交代した番手が倒れた場所から始まらない（${wipe.swap.ずれ}マスずれた）`);
  if (!wipe.wipeShown) problems.push('全滅しても死亡画面が出ない（同じ場所で復活を繰り返している）');
  if (wipe.wipeScene !== 'town') problems.push(`全滅から拠点へ戻れない（${wipe.wipeScene}）`);
  if (!wipe.giveShown) problems.push('「ここで力尽きる」で死亡画面が出ない');
  if (wipe.giveScene !== 'town') problems.push(`「ここで力尽きる」で拠点へ戻れない（${wipe.giveScene}）`);
  notes.push(`全滅の始末: 交代(${wipe.swap.who}) → 全滅で「${wipe.wipeTitle}」 → 拠点 / 力尽きる → 拠点`);
}

/* 2p3b. 装備の深度差。階層に見合わない装備では通らないこと。
   実測で「Lv60・深度20の拾い物・3段目の道具」が50階のボスに92%勝てていた。
   レベルと消耗品だけで勝ててしまい、装備で潜るゲームになっていなかった。 */
{
  const gap = await page.evaluate(() => {
    const mk = (floor, depth) => {
      const gear = {}; for (const k of SLOTK) gear[k] = depth == null ? null : { ilvl: depth };
      return { reach: +gearReach(floor, gear).toFixed(2), out: +gearOutMul(floor, gear).toFixed(2), fit: gearFitText(floor, gear).n };
    };
    return {
      同深度: mk(50, 50), やや下: mk(50, 45), 半分: mk(50, 25), 大幅下: mk(50, 20), 素手: mk(50, null),
      深すぎ: mk(50, 90),                       // 過剰装備でも1.0止まり
      序盤: mk(5, 1),                            // GEAR_GAP_FREE 以下は見ない
      /* 実際にボスと戦って、深度20の装備では勝てないこと */
      boss: (() => {
        S.cls = 'warrior'; S.formation = ['warrior:gai']; S.deepest = 999;
        const slots = SLOTK;
        /* 「時間をかけて慎重にやれば勝てる」を模した、これ以上ない甘い条件。
           被弾を完全に無視して（returnInvulnerable）5分間ひたすら殴り続ける。
           それでも倒せないなら、腕でも粘りでも埋められない差だと言える。
           注意: HPを毎フレーム満タンに戻すやり方では駄目だった。1回の update の
           中で殺され endRun が S.paused を立てるので、残りの時間が丸ごと空回りし、
           「回復に阻まれた」と「死んだ」を取り違える。 */
        const fight = depth => {
          S.base = { lv: 60, xp: 0, pts: 0, str: 180, mag: 0, def: 60, agi: 60, spi: 0, luk: 0, xpCurveV2: true };
          S.gear = Object.fromEntries(slots.map(k => [k, null]));
          for (const k of slots) { let it, n = 0; do it = makeItem(depth, 0, 0, 2); while (++n < 900 && (it.slot !== k || (it.ac && it.ac !== 'warrior') || (it.wt && WCLS[it.wt] !== 'warrior'))); if (it.slot === k) S.gear[k] = it; }
          S.p = newPlayer(); S.scene = 'dungeon'; S.paused = false; S.training = false; S.returnInvulnerable = true;
          enterFloor(50);
          const boss = S.enemies.find(e => e.boss); if (!boss) return null;
          S.enemies.length = 0; S.enemies.push(boss); S.boss = boss;
          const max = boss.max; let low = 1;
          HELD.fill(true);
          let t = 0;
          for (; t < 200 && boss.hp > 0; t += .05) {
            const a = Math.atan2(boss.y - S.p.y, boss.x - S.p.x);
            S.p.x = boss.x - Math.cos(a) * 1.15; S.p.y = boss.y - Math.sin(a) * 1.15; S.p.face = a;
            for (let i = 0; i < 3; i++) if (S.p.cds[i] <= 0 && S.p.mp >= activeSkills()[i].c) useSkill(i);
            update(.05);
            low = Math.min(low, Math.max(0, boss.hp) / max);
          }
          HELD.fill(false);
          S.returnInvulnerable = false;
          return { 秒: boss.hp <= 0 ? Math.round(t) : 0, 最大削り: Math.round((1 - low) * 100),
            激昂: +bossRageMul(boss.rageT).toFixed(1) };
        };
        /* 装備のロールで結果が振れるので、深度ごとに何度か引いて均す。
           1回だけだと当たりロールが関門を越えてしまい、判定が安定しない。 */
        const many = depth => {
          const runs = [];
          for (let i = 0; i < 3; i++) { _s = (depth * 2654435761 + i * 1013904223) >>> 0; runs.push(fight(depth)); }
          return { 撃破: runs.filter(r => r.秒).length, 回数: runs.length,
            最大削り: Math.max(...runs.map(r => r.最大削り)),
            秒: Math.round(runs.filter(r => r.秒).reduce((a, r) => a + r.秒, 0) / Math.max(1, runs.filter(r => r.秒).length)) || 0,
            激昂: Math.max(...runs.map(r => r.激昂)) };
        };
        return { 深度20: many(20), 深度25: many(25), 深度35: many(35), 深度50: many(50) };
      })(),
    };
  });
  if (gap.同深度.reach !== 1 || gap.同深度.out !== 1) problems.push(`階層どおりの装備に減衰がかかっている（${JSON.stringify(gap.同深度)}）`);
  if (gap.深すぎ.out !== 1) problems.push('階層より深い装備で1.0を超える倍率が出る');
  if (gap.序盤.out !== 1) problems.push('序盤（GEAR_GAP_FREE以下）でも深度差が効いている');
  if (!(gap.大幅下.out < .65)) problems.push(`深度20の装備で50階の与ダメージが ${Math.round(gap.大幅下.out * 100)}%（65%未満のはず）`);
  if (!(gap.素手.out < gap.大幅下.out)) problems.push('素手が深度20の装備より弱くない');
  if (!(gap.やや下.out > .85)) problems.push(`少し下の装備まで厳しすぎる（深度45で ${Math.round(gap.やや下.out * 100)}%）`);
  /* 被弾を無視して5分殴っても、階層に合わない装備では倒せないこと。
     ここが「倒せる」なら、粘りが装備の代わりになってしまう。 */
  const B = gap.boss;
  if (B.深度20.撃破) problems.push(`被弾を無視して殴り続ければ深度20の装備でも50階ボスを倒せる（${B.深度20.撃破}/${B.深度20.回数}）`);
  if (B.深度25.撃破) problems.push(`被弾を無視して殴り続ければ深度25の装備でも50階ボスを倒せる（${B.深度25.撃破}/${B.深度25.回数}）`);
  if (!(B.深度20.激昂 > 2)) problems.push(`火力が足りないのにボスが激昂しない（×${B.深度20.激昂}）`);
  /* 逆に厳しすぎないこと。階層の7割の深度があれば通せる余地を残す。 */
  if (B.深度35.撃破 < B.深度35.回数) problems.push(`階層の7割（深度35）の装備で50階ボスを倒せない回がある（${B.深度35.撃破}/${B.深度35.回数}、最大${B.深度35.最大削り}%）— 厳しすぎる`);
  if (B.深度50.撃破 < B.深度50.回数) problems.push(`階層どおりの装備で50階ボスを倒せない回がある（${B.深度50.撃破}/${B.深度50.回数}）`);
  notes.push(`装備の深度差(50階): 同深度100% / 45→${Math.round(gap.やや下.out * 100)}% / 25→${Math.round(gap.半分.out * 100)}% / 20→${Math.round(gap.大幅下.out * 100)}%（${gap.大幅下.fit}）/ 素手${Math.round(gap.素手.out * 100)}%`);
  notes.push(`  被弾を無視して殴り続けた50階ボス: 深度20→${B.深度20.撃破}/${B.深度20.回数}(最大${B.深度20.最大削り}%・激昂×${B.深度20.激昂}) / 深度25→${B.深度25.撃破}/${B.深度25.回数}(最大${B.深度25.最大削り}%) / 深度35→${B.深度35.撃破}/${B.深度35.回数}(${B.深度35.秒}秒) / 深度50→${B.深度50.撃破}/${B.深度50.回数}(${B.深度50.秒}秒)`);
}

/* 2p4. 操作キーの左右反転。3つを別々に入れ替えられること。 */
{
  const mir = await page.evaluate(() => {
    beginRun(20); S.paused = false;
    /* 端ではなく中心で見る。移動キーの当たり判定は画面半分の幅があり、
       左端だけを見ると入れ替えても「まだ左寄り」に見える。 */
    const box = id => { const r = document.getElementById(id).getBoundingClientRect(); return Math.round(r.left + r.width / 2); };
    const read = () => ({ stick: box('stickZone'), skill: box('s0'), item: box('railR') });
    for (const [k] of MIRRORS) S.settings[k] = 0;
    applyMirror(); const right = read();
    const each = {};
    for (const [k] of MIRRORS) {
      for (const [j] of MIRRORS) S.settings[j] = 0;
      S.settings[k] = 1; applyMirror(); each[k] = read();
    }
    for (const [k] of MIRRORS) S.settings[k] = 1;
    applyMirror(); const all = read();
    for (const [k] of MIRRORS) S.settings[k] = 0;
    applyMirror();
    return { right, each, all, mid: innerWidth / 2 };
  });
  /* 移動キーは既定が左、技と道具は既定が右。入れ替えたら反対側へ渡ること。 */
  const partOf = { mirStick: 'stick', mirSkill: 'skill', mirItem: 'item' };
  const side = (x, part) => (part === 'stick' ? x < mir.mid : x > mir.mid);   // 既定の側にいるか（中心で判定）
  for (const [key, part] of Object.entries(partOf)) {
    const moved = mir.each[key];
    if (side(moved[part], part)) problems.push(`${key} を入れ替えても ${part} が反対側へ行かない（${mir.right[part]} → ${moved[part]}）`);
    for (const [k2, p2] of Object.entries(partOf)) {
      if (k2 === key) continue;
      if (moved[p2] !== mir.right[p2]) problems.push(`${key} を入れ替えると ${p2} まで動く`);
    }
  }
  for (const [key, part] of Object.entries(partOf))
    if (side(mir.all[part], part)) problems.push(`3つとも入れ替えても ${part} が動かない`);
  notes.push(`操作キーの左右: 移動キー/技/道具を別々に反転（中心 既定 ${Object.values(mir.right).join('/')} → 全反転 ${Object.values(mir.all).join('/')}）`);
}

/* 2p5. データ引き継ぎ。書き出したコードから、同じ内容が戻ること。 */
{
  const xfer = await page.evaluate(async () => {
    S.deepest = 137; S.gold = 987654; S.premium = 4321;
    S.base = { lv: 88, xp: 12, pts: 7, str: 300, mag: 5, def: 120, agi: 90, spi: 4, luk: 3, xpCurveV2: true };
    S.unlockedCharacters = allRoster().map(x => x.k + ':' + x.ch.id);
    S.stash = []; for (let i = 0; i < 120; i++) S.stash.push(makeItem(60 + i, 0, 0, 3));
    S.settings.mirStick = 1;
    save();
    const before = localStorage.getItem(KEY);
    const code = await makeTransferCode();
    const got = await readTransferCode(code);
    const bad = async t => { try { await readTransferCode(t); return null; } catch (e) { return e.message; } };
    return {
      rawLen: before.length, codeLen: code.length,
      compressed: code.startsWith('DESCENT1:G:'),
      same: got.json === before,
      summary: transferSummary(got.data),
      /* 貼り付け事故に強いこと・別物を弾くこと */
      whitespaceOk: (await readTransferCode(code.slice(0, 40) + '\n \n' + code.slice(40))).json === before,
      rejects: {
        空: await bad(''), 別物: await bad('hello'),
        切れ: await bad(code.slice(0, code.length - 500)),
        別ゲーム: await bad('DESCENT1:P:' + btoa('{"foo":1}')),
      },
    };
  });
  if (!xfer.same) problems.push('引き継ぎコードから元と同じデータが戻らない');
  if (!xfer.compressed) problems.push('引き継ぎコードが圧縮されていない');
  if (!xfer.whitespaceOk) problems.push('改行が混じった引き継ぎコードを読めない');
  if (!(xfer.codeLen < xfer.rawLen / 2)) problems.push(`引き継ぎコードが縮んでいない（${xfer.rawLen}→${xfer.codeLen}）`);
  for (const [k, msg] of Object.entries(xfer.rejects)) {
    if (!msg) problems.push(`引き継ぎコードの検査が「${k}」を素通しする`);
    else if (/[A-Za-z]{6}/.test(msg)) problems.push(`「${k}」の断り書きが英語のまま: ${msg}`);
  }
  if (!/深度137/.test(xfer.summary)) problems.push(`読み込む前の中身が出ない（${xfer.summary}）`);
  notes.push(`引き継ぎ: ${xfer.rawLen.toLocaleString()}字 → ${xfer.codeLen.toLocaleString()}字（圧縮）→ 完全一致`);
  notes.push(`  読み込み前の中身: ${xfer.summary} / 空・別物・切れ・別ゲームは日本語で断る`);
}

/* 2p. 戦闘力。装備を替えると増減し、強い物ほど大きいこと。
 *
 * 比較は主ステータスを揃える。武器の主ステータスは攻撃力か魔力のどちらかで、
 * 魔力0の戦士に魔力の杖を持たせれば深度300の伝説でも深度20の並より弱い。
 * それは戦闘力が正しく効き目を映している証拠であって不具合ではないので、
 * 「深いほど強い」は同じ主ステータス同士で確かめ、
 * 「効かない主ステータスは高く出ない」は別項目として押さえる。 */
{
  const cp = await page.evaluate(() => {
    S.cls = 'warrior'; S.formation = ['warrior:gai'];
    S.base = { lv: 60, xp: 0, pts: 0, str: 180, mag: 0, def: 60, agi: 60, spi: 0, luk: 0 };
    S.stash = []; S.gear = Object.fromEntries(SLOTK.map(k => [k, null]));
    S.p = newPlayer();
    const bare = combatPower(derive());
    const pick = (depth, rarity, mainId) => {
      for (let guard = 0; guard < 4000; guard++) {
        const it = makeItem(depth, 0, 0, rarity);
        if (it.slot === 'weapon' && it.main.id === mainId) return it;
      }
      return null;
    };
    const weak = pick(20, 0, 'atk'), strong = pick(300, 4, 'atk');
    const withWeak = powerWith('weapon', weak), withStrong = powerWith('weapon', strong);
    /* 主ステータスだけを差し替えた同じ武器と比べる。別々に引いた2本だと、
       付いたオプションの当たり外れの方が主ステータスより大きく出て、
       「魔力の杖の方が強い」がふつうに起きる（同じ罠を2度踏んだ）。
       mainV は main.id を見ないので、id だけ替えれば他は完全に同じになる。 */
    const staff = { ...strong, main: { ...strong.main, id: 'matk' } };
    const withStaff = powerWith('weapon', staff);
    // 一括着用で戦闘力が上がること
    S.stash = []; for (let i = 0; i < 30; i++) S.stash.push(makeItem(150 + i * 4, 0, 0, 3));
    const before = combatPower(); autoEquipBest(); const after = combatPower();
    return { bare, withWeak, withStrong, withStaff, before, after };
  });
  if (!(cp.bare > 0)) problems.push('素手の戦闘力が0');
  if (!(cp.withWeak > cp.bare)) problems.push('装備しても戦闘力が上がらない');
  if (!(cp.withStrong > cp.withWeak)) problems.push('強い装備のほうが戦闘力が低い');
  if (!(cp.withStaff < cp.withStrong)) problems.push(`魔力0の戦士に、主ステータスを魔力へ替えただけの武器が同等以上に出る（${cp.withStaff} / ${cp.withStrong}）`);
  if (!(cp.after > cp.before)) problems.push(`おすすめ着用で戦闘力が上がらない（${cp.before}→${cp.after}）`);
  notes.push(`戦闘力: 素手${cp.bare} / 並装備${cp.withWeak} / 伝説${cp.withStrong} — 一括着用 ${cp.before}→${cp.after}`);
  notes.push(`  同じ伝説武器の主ステータスを攻撃→魔力に替えると: ${cp.withStrong} → ${cp.withStaff}（魔力0の戦士では効かない）`);
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
  // 装備タブの4区画
  await tap('#scTown .tab[data-t="gear"]'); await page.waitForTimeout(250);
  for (const [v, label] of [['equip', '装備'], ['skill', '技'], ['ability', '能力'], ['break', '限界突破']]) {
    const ok = await page.evaluate(view => {
      S.gearSub = view; openTown();
      return document.getElementById('townBody').textContent.length > 60;
    }, v);
    if (!ok) problems.push(`装備タブの「${label}」が開かない`);
    await page.waitForTimeout(200);
  }
  // 倉庫の4区画すべてが開くこと
  await tap('#scTown .tab[data-t="inv"]'); await page.waitForTimeout(250);
  for (const label of ['装備', '道具', '結晶', '調合']) {
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
  await page.evaluate(() => { S.gearSub = 'skill'; openTown(); });
  await page.waitForTimeout(300);
  const firstSkill = await page.evaluate(() => {
    const c = document.querySelector('.skillCard');
    return c ? { uniq: c.classList.contains('uniqSkill'), name: c.querySelector('.nm').textContent.trim() } : null;
  });
  if (!firstSkill || !firstSkill.uniq) problems.push(`技一覧の先頭が固有技でない（${firstSkill ? firstSkill.name : '無し'}）`);
  notes.push(`装備枠 ${sizes.装備.join('/')}px / 技一覧の先頭 ${firstSkill ? firstSkill.name : '無し'}`);
  await tap('#scTown .tab[data-t="prep"]'); await page.waitForTimeout(250);

  // 階層の自由入力・±5、提供割合・編成
  await tap('#scTown .tab[data-t="prep"]'); await page.waitForTimeout(250);
  const floorPick = await page.evaluate(() => {
    S.deepest = 60; openTown(); const input = document.querySelector('#diveBar .floorInput');
    input.value = '23'; input.dispatchEvent(new Event('change', { bubbles: true })); const entered = S.diveFloor;
    document.querySelector('#diveBar .step .btn:last-child').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    return { entered, plus: S.diveFloor };
  });
  if (floorPick.entered !== 21 || floorPick.plus !== 26) problems.push(`階層入力が不正（${floorPick.entered} → ${floorPick.plus}）`);
  await tap('#scTown .tab[data-t="shop"]'); await page.waitForTimeout(250);
  await tap('.rateLink'); await page.waitForTimeout(300);
  const rates = await page.evaluate(() => document.querySelectorAll('.rateRow').length);
  if (!rates) problems.push('提供割合が開かない');
  await page.evaluate(() => $('itPop').classList.remove('on'));
  notes.push(`拠点の全タブ・階層入力(${floorPick.entered}→${floorPick.plus})・提供割合(${rates}行) 開通`);
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

/* 7. 毒沼は棒立ちへ当たり、背後攻撃は予兆中に離れれば避けられること。 */
{
  const hazards = await page.evaluate(() => {
    beginRun(30); S.paused=false; S.p.hp=S.p.max; const hp0=S.p.hp;
    const z={phase:1,col:'#0f0',dmg:20,telK:'pools'}; bossRelease(z,0,0);
    for(let i=0;i<30;i++)update(1/60); const poolHit=S.p.hp<hp0;
    S.fx=[];S.p.hp=S.p.max;S.p.invulT=0;
    const b={x:S.p.x-2,y:S.p.y,r:.8,col:'#808',dmg:20,telK:'ambush',vanish:1,element:'dark'};
    bossRelease(b,0,0);const marked=S.fx.some(f=>f.t==='boom'&&f.delay>0);
    S.p.x+=4;for(let i=0;i<40;i++)update(1/60);const escaped=S.p.hp===S.p.max;
    return{poolHit,marked,escaped};
  });
  if(!hazards.poolHit)problems.push('棒立ちしても毒沼のダメージを受けない');
  if(!hazards.marked||!hazards.escaped)problems.push(`背後攻撃を移動で避けられない（${JSON.stringify(hazards)}）`);
  notes.push(`危険床: 棒立ち被弾 ${hazards.poolHit} / 背後予兆 ${hazards.marked} / 移動回避 ${hazards.escaped}`);
}

if (errors.length) problems.push(`実行中の例外: ${[...new Set(errors)].slice(0, 3).join(' | ')}`);
await page.close(); await browser.close(); server.close();

for (const n of notes) console.log('  ' + n);
if (problems.length) { console.error('=== 通し確認の問題 ===\n' + problems.map(p => '・' + p).join('\n')); process.exit(1); }
console.log('通し確認: 初回起動からボスまで、進行不能・例外なし');
