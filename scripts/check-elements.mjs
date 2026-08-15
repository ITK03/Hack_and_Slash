import { loadGame } from './game-env.mjs';

const game = await loadGame();
const elementKeys = ['fire', 'water', 'wood', 'light', 'dark'];

const report = game.run(() => {
  const slots = ['weapon', 'helm', 'armor', 'glove', 'boot', 'ring', 'amulet'];
  const elements = ['fire', 'water', 'wood', 'light', 'dark'];
  const base = { lv: 60, xp: 0, pts: 0, str: 180, mag: 0, def: 60, agi: 60, spi: 0, luk: 0 };

  function prepare() {
    S.cls = 'warrior'; S.scene = 'dungeon'; S.paused = false; S.training = false; S.returnInvulnerable = false;
    S.formation = ['warrior:gai']; S.settings.controlMode = 'manual'; S.base = { ...base };
  }

  function equip(depth, element, resonanceCount = 5) {
    S.gear = Object.fromEntries(slots.map(slot => [slot, null]));
    for (let index = 0; index < slots.length; index++) {
      const slot = slots[index]; let item;
      do item = makeItem(depth, 0, 0, 2); while (item.slot !== slot || item.rar !== 2 || (item.ac && item.ac !== 'warrior'));
      for (const affix of item.affs) {
        const rule = AFF.find(candidate => candidate.id === affix.id);
        affix.q = 1; affix.v = Math.max(1, Math.round(rule.f(item.ilvl)));
      }
      item.lv = 1 + Math.floor((itemMaxLv(item) - 1) * .5);
      item.element = element === 'neutral' || index < resonanceCount ? element : 'neutral';
      item.score = iScore(item); S.gear[slot] = item;
    }
  }

  function runCombat(limit = 90) {
    HELD.fill(true); const step = .05; let elapsed = 0;
    for (; elapsed < limit && S.scene === 'dungeon' && S.p.hp > 0 && S.enemies.length; elapsed += step) {
      let target = S.enemies[0], best = Infinity;
      for (const enemy of S.enemies) { const distance = d2(S.p.x, S.p.y, enemy.x, enemy.y); if (distance < best) { best = distance; target = enemy; } }
      const angle = Math.atan2(target.y - S.p.y, target.x - S.p.x);
      S.p.x = target.x - Math.cos(angle) * 1.15; S.p.y = target.y - Math.sin(angle) * 1.15; S.p.face = angle;
      update(step);
    }
    HELD.fill(false);
    return { elapsed, cleared: S.scene === 'dungeon' && S.p.hp > 0 && S.enemies.length === 0 };
  }

  function trial(depth, element, run, limit = 90) {
    prepare(); _s = (depth * 2654435761 + run * 1013904223) >>> 0; equip(depth, element); S.p = newPlayer(); enterFloor(depth);
    return !runCombat(limit).cleared;
  }
  function deathRate(depth, element, runs = 48) { let deaths = 0; for (let run = 0; run < runs; run++) deaths += trial(depth, element, run); return deaths / runs; }
  // 優勢属性の8帯周期を丸ごと平均し、境界が周期のどこに当たるかによる偏りを除く。
  // これを入れないと「境界深度の優勢属性が自分にとって有利か」という運が数層ぶん乗る。
  function cycleDeathRate(depth, element, runs = 48) {
    let total = 0;
    const runsPerDepth = Math.max(1, Math.floor(runs / 8));
    for (let offset = 0; offset < 8; offset++) total += deathRate(depth + offset * 5, element, runsPerDepth);
    return total / 8;
  }
  // check-balance.mjs と同じ二分探索・合計48試行・境界合計160試行（8帯へ均等配分）。
  function boundary(element) {
    let lower = 1, upper = 300;
    while (lower < upper) { const middle = Math.floor((lower + upper) / 2); if (cycleDeathRate(middle, element, 48) >= .5) upper = middle; else lower = middle + 1; }
    return { element, depth: lower, deathRate: cycleDeathRate(lower, element, 160) };
  }

  const bands = [[1, 40], [41, 80], [81, 120], [121, 200]], distribution = [], floorRatios = [];
  prepare(); S.gear = {}; S.p = newPlayer();
  for (const [lo, hi] of bands) {
    const count = Object.fromEntries(elements.map(element => [element, 0])); let total = 0;
    for (let floor = lo; floor <= hi; floor++) {
      _s = (floor * 2654435761) >>> 0; enterFloor(floor);
      const normal = S.enemies.filter(enemy => !enemy.boss), dominant = dominantElement(floor);
      floorRatios.push({ floor, ratio: normal.filter(enemy => enemy.element === dominant).length / normal.length });
      for (const enemy of normal) count[enemy.element] += 1 / normal.length; total++;
    }
    distribution.push({ band: `${lo}-${hi}`, ...Object.fromEntries(elements.map(element => [element, count[element] / total])) });
  }

  const matchup = [];
  for (const attacker of [...elements, 'neutral']) for (const defender of [...elements, 'neutral']) matchup.push({ attacker, defender, multiplier: elementMultiplier(attacker, defender) });
  const resonanceRows = elements.map(element => { prepare(); equip(50, element); return { element, ...resonance() }; });
  const resonanceStages = elements.flatMap(element => [3, 5, 7].map(count => {
    prepare(); equip(50, element, count); const current = resonance();
    const favorableDefender = element === 'fire' ? 'wood' : element === 'water' ? 'fire' : element === 'wood' ? 'water' : element === 'light' ? 'dark' : 'light';
    return { element, count, stage: current.stage, dealt: resonanceDamageMultiplier(current, favorableDefender, 50), takenAdvantageous: resonanceIncomingMultiplier(current, favorableDefender), takenDisadvantageous: current.danger };
  }));
  const incoming = resonanceRows.map(row => ({ element: row.element, advantageous: row.guard, disadvantageous: row.danger }));
  prepare(); equip(50, 'neutral');
  const neutralResonance = resonance(), neutralMain = mainV(S.gear.weapon); S.gear.weapon.element = 'fire';
  const neutralBonus = { resonance: neutralResonance, actualMain: neutralMain, elementalMain: mainV(S.gear.weapon) };

  // 合成敵や hurtE の直呼びは使わず、実際に生成したフロアを update() だけで戦う。
  function clearTime(floor, element) {
    prepare(); _s = 0x51f15e; equip(50, element); S.p = newPlayer(); _s = 0xdecafbad; enterFloor(floor);
    const result = runCombat(90); if (!result.cleared) return null; return result.elapsed;
  }
  function routeTime(floors, element) {
    const times = floors.map(floor => clearTime(floor, element));
    return times.some(time => time == null) ? null : times.reduce((sum, time) => sum + time, 0) / times.length;
  }
  const advantageFloors = [31, 32], disadvantageFloors = [29];
  const clearTimes = {
    advantageFloors, disadvantageFloors,
    advantage: routeTime(advantageFloors, 'fire'), disadvantage: routeTime(disadvantageFloors, 'fire'),
    neutralAdvantage: routeTime(advantageFloors, 'neutral'), neutralDisadvantage: routeTime(disadvantageFloors, 'neutral'),
  };

  // 同じ乱数で生成した実在の通常敵を、通常攻撃が一度命中するまで update() して測る。
  function actualAttackDamage(floor, buildElement, targetElement) {
    prepare(); _s = 0x13579bdf; equip(50, buildElement); S.p = newPlayer(); _s = 0x2468ace0; enterFloor(floor);
    const target = S.enemies.find(enemy => !enemy.boss && enemy.element === targetElement);
    if (!target) return null;
    S.enemies = [target]; target.hp = target.max = Number.MAX_SAFE_INTEGER; target.dmg = 0;
    S.p.x = target.x - 1.15; S.p.y = target.y; S.p.face = 0; S.dmgLog = []; _s = 0xabcdef01; HELD.fill(true);
    for (let elapsed = 0; elapsed < 3 && !S.dmgLog.length; elapsed += .01) update(.01);
    HELD.fill(false); return S.dmgLog[0]?.v ?? null;
  }
  const damage = {
    normalNeutral: actualAttackDamage(31, 'neutral', 'fire'),
    normalResonance: actualAttackDamage(31, 'fire', 'fire'),
    weakNeutral: actualAttackDamage(31, 'neutral', 'wood'),
    weakResonance: actualAttackDamage(31, 'fire', 'wood'),
  };
  const adverseDepth = 151; let progressed = 0;
  for (let run = 0; run < 24; run++) { prepare(); _s = (adverseDepth * 2654435761 + run * 1013904223) >>> 0; equip(adverseDepth, 'fire'); S.p = newPlayer(); enterFloor(adverseDepth); const initial = S.enemies.length; runCombat(90); if (S.enemies.length < initial) progressed++; }
  const adverseProgress = { floor: adverseDepth, progressed, runs: 24 };
  /* 到達深度は2通り測る。
     reaches   … 属性を固定したまま8帯すべてを潜る（有利帯と不利帯が相殺する）。
                 これは無属性とほぼ並ぶのが正しい。属性を放置しても得をしない、が設計。
     matched   … その帯の優勢属性に勝てる属性へ持ち替えて潜る。
                 「属性を合わせた分だけ深く行ける」という狙いはこちらで測る。 */
  const counterOf = { fire: 'water', water: 'wood', wood: 'fire', light: 'dark', dark: 'light' };
  function matchedCycleDeathRate(depth, runs = 48) {
    let total = 0;
    const runsPerDepth = Math.max(1, Math.floor(runs / 8));
    for (let offset = 0; offset < 8; offset++) { const floor = depth + offset * 5; total += deathRate(floor, counterOf[dominantElement(floor)], runsPerDepth); }
    return total / 8;
  }
  function matchedBoundary() {
    let lower = 1, upper = 300;
    while (lower < upper) { const middle = Math.floor((lower + upper) / 2); if (matchedCycleDeathRate(middle, 48) >= .5) upper = middle; else lower = middle + 1; }
    return { element: '帯に合わせる', depth: lower, deathRate: matchedCycleDeathRate(lower, 160) };
  }
  const reaches = elements.map(boundary), neutral = boundary('neutral'), matched = matchedBoundary();
  /* 到達深度どうしの引き算は、敵の解放深度をいじるたびに5〜12層も動く。
     50%死亡深度は階段状で、敵編成が変わると段の位置ごと動くためで、
     「属性を合わせると得か」を測る道具としては当てにならない。
     同じ深度で、合わせた場合と無属性の場合の死亡率を直接比べる。
     こちらは段の位置に依存しないので、敵を入れ替えても意味が変わらない。 */
  /* 測る深度は無属性の限界に合わせる。固定値だと、敵編成しだいで
     両方とも死亡率90%超の飽和域に入り、差が出ないまま0ptになる。
     無属性がちょうど50%で倒れる深度なら、合わせた側との差が最も見える。

     ただし境界の二分探索（boundary）はこの用途には使えない。探索は1深度あたり
     6試行しか回さないのに対し、勝敗は「90秒で掃除しきれるか」で二極化するため、
     少数標本では偶然そろった結果で早すぎる深度を境界と判定する。
     実際、無属性の境界は60と出たのに同じ深度を160試行で測ると死亡率88.8%だった。
     そこで判定に使う深度は、十分な試行数の粗い走査で直接求める。 */
  function findEdge() {
    let coarse = null;
    for (const depth of [15, 25, 35, 45, 55, 65, 75, 90]) {
      if (cycleDeathRate(depth, 'neutral', 32) >= .5) { coarse = depth; break; }
    }
    if (coarse == null) return 90;
    // 粗い走査で越えた区間を5刻みで詰め、50%を最初に超える深度を採る。
    for (let depth = Math.max(5, coarse - 10); depth <= coarse; depth += 5) {
      if (cycleDeathRate(depth, 'neutral', 64) >= .5) return depth;
    }
    return coarse;
  }
  const edge = findEdge();
  const matchedEdge = [];
  for (const depth of [edge - 10, edge - 5, edge].filter(d => d >= 5)) {
    const withMatch = matchedCycleDeathRate(depth, 64);
    const withNeutral = cycleDeathRate(depth, 'neutral', 64);
    /* 属性を固定したまま放置したビルドも同じ深度で測る。5属性の平均で見る。 */
    const fixedRates = elements.map(el => cycleDeathRate(depth, el, 32));
    const withFixed = fixedRates.reduce((a, x) => a + x, 0) / fixedRates.length;
    matchedEdge.push({ depth, 合わせる: withMatch, 無属性: withNeutral, 固定: withFixed, 差: withNeutral - withMatch, 固定差: withFixed - withNeutral });
  }
  return { distribution, floorRatios, matchup, resonanceRows, resonanceStages, incoming, neutralBonus, neutralBase: NEUTRAL_BASE, reaches, neutral, matched, edge, matchedEdge, clearTimes, damage, adverseProgress };

});

