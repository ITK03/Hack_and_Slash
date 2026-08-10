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

  function runCombat(limit = 45) {
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

  function trial(depth, element, run) {
    prepare(); _s = (depth * 2654435761 + run * 1013904223) >>> 0; equip(depth, element); S.p = newPlayer(); enterFloor(depth);
    return !runCombat().cleared;
  }
  function deathRate(depth, element, runs = 48) { let deaths = 0; for (let run = 0; run < runs; run++) deaths += trial(depth, element, run); return deaths / runs; }
  // check-balance.mjs と同じ二分探索・48試行・境界160試行。
  function boundary(element) {
    let lower = 1, upper = 300;
    while (lower < upper) { const middle = Math.floor((lower + upper) / 2); if (deathRate(middle, element, 48) >= .5) upper = middle; else lower = middle + 1; }
    return { element, depth: lower, deathRate: deathRate(lower, element, 160) };
  }

  const bands = [[1, 20], [21, 50], [51, 100], [101, 300]], distribution = [], floorRatios = [];
  prepare(); S.gear = {}; S.p = newPlayer();
  for (const [lo, hi] of bands) {
    const count = Object.fromEntries(elements.map(element => [element, 0])); let total = 0;
    for (let floor = lo; floor <= hi; floor++) {
      _s = (floor * 2654435761) >>> 0; enterFloor(floor);
      const normal = S.enemies.filter(enemy => !enemy.boss), dominant = dominantElement(floor);
      floorRatios.push({ floor, ratio: normal.filter(enemy => enemy.element === dominant).length / normal.length });
      for (const enemy of normal) { count[enemy.element]++; total++; }
    }
    distribution.push({ band: `${lo}-${hi}`, ...Object.fromEntries(elements.map(element => [element, count[element] / total])) });
  }

  const matchup = [];
  for (const attacker of [...elements, 'neutral']) for (const defender of [...elements, 'neutral']) matchup.push({ attacker, defender, multiplier: elementMultiplier(attacker, defender) });
  const resonanceRows = elements.map(element => { prepare(); equip(50, element); return { element, ...resonance() }; });
  prepare(); equip(50, 'neutral');
  const neutralResonance = resonance(), neutralMain = mainV(S.gear.weapon); S.gear.weapon.element = 'fire';
  const neutralBonus = { resonance: neutralResonance, actualMain: neutralMain, elementalMain: mainV(S.gear.weapon) };

  // 合成敵や hurtE の直呼びは使わず、同一装備・Lv・乱数種で実フロアを生成し update() だけで全滅させる。
  function clearTime(floor) {
    prepare(); _s = 0x51f15e; equip(50, 'fire'); S.p = newPlayer(); _s = 0xdecafbad; enterFloor(floor);
    const result = runCombat(90); if (!result.cleared) return null; return result.elapsed;
  }
  const clearTimes = { advantageFloor: 43, disadvantageFloor: 42, advantage: clearTime(43), disadvantage: clearTime(42) };
  const reaches = elements.map(boundary), neutral = boundary('neutral');
  return { distribution, floorRatios, matchup, resonanceRows, neutralBonus, reaches, neutral, clearTimes };
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
console.table([{ 有利フロア: report.clearTimes.advantageFloor, 有利秒: report.clearTimes.advantage?.toFixed(2), 不利フロア: report.clearTimes.disadvantageFloor, 不利秒: report.clearTimes.disadvantage?.toFixed(2), 時間比: report.clearTimes.advantage && (report.clearTimes.disadvantage / report.clearTimes.advantage).toFixed(2) }]);

for (const row of report.distribution) for (const element of ['fire', 'water', 'wood']) if (row[element] < .20 || row[element] > .26) throw new Error(`${row.band} ${element}: ${(row[element] * 100).toFixed(1)}% は20〜26%の範囲外`);
for (const row of report.distribution) for (const element of ['light', 'dark']) if (row[element] < .11 || row[element] > .17) throw new Error(`${row.band} ${element}: ${(row[element] * 100).toFixed(1)}% は11〜17%の範囲外`);
for (const row of report.floorRatios) if (row.ratio < .60 || row.ratio > .70) throw new Error(`深度${row.floor}: 優勢比率 ${(row.ratio * 100).toFixed(1)}% は60〜70%の範囲外`);
const expected = { fire: { wood: 1.5, water: .6 }, water: { fire: 1.5, wood: .6 }, wood: { water: 1.5, fire: .6 }, light: { dark: 1.3 }, dark: { light: 1.3 } };
for (const [attacker, defenders] of Object.entries(expected)) for (const [defender, multiplier] of Object.entries(defenders)) if (report.matchup.find(row => row.attacker === attacker && row.defender === defender).multiplier !== multiplier) throw new Error(`${attacker}→${defender} の倍率が${multiplier}ではない`);
for (const row of report.resonanceRows) if (row.stage !== 2 || row.count !== 5) throw new Error(`${row.element}の5個共鳴が中共鳴にならない`);
if (report.neutralBonus.resonance.stage !== 0 || Math.abs(report.neutralBonus.actualMain / report.neutralBonus.elementalMain - 1.15) > .03) throw new Error('無属性装備の共鳴除外または基礎値1.15倍が不正');
const depths = report.reaches.map(row => row.depth), min = Math.min(...depths), max = Math.max(...depths);
if (max - min > 10) throw new Error(`5属性の50%死亡深度差 ${min}〜${max} は±5を超える`);
const triMax = Math.max(...report.reaches.filter(row => ['fire', 'water', 'wood'].includes(row.element)).map(row => row.depth));
for (const row of report.reaches.filter(row => ['light', 'dark'].includes(row.element))) if (row.depth - triMax >= 3) throw new Error(`${row.element}が火水木を${row.depth - triMax}層上回る`);
const resonanceAverage = report.reaches.reduce((sum, row) => sum + row.depth, 0) / report.reaches.length, neutralGap = resonanceAverage - report.neutral.depth;
if (neutralGap < 15 || neutralGap > 25) throw new Error(`無属性の到達深度差 ${neutralGap.toFixed(1)} は15〜25層の範囲外`);
if (report.clearTimes.advantage == null || report.clearTimes.disadvantage == null) throw new Error('有利・不利フロアを実戦闘でクリアできなかった');
if (report.clearTimes.disadvantage / report.clearTimes.advantage < 1.4) throw new Error('有利・不利フロアのクリア時間差が1.4倍未満');
if (legacy !== 'neutral') throw new Error('既存セーブ装備が無属性へ移行されない');
console.log('既存セーブ移行', legacy);
