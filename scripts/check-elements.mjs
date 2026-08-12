import { loadGame } from './game-env.mjs';

const game = await loadGame();

const report = game.run(() => {
  const slots = ['weapon', 'helm', 'armor', 'glove', 'boot', 'ring', 'amulet'];
  const elements = ['fire', 'water', 'wood', 'light', 'dark'];
  const base = { lv: 60, xp: 0, pts: 0, str: 180, mag: 0, def: 60, agi: 60, spi: 0, luk: 0 };

  function prepare() {
    S.cls = 'warrior'; S.scene = 'dungeon'; S.paused = false; S.training = false; S.returnInvulnerable = false;
    S.formation = ['warrior:gai']; S.settings.controlMode = 'manual'; S.base = { ...base };
  }

  function equip(depth, element) {
    S.gear = Object.fromEntries(slots.map(slot => [slot, null]));
    for (let index = 0; index < slots.length; index++) {
      const slot = slots[index]; let item;
      do item = makeItem(depth, 0, 0, 2); while (item.slot !== slot || item.rar !== 2 || (item.ac && item.ac !== 'warrior'));
      for (const affix of item.affs) {
        const rule = AFF.find(candidate => candidate.id === affix.id);
        affix.q = 1; affix.v = Math.max(1, Math.round(rule.f(item.ilvl)));
      }
      item.lv = 1 + Math.floor((itemMaxLv(item) - 1) * .5);
      item.element = element === 'neutral' || index < 5 ? element : 'neutral';
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
  const reaches = elements.map(boundary), neutral = boundary('neutral');
  return { distribution, floorRatios, matchup, resonanceRows, neutralBonus, reaches, neutral, clearTimes, damage, adverseProgress };

});

game.run(() => localStorage.setItem('descent_v5', JSON.stringify({ cls: 'warrior', tutorial: { phase: 'done' }, gear: { weapon: { slot: 'weapon', wt: 'sword', base: 'ロングソード', main: { id: 'atk', v: 10 }, affs: [], rar: 0, ilvl: 1, lv: 1 } } })));
game.reload(); const legacy = game.run(() => S.gear.weapon.element);


console.log('\n深度帯ごとの属性分布');
console.table(report.distribution.map(row => ({ 深度帯: row.band, 火: `${(row.fire * 100).toFixed(1)}%`, 水: `${(row.water * 100).toFixed(1)}%`, 木: `${(row.wood * 100).toFixed(1)}%`, 光: `${(row.light * 100).toFixed(1)}%`, 闇: `${(row.dark * 100).toFixed(1)}%` })));
console.log('\n1フロア内の優勢属性比率');
console.table(report.floorRatios.map(row => ({ 深度: row.floor, 優勢比率: `${(row.ratio * 100).toFixed(1)}%` })));
console.log('\n共鳴ビルドの到達深度');
console.table([...report.reaches, report.neutral].map(row => ({ 属性: row.element, '50%死亡深度': row.depth, 死亡率: `${(row.deathRate * 100).toFixed(1)}%` })));
console.log('\n実フロアのクリア時間');
console.table([{ 有利帯: report.clearTimes.advantageFloors.join(','), 有利秒: report.clearTimes.advantage?.toFixed(2), 不利帯: report.clearTimes.disadvantageFloors.join(','), 不利秒: report.clearTimes.disadvantage?.toFixed(2), 時間比: report.clearTimes.advantage && (report.clearTimes.disadvantage / report.clearTimes.advantage).toFixed(2), 無属性比: report.clearTimes.neutralAdvantage && (report.clearTimes.neutralDisadvantage / report.clearTimes.neutralAdvantage).toFixed(2) }]);
console.log('実生成敵への通常攻撃ダメージ', report.damage);
console.log('深度150不利帯の進行', report.adverseProgress);

for (const row of report.distribution) for (const element of ['fire', 'water', 'wood']) if (row[element] < .20 || row[element] > .26) throw new Error(`${row.band} ${element}: ${(row[element] * 100).toFixed(1)}% は20〜26%の範囲外`);
for (const row of report.distribution) for (const element of ['light', 'dark']) if (row[element] < .11 || row[element] > .17) throw new Error(`${row.band} ${element}: ${(row[element] * 100).toFixed(1)}% は11〜17%の範囲外`);
for (const row of report.floorRatios) if (row.ratio < .60 || row.ratio > .70) throw new Error(`深度${row.floor}: 優勢比率 ${(row.ratio * 100).toFixed(1)}% は60〜70%の範囲外`);
const expected = { fire: { wood: 1.5, water: .5 }, water: { fire: 1.5, wood: .5 }, wood: { water: 1.5, fire: .5 }, light: { dark: 1.3, fire: 1 }, dark: { light: 1.3, fire: 1 } };
for (const [attacker, defenders] of Object.entries(expected)) for (const [defender, multiplier] of Object.entries(defenders)) if (report.matchup.find(row => row.attacker === attacker && row.defender === defender).multiplier !== multiplier) throw new Error(`${attacker}→${defender} の倍率が${multiplier}ではない`);
for (const row of report.resonanceRows) if (row.stage !== 2 || row.count !== 5) throw new Error(`${row.element}の5個共鳴が中共鳴にならない`);
if (report.neutralBonus.resonance.stage !== 0 || Math.abs(report.neutralBonus.actualMain / report.neutralBonus.elementalMain - 1.02) > .01) throw new Error('無属性装備の共鳴除外または基礎値1.02倍が不正');
const depths = report.reaches.map(row => row.depth), min = Math.min(...depths), max = Math.max(...depths);
if (max - min > 10) throw new Error(`5属性の50%死亡深度差 ${min}〜${max} は±5（全幅10）を超える`);
const resonanceAverage = report.reaches.reduce((sum, row) => sum + row.depth, 0) / report.reaches.length, neutralGap = resonanceAverage - report.neutral.depth;
if (neutralGap < 5 || neutralGap > 15) throw new Error(`属性平均−無属性の到達深度差 ${neutralGap.toFixed(1)} は+5〜+15層の範囲外`);
const primaryMax = Math.max(...report.reaches.filter(row => ['fire', 'water', 'wood'].includes(row.element)).map(row => row.depth));
for (const row of report.reaches.filter(row => ['light', 'dark'].includes(row.element))) if (row.depth - primaryMax >= 3) throw new Error(`${row.element}の到達深度${row.depth}は火水木最高${primaryMax}を3層以上上回る`);
if (report.clearTimes.advantage == null || report.clearTimes.disadvantage == null) throw new Error('有利帯・不利帯を実戦闘でクリアできなかった');
const elementalTimeRatio = report.clearTimes.disadvantage / report.clearTimes.advantage;
if (elementalTimeRatio < 2) throw new Error(`有利帯・不利帯のクリア時間比 ${elementalTimeRatio.toFixed(2)} は2.0未満`);
if (report.clearTimes.neutralAdvantage == null || report.clearTimes.neutralDisadvantage == null) throw new Error('無属性で有利帯・不利帯を実戦闘でクリアできなかった');
const neutralTimeRatio = Math.max(report.clearTimes.neutralAdvantage, report.clearTimes.neutralDisadvantage) / Math.min(report.clearTimes.neutralAdvantage, report.clearTimes.neutralDisadvantage);
if (neutralTimeRatio > 1.2) throw new Error(`無属性の帯間クリア時間比 ${neutralTimeRatio.toFixed(2)} は1.2を超える`);
if (Object.values(report.damage).some(value => value == null)) throw new Error('実生成敵への通常攻撃ダメージを測定できなかった');
if (report.damage.normalNeutral <= report.damage.normalResonance) throw new Error(`普通の敵への与ダメージ 無属性${report.damage.normalNeutral.toFixed(1)} は属性5個共鳴${report.damage.normalResonance.toFixed(1)}以下`);
if (report.damage.weakResonance < report.damage.weakNeutral * 1.8) throw new Error(`弱点の敵への属性5個共鳴ダメージ${report.damage.weakResonance.toFixed(1)}は無属性${report.damage.weakNeutral.toFixed(1)}の1.8倍未満`);
if (report.adverseProgress.progressed === 0) throw new Error(`深度${report.adverseProgress.floor}の不利帯で属性ビルドが24/24回、一体も倒せず進行不能`);
if (legacy !== 'neutral') throw new Error('既存セーブ装備が無属性へ移行されない');
console.log('既存セーブ移行', legacy);