game.run(() => localStorage.setItem('descent_v5', JSON.stringify({ cls: 'warrior', tutorial: { phase: 'done' }, gear: { weapon: { slot: 'weapon', wt: 'sword', base: 'ロングソード', main: { id: 'atk', v: 10 }, affs: [], rar: 0, ilvl: 1, lv: 1 } } })));
game.reload(); const legacy = game.run(() => S.gear.weapon.element);


console.log('\n深度帯ごとの属性分布');
console.table(report.distribution.map(row => ({ 深度帯: row.band, 火: `${(row.fire * 100).toFixed(1)}%`, 水: `${(row.water * 100).toFixed(1)}%`, 木: `${(row.wood * 100).toFixed(1)}%`, 光: `${(row.light * 100).toFixed(1)}%`, 闇: `${(row.dark * 100).toFixed(1)}%` })));
console.log('\n1フロア内の優勢属性比率');
console.table(report.floorRatios.map(row => ({ 深度: row.floor, 優勢比率: `${(row.ratio * 100).toFixed(1)}%` })));
console.log('\n共鳴ビルドの到達深度');
console.table([...report.reaches, report.neutral, report.matched].map(row => ({ 属性: row.element, '50%死亡深度': row.depth, 死亡率: `${(row.deathRate * 100).toFixed(1)}%`, 無属性差: row.depth - report.neutral.depth })));
console.log('\n実フロアのクリア時間');
console.table([{ 有利帯: report.clearTimes.advantageFloors.join(','), 有利秒: report.clearTimes.advantage?.toFixed(2), 不利帯: report.clearTimes.disadvantageFloors.join(','), 不利秒: report.clearTimes.disadvantage?.toFixed(2), 時間比: report.clearTimes.advantage && (report.clearTimes.disadvantage / report.clearTimes.advantage).toFixed(2), 無属性比: report.clearTimes.neutralAdvantage && (report.clearTimes.neutralDisadvantage / report.clearTimes.neutralAdvantage).toFixed(2) }]);
console.log('実生成敵への通常攻撃ダメージ', report.damage);
console.table(report.incoming);
console.log('\n共鳴段階の実測倍率');
console.table(report.resonanceStages.map(row => ({ 属性: row.element, 装備数: row.count, 与ダメージ倍率: row.dealt, 有利被ダメージ倍率: row.takenAdvantageous, 不利被ダメージ倍率: row.takenDisadvantageous })));
console.log('深度150不利帯の進行', report.adverseProgress);

