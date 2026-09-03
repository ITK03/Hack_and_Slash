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
  /* 装備深度は戦うフロアに合わせる。以前は深度50固定の装備で深度29〜32を殴っており、
     敵HP250〜530に対して通常攻撃が505〜666と、どのビルドも全敵を一撃で倒していた。
     属性倍率は過剰火力に吸われ、有利でも不利でも同じ秒数になる（実測の差は1.10倍）。
     装備とフロアを揃えると本来の差が出る（同1.32倍、深度71では1.57倍）。 */
  /* ここで測りたいのは「片付く速さ」だけ。倒れるかどうかは到達深度の項で別に測る。
     被弾を受けたままだと、敵の攻撃力を上げた（ENEMY_DMG_MUL 1.80→2.00）とたんに
     不利帯でボットが倒れ、秒数そのものが取れなくなった。倒れた回を除くと
     「たまたま生き残った回」だけの平均になり、比の意味も変わってしまう。
     被弾を無視して、与ダメージ側だけを見る。 */
  function clearTime(floor, element) {
    prepare(); _s = 0x51f15e; equip(floor, element); S.p = newPlayer(); _s = 0xdecafbad; enterFloor(floor);
    S.returnInvulnerable = true;
    const result = runCombat(90);
    S.returnInvulnerable = false;
    if (!result.cleared) return null; return result.elapsed;
  }
  function routeTime(floors, element) {
    const times = floors.map(floor => clearTime(floor, element));
    return times.some(time => time == null) ? null : times.reduce((sum, time) => sum + time, 0) / times.length;
  }
  /* 31〜34は木優勢（火が有利）、26〜29は水優勢（火が不利）。属性の巡回は5層ごとなので、
     51/52・46 と同じ関係が25層（5巡）浅いここでも成り立つ。
     測る層を下げたのは、全滅の不具合を直して死亡が死亡として数えられるようになった結果、
     無属性の到達深度が44になり、51層は「そもそも到達できない深さ」になったため
     （クリア秒数が取れず null になっていた）。判定の閾値は動かしていない。 */
  /* 深さを揃えたくて不利帯を28/29に寄せてみたが、火ビルドが28層をクリアできず
     秒数そのものが取れなくなった（不利帯は不利なので、有利帯と同じ深さでは走れない）。
     帯が5層ごとに巡る以上、有利帯と不利帯の深さは必ずずれる。
     そのずれは下の判定で「無属性の同じ2帯の比」で割って打ち消す。 */
  const advantageFloors = [31, 32], disadvantageFloors = [26];
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
  /* 「帯に合わせると得か」を死亡率で測るのはやめた。
     この検査の勝敗は「90秒で敵を掃除しきれたか」で決まるため、深度に対して
     ほぼ二値で切り替わる（実測: 深度40で死亡率2.5%、深度45で92%）。
     その外側ではどのビルドも0%か100%に張り付き、差が出ない。実際、同じ検査が
     深度57〜67では +18.8pt、深度50〜60では -1.6pt を返したが、両者のゲーム本体の
     難度は同一だった（同一条件で 92.2% と 90.6%）。符号すら標本位置で変わる以上、
     判定には使えない。属性の価値は飽和しないクリア時間で測る。 */
  return { distribution, floorRatios, matchup, resonanceRows, resonanceStages, incoming, neutralBonus, neutralBase: NEUTRAL_BASE, reaches, neutral, matched, clearTimes, damage, adverseProgress };

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
console.table([{ 有利帯: report.clearTimes.advantageFloors.join(','), 有利秒: report.clearTimes.advantage?.toFixed(2), 不利帯: report.clearTimes.disadvantageFloors.join(','), 不利秒: report.clearTimes.disadvantage?.toFixed(2), 時間比: report.clearTimes.advantage && (report.clearTimes.disadvantage / report.clearTimes.advantage).toFixed(2), 無属性比: report.clearTimes.neutralAdvantage && (report.clearTimes.neutralDisadvantage / report.clearTimes.neutralAdvantage).toFixed(2), 無属性有利秒: report.clearTimes.neutralAdvantage?.toFixed(2), 合わせた速さ: report.clearTimes.advantage && (report.clearTimes.neutralAdvantage / report.clearTimes.advantage).toFixed(2) }]);
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
/* 属性を固定したまま全帯を潜る運用は、無属性より上には出ないこと（放置で得をさせない）。
   下振れ側は無属性の主能力1.15倍ぶんだけ沈むのが正常なので、-8層まで許す。
   ここを対称にすると、1.15倍の存在自体と矛盾してテストが通らなくなる。 */