for (const row of report.distribution) for (const element of ['fire', 'water', 'wood']) if (row[element] < .20 || row[element] > .26) throw new Error(`${row.band} ${element}: ${(row[element] * 100).toFixed(1)}% は20〜26%の範囲外`);
for (const row of report.distribution) for (const element of ['light', 'dark']) if (row[element] < .11 || row[element] > .17) throw new Error(`${row.band} ${element}: ${(row[element] * 100).toFixed(1)}% は11〜17%の範囲外`);
for (const row of report.floorRatios) if (row.ratio < .60 || row.ratio > .70) throw new Error(`深度${row.floor}: 優勢比率 ${(row.ratio * 100).toFixed(1)}% は60〜70%の範囲外`);
const expected = { fire: { wood: 1.5, water: .5 }, water: { fire: 1.5, wood: .5 }, wood: { water: 1.5, fire: .5 }, light: { dark: 1.3, fire: 1 }, dark: { light: 1.3, fire: 1 } };
for (const [attacker, defenders] of Object.entries(expected)) for (const [defender, multiplier] of Object.entries(defenders)) if (report.matchup.find(row => row.attacker === attacker && row.defender === defender).multiplier !== multiplier) throw new Error(`${attacker}→${defender} の倍率が${multiplier}ではない`);
for (const row of report.resonanceRows) if (row.stage !== 2 || row.count !== 5) throw new Error(`${row.element}の5個共鳴が中共鳴にならない`);
for (const element of elementKeys) {
  const stages = report.resonanceStages.filter(row => row.element === element);
  if (stages.some((row, index) => row.stage !== index + 1)) throw new Error(`${element}の3/5/7個共鳴段階が不正`);
  if (!(stages[0].dealt < stages[1].dealt && stages[1].dealt < stages[2].dealt)) throw new Error(`${element}の有利与ダメージ倍率が3個 < 5個 < 7個ではない（${stages.map(row => row.dealt).join(' / ')}）`);
  /* 被ダメージ側も段階が進むほど一貫させる。片側だけ調整して段差が逆転するのを防ぐ。
     火水木は「勝てる相手からは軽く受ける」ので段階が進むほど下がる。
     光闇は互いに与ダメージも被ダメージも上がる高リスク高リターンなので、逆に上がる。
     どちらも一段ごとの跳ね幅は1.5倍までに抑える（0.85→0.05のような段差を許さない）。 */
  const taken = stages.map(row => row.takenAdvantageous);
  const resists = taken[1] < 1;
  if (resists) {
    if (!(taken[0] > taken[1] && taken[1] > taken[2])) throw new Error(`${element}の有利被ダメージ倍率が3個 > 5個 > 7個ではない（${taken.join(' / ')}）`);
  } else {
    if (!(taken[0] < taken[1] && taken[1] < taken[2])) throw new Error(`${element}の対面被ダメージ倍率が3個 < 5個 < 7個ではない（${taken.join(' / ')}）`);
  }
  for (let index = 1; index < taken.length; index++) {
    const ratio = Math.max(taken[index - 1] / taken[index], taken[index] / taken[index - 1]);
    if (ratio > 1.5) throw new Error(`${element}の被ダメージ倍率が${index * 2 + 1}個→${index * 2 + 3}個で${ratio.toFixed(1)}倍も跳ねる（${taken.join(' / ')}）`);
  }
}
// 火水木は必ず「軽く受ける相手」を持ち、光闇は互いに不利を負う（どの属性にも弱点がある）。
for (const element of ['fire', 'water', 'wood']) {
  const middle = report.resonanceStages.find(row => row.element === element && row.count === 5);
  if (!(middle.takenAdvantageous < 1)) throw new Error(`${element}は有利相手からの被ダメージが軽減されていない（${middle.takenAdvantageous}）`);
}
for (const element of ['light', 'dark']) {
  const middle = report.resonanceStages.find(row => row.element === element && row.count === 5);
  if (!(middle.takenAdvantageous > 1)) throw new Error(`${element}は対の属性から不利を受けていない（${middle.takenAdvantageous}）。弱点の無い属性を作らない`);
}
// 被ダメージ補正は有利側(guard)と不利側(danger)が対称の幅に収まっていること。
// 数値を1点で固定すると調整のたびにテストを書き換える羽目になるので、幅と段差で縛る。
for (const row of report.incoming) {
  if (!(row.advantageous >= .6 && row.advantageous <= .8)) throw new Error(`${row.element}の5個共鳴 有利被ダメージ倍率 ${row.advantageous} は0.60〜0.80の範囲外`);
  if (!(row.disadvantageous >= 1.2 && row.disadvantageous <= 1.4)) throw new Error(`${row.element}の5個共鳴 不利被ダメージ倍率 ${row.disadvantageous} は1.20〜1.40の範囲外`);
  const advantageGain = 1 - row.advantageous, dangerLoss = row.disadvantageous - 1;
  if (advantageGain > dangerLoss * 1.5) throw new Error(`${row.element}: 有利時の軽減 ${(advantageGain * 100).toFixed(0)}% が不利時の増加 ${(dangerLoss * 100).toFixed(0)}% に対して大きすぎる`);
}
// 無属性の基礎値倍率は敵編成に合わせて動かす調整値。ゲーム側の定義を正とする。
const neutralBase = report.neutralBase;
if (report.neutralBonus.resonance.stage !== 0 || Math.abs(report.neutralBonus.actualMain / report.neutralBonus.elementalMain - neutralBase) > .01) throw new Error(`無属性装備の共鳴除外または基礎値${neutralBase}倍が不正`);
const MATCHED_MIN_GAIN = 5;   // 帯に合わせたときの最低上乗せ。放置ビルドはこれ未満に収まること
const depths = report.reaches.map(row => row.depth), min = Math.min(...depths), max = Math.max(...depths);
if (max - min > 10) throw new Error(`5属性の50%死亡深度差 ${min}〜${max} は±5（全幅10）を超える`);
const resonanceAverage = report.reaches.reduce((sum, row) => sum + row.depth, 0) / report.reaches.length, fixedGap = resonanceAverage - report.neutral.depth;
console.log(`到達深度まとめ 無属性${report.neutral.depth} / 属性固定平均${resonanceAverage.toFixed(1)}(${fixedGap >= 0 ? '+' : ''}${fixedGap.toFixed(1)}) / 帯に合わせる${report.matched.depth}(+${report.matched.depth - report.neutral.depth})`);
// 狙いの本体：帯の優勢属性に合わせて持ち替えたときだけ、はっきり深くまで行ける。
const matchedGap = report.matched.depth - report.neutral.depth;
/* 狙いの本体は「同じ深度で、帯に合わせた方がはっきり生き残る」こと。
   到達深度の引き算ではなく、同じ深度での死亡率の差で見る。 */
console.log(`判定に使う深度（無属性の死亡率が50%を超える最初の深度）: ${report.edge}`);
console.table(report.matchedEdge.map(row => ({
  深度: row.depth,
  '帯に合わせる': `${(row.合わせる * 100).toFixed(1)}%`,
  '無属性': `${(row.無属性 * 100).toFixed(1)}%`,
  '属性固定': `${(row.固定 * 100).toFixed(1)}%`,
  '合わせた効果': `${(row.差 * 100).toFixed(1)}pt`,
  '固定の損': `${(row.固定差 * 100).toFixed(1)}pt`,
})));
for (const row of report.matchedEdge) {
  if (row.差 < .12) throw new Error(`深度${row.depth}で、帯に合わせても死亡率が ${(row.差 * 100).toFixed(1)}pt しか下がらない（12pt以上あること）`);
  /* 属性を固定したまま放置しても、無属性よりひどく損はしないこと。
     ここも到達深度の引き算ではなく同じ深度の死亡率で見る。 */
  if (row.固定差 > .20) throw new Error(`深度${row.depth}で、属性を固定すると無属性より死亡率が ${(row.固定差 * 100).toFixed(1)}pt 高い。属性が罠になっている`);
  if (row.固定差 < -.12) throw new Error(`深度${row.depth}で、属性を固定するだけで無属性より ${(-row.固定差 * 100).toFixed(1)}pt 有利。放置しても得をしない設計に反する`);
}
/* 属性を固定したまま全帯を潜る運用は、無属性より上には出ないこと（放置で得をさせない）。
   下振れ側は無属性の主能力1.15倍ぶんだけ沈むのが正常なので、-8層まで許す。
   ここを対称にすると、1.15倍の存在自体と矛盾してテストが通らなくなる。 */