/* 到達深度どうしの引き算は敵編成を変えるたびに5〜12層動くため、判定には使わない。
   属性の価値はクリア時間で判定する（下の MATCHED_TIME_MIN_RATIO）。ここは参考表示のみ。 */
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
/* 有利帯は不利帯よりはっきり速く片付くこと。
   ただし帯は5層ごとに巡るので、有利帯と不利帯は必ず数層ぶん深さが違う。
   その深さの差そのものが秒数に出るため、生の比では属性の効果と混ざる
   （浅い層ほど比率としての差が大きく、実測で無属性でも1.32倍付いた）。
   そこで無属性の同じ2帯の比で割り、深さの影響を打ち消してから判定する。
   下限1.7は据え置き。 */
const neutralBandRatio = report.clearTimes.neutralDisadvantage / report.clearTimes.neutralAdvantage;
const elementalTimeRatio = (report.clearTimes.disadvantage / report.clearTimes.advantage) / neutralBandRatio;
const CLEAR_TIME_MIN_RATIO = 1.7;
if (elementalTimeRatio < CLEAR_TIME_MIN_RATIO) throw new Error(`深さの差を除いた有利帯・不利帯のクリア時間比 ${elementalTimeRatio.toFixed(2)} は${CLEAR_TIME_MIN_RATIO}未満`);
/* 帯に合わせる価値の本判定。同じ有利帯を、合わせたビルドと無属性で走らせて
   クリア時間を比べる。死亡率と違い飽和しないので、敵編成を入れ替えても意味が変わらない。
   共鳴5個で与ダメージ4.5倍・被ダメージ0.75倍が乗るぶん、明確に速くなること。 */
const MATCHED_TIME_MIN_RATIO = 1.25;
const matchedTimeRatio = report.clearTimes.neutralAdvantage / report.clearTimes.advantage;
if (!(matchedTimeRatio >= MATCHED_TIME_MIN_RATIO)) throw new Error(`有利帯を、帯に合わせたビルドは無属性の ${matchedTimeRatio.toFixed(2)}倍の速さでしか片付けられない（${MATCHED_TIME_MIN_RATIO}倍以上あること）`);
if (report.clearTimes.neutralAdvantage == null || report.clearTimes.neutralDisadvantage == null) throw new Error('無属性で有利帯・不利帯を実戦闘でクリアできなかった');
/* 無属性の帯間比はもう合否に使わない。帯が5層ごとに巡る以上、
   有利帯と不利帯には必ず深さの差があり、無属性でも秒数は揃わない。
   この値は上の割り算で深さの影響を除くために使うので、数字だけ残す。 */
if (Object.values(report.damage).some(value => value == null)) throw new Error('実生成敵への通常攻撃ダメージを測定できなかった');
if (report.damage.normalNeutral <= report.damage.normalResonance) throw new Error(`普通の敵への与ダメージ 無属性${report.damage.normalNeutral.toFixed(1)} は属性5個共鳴${report.damage.normalResonance.toFixed(1)}以下`);
if (report.damage.weakResonance < report.damage.weakNeutral * 1.8) throw new Error(`弱点の敵への属性5個共鳴ダメージ${report.damage.weakResonance.toFixed(1)}は無属性${report.damage.weakNeutral.toFixed(1)}の1.8倍未満`);
if (report.adverseProgress.progressed === 0) throw new Error(`深度${report.adverseProgress.floor}の不利帯で属性ビルドが24/24回、一体も倒せず進行不能`);
if (legacy !== 'neutral') throw new Error('既存セーブ装備が無属性へ移行されない');
console.log('既存セーブ移行', legacy);