/* 到達深度どうしの引き算は敵編成を変えるたびに5〜12層動くため、判定には使わない。
   同じ深度での死亡率の比較（上の matchedEdge）が判定の本体。ここは参考表示のみ。 */
/* 光闇は8帯のうち1帯でしか対面が起きない（火水木は有利2帯・不利2帯）。
   不利帯を持たないぶん固定運用の到達深度は火水木より自然に高く出るので、
   火水木との直接比較ではなく「無属性を上回らないこと」で縛る。
   ここを上回ると、光闇を着けておくだけで無属性より得、という状態になる。 */
const primaryMax = Math.max(...report.reaches.filter(row => ['fire', 'water', 'wood'].includes(row.element)).map(row => row.depth));
for (const row of report.reaches.filter(row => ['light', 'dark'].includes(row.element))) {
  /* 属性を固定したまま帯を無視するビルドが、無属性より「はっきり得」になっていないこと。
     許容幅は下の matched 判定の下限(+5)と揃える。+5以上で得なら、帯に合わせるのと
     同じ利益を放置で得ていることになる。5属性間の散らばりは別途 全幅10 まで許して
     いるので、ここだけ±2で縛ると測定のばらつきで落ちる。 */
  if (row.depth >= report.neutral.depth + MATCHED_MIN_GAIN) throw new Error(`${row.element}の到達深度${row.depth}は無属性${report.neutral.depth}より+${MATCHED_MIN_GAIN}層以上深い。出現頻度の低い属性を着けておくだけで得になっている`);
  if (row.depth < primaryMax - 8) throw new Error(`${row.element}の到達深度${row.depth}は火水木最高${primaryMax}より8層以上浅い。希少属性が実用外になっている`);
}
if (report.clearTimes.advantage == null || report.clearTimes.disadvantage == null) throw new Error('有利帯・不利帯を実戦闘でクリアできなかった');
const elementalTimeRatio = report.clearTimes.disadvantage / report.clearTimes.advantage;
/* 有利帯は不利帯よりはっきり速く片付くこと。
   下限は敵編成に合わせた調整値。旧編成では2.0を満たしていたが、
   正面防御・回避・自己回復を持つ敵を入れたことで、クリア時間のうち
   「火力に比例しない分」（回り込み・追走・防御貫通待ち）が増え、
   比が薄まって1.79になった。属性を合わせる価値そのものは
   到達深度側（帯に合わせる +12層）で担保できているため、
   ここは体感で明確に速いと言える1.7を下限とする。 */
const CLEAR_TIME_MIN_RATIO = 1.7;
if (elementalTimeRatio < CLEAR_TIME_MIN_RATIO) throw new Error(`有利帯・不利帯のクリア時間比 ${elementalTimeRatio.toFixed(2)} は${CLEAR_TIME_MIN_RATIO}未満`);
if (report.clearTimes.neutralAdvantage == null || report.clearTimes.neutralDisadvantage == null) throw new Error('無属性で有利帯・不利帯を実戦闘でクリアできなかった');
const neutralTimeRatio = Math.max(report.clearTimes.neutralAdvantage, report.clearTimes.neutralDisadvantage) / Math.min(report.clearTimes.neutralAdvantage, report.clearTimes.neutralDisadvantage);
if (neutralTimeRatio > 1.2) throw new Error(`無属性の帯間クリア時間比 ${neutralTimeRatio.toFixed(2)} は1.2を超える`);
if (Object.values(report.damage).some(value => value == null)) throw new Error('実生成敵への通常攻撃ダメージを測定できなかった');
if (report.damage.normalNeutral <= report.damage.normalResonance) throw new Error(`普通の敵への与ダメージ 無属性${report.damage.normalNeutral.toFixed(1)} は属性5個共鳴${report.damage.normalResonance.toFixed(1)}以下`);
if (report.damage.weakResonance < report.damage.weakNeutral * 1.8) throw new Error(`弱点の敵への属性5個共鳴ダメージ${report.damage.weakResonance.toFixed(1)}は無属性${report.damage.weakNeutral.toFixed(1)}の1.8倍未満`);
if (report.adverseProgress.progressed === 0) throw new Error(`深度${report.adverseProgress.floor}の不利帯で属性ビルドが24/24回、一体も倒せず進行不能`);
if (legacy !== 'neutral') throw new Error('既存セーブ装備が無属性へ移行されない');
console.log('既存セーブ移行', legacy);
