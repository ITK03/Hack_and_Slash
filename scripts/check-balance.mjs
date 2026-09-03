import { loadGame } from './game-env.mjs';
import { installDiveMeasurement } from './measure-dive.mjs';

const game = await loadGame();
installDiveMeasurement(game);

const sampleScale = Math.max(.05, Math.min(1, Number(process.env.BALANCE_SAMPLE_SCALE) || 1));
const report = game.run((sampleScale) => {
  /* 数千回の模擬戦ではトースト等のUIタイマーを発火させない。
     戦闘結果に関係しないクロージャを全試行ぶん保持するとNodeのヒープを使い切る。 */
  window.setTimeout = () => 0;
  window.setInterval = () => 0;
  const samplesFor = n => Math.max(3, Math.round(n * sampleScale));
  const economySamplesFor = n => Math.max(1, Math.round(n * sampleScale));
  const profiles = [
    /* 素手の帯は敵の解放深度に合わせた調整値。
       以前は9種すべてが深度9までに出そろい、装備なしでも早々に巨躯や爆ぜ手と
       当たって止まっていた。序盤を弱い3種だけにした分だけ、素手でも数層ぶん
       深くまで行けるようになっている（実測 12 → 14）。 */
    /* 50%死亡深度は5層ごとのボス床に当たったかどうかで階段状に飛ぶ。
       実測で 標準は 40:70% / 45:100% / 48:52% / 50:98% / 52:52% / 55:100% と
       ボス床だけが跳ね上がり、二分探索はそのどれに当たるかで決まっていた。
       探索をボス床以外に限ると素直に50%へ収束する（標準45層で46.3%、
       厳選97層で50.6%）。ボス床は別項目で測る。
       帯の値は「難易度を根本的に上げる」という指示を受けて引き下げた
       （旧: 標準55〜70 / 厳選95〜115）。緩めて通したのではなく、
       狙う手ごたえそのものを変えている。
       標準の下限は「もう少し難しく」という次の指示でさらに下げた
       （旧38〜55 → 34〜52）。敵の攻撃力を1.80→2.00にした実測では
       深度38のまま動かなかったが、38は旧下限の真上で、
       次に少しでも厳しくすると数字が正しくても失敗する位置にある。 */
    { name: '素手', level: 10, rarity: null, quality: null, enhance: 0, range: [5, 14] },
    { name: '標準', level: 60, rarity: 2, quality: 1, enhance: .5, range: [34, 52] },
    { name: '厳選', level: 90, rarity: 4, quality: 1.3, enhance: 1, range: [88, 108] },
  ];
  const slots = ['weapon', 'helm', 'armor', 'glove', 'boot', 'ring', 'amulet'];

  function equip(profile, depth) {
    S.gear = Object.fromEntries(slots.map(slot => [slot, null]));
    if (profile.rarity == null) return;
    for (const slot of slots) {
      let item;
      do item = makeItem(depth, 0, 0, profile.rarity); while (item.slot !== slot || item.rar !== profile.rarity || (item.ac && item.ac !== 'warrior'));
      for (const affix of item.affs) {
        const rule = AFF.find(candidate => candidate.id === affix.id);
        const step = rule.step || 1;
        affix.q = profile.quality;
        affix.v = Math.max(step, Math.round(rule.f(item.ilvl) * profile.quality / step) * step);
      }
      item.lv = 1 + Math.floor((itemMaxLv(item) - 1) * profile.enhance);
      // 属性を主題としない検査では共鳴を必ず0段階にする。neutral に揃えると
      // 基礎オプション1.15倍が乗るため、5属性を巡回させて散らす。
      item.element = ELEMENT_KEYS[slots.indexOf(slot) % ELEMENT_KEYS.length];
      item.score = iScore(item);
      S.gear[slot] = item;
    }
  }

  function trial(profile, depth, power = 1) {
    S.cls = 'warrior'; S.scene = 'dungeon'; S.paused = false; S.training = false; S.returnInvulnerable = false;
    S.base = { lv: profile.level, xp: 0, pts: 0, str: profile.level * 3, mag: 0, def: profile.level, agi: profile.level, spi: 0, luk: 0 };
    equip(profile, depth);
    S.p = newPlayer();
    S.p.mAtk *= power; S.p.sAtk *= power; S.p.max *= power; S.p.hp *= power;
    enterFloor(depth);
    HELD.fill(true);
    const step = .05, limit = 45;
    for (let elapsed = 0; elapsed < limit && S.scene === 'dungeon' && S.p.hp > 0 && S.enemies.length; elapsed += step) {
      let target = S.enemies[0], best = Infinity;
      for (const enemy of S.enemies) { const distance = d2(S.p.x, S.p.y, enemy.x, enemy.y); if (distance < best) { best = distance; target = enemy; } }
      const angle = Math.atan2(target.y - S.p.y, target.x - S.p.x);
      const desired = S.cls === 'warrior' ? 1.15 : 4;
      S.p.x = target.x - Math.cos(angle) * desired; S.p.y = target.y - Math.sin(angle) * desired; S.p.face = angle;
      update(step);
    }
    HELD.fill(false);
    return S.scene !== 'dungeon' || S.p.hp <= 0 || S.enemies.length > 0;
  }

  /* 二分探索は通常床だけで行う。ボス床は5層ごとに死亡率が跳ね上がるため、
     探索が「たまたまボス床に当たったか」で決まって階段状に飛んでいた
     （実測: 標準は 48層52% / 50層98% / 52層52%）。ボス床は別項目で測る。 */
  const plainDepth = depth => (depth % CFG.BOSS_EVERY === 0 ? depth + 1 : depth);

  function deathRate(profile, depth, runs, power = 1) {
    let deaths = 0;
    for (let run = 0; run < runs; run++) { _s = (depth * 2654435761 + run * 1013904223) >>> 0; deaths += trial(profile, depth, power); }
    return deaths / runs;
  }

  const combat = [];
  for (const profile of profiles) {
    let lower = 1, upper = 300;
    while (lower < upper) {
      const middle = Math.floor((lower + upper) / 2);
      if (deathRate(profile, plainDepth(middle), samplesFor(48)) >= .5) upper = middle; else lower = middle + 1;
    }
    const rate = deathRate(profile, plainDepth(lower), samplesFor(160));
    combat.push({ name: profile.name, level: profile.level, depth: lower, deathRate: rate, range: profile.range });
  }
  /* ボス床を外した通常床での死亡率。手ごたえの上下はここで見る。
     装備は必ずその深度に合わせるので、深度差ペナルティは中立に働く。 */
  /* 手ごたえの本判定。装備は必ずその深度に合わせるので、深度差ペナルティは中立に働く。
     ボス床と通常床は性質が違うので分けて測る。混ぜると平均が意味を失う。 */
  const plainFloors = { 素手: [6, 7, 8, 9], 標準: [42, 47, 52, 57, 62], 厳選: [82, 87, 92, 97] };
  const bossFloors = { 素手: [5, 10], 標準: [45, 50, 55, 60], 厳選: [85, 90, 95, 100] };
  const meanRate = (profile, depths) => {
    const rates = depths.map(depth => deathRate(profile, depth, samplesFor(48)));
    return rates.reduce((a, b) => a + b, 0) / rates.length;
  };
  const plain = profiles.map(profile => ({
    name: profile.name, depths: plainFloors[profile.name],
    rate: meanRate(profile, plainFloors[profile.name]),
    boss: meanRate(profile, bossFloors[profile.name]),
  }));

  const selected = profiles.find(profile => profile.name === '厳選');
  let boostedLower = combat.find(row => row.name === '厳選').depth, boostedUpper = 200;
  while (boostedLower < boostedUpper) { const middle = Math.floor((boostedLower + boostedUpper) / 2); if (deathRate(selected, plainDepth(middle), samplesFor(48), 2) >= .5) boostedUpper = middle; else boostedLower = middle + 1; }
  const powerGain = { base: combat.find(row => row.name === '厳選').depth, doubled: boostedLower, gain: boostedLower - combat.find(row => row.name === '厳選').depth };

  // A single dive always resolves floors 1..target depth through the shared helper.
  const economy = [10, 50, 100, 300, 1000].map(depth => {
    const item = makeItem(depth, 0, 0, 2); item.lv = 1; item.xp = 0;
    let cost = 0;
    while (item.lv < itemMaxLv(item)) { cost += crystalNeed(item); item.lv++; }
    const samples = economySamplesFor(depth <= 10 ? 80 : depth <= 50 ? 30 : depth <= 100 ? 16 : depth <= 300 ? 6 : 3);
    let yieldTotal = 0;
    for (let run = 0; run < samples; run++) yieldTotal += window.measureMaterialDive(depth);
    const yieldPerDive = yieldTotal / samples;
    return { depth, cost, yieldPerDive, dives: cost / yieldPerDive, tier: materialTier(depth), maxLevel: itemMaxLv(item), samples };
  });
  enterFloor(1000);
  const depth1000 = { entered: S.floor === 1000, enemies: S.enemies.length, finite: S.enemies.every(enemy => Number.isFinite(enemy.hp) && Number.isFinite(enemy.dmg)) };
  return { combat, plain, powerGain, economy, depth1000 };
}, sampleScale);

game.run(() => localStorage.setItem('descent_v5', JSON.stringify({
  cls: 'warrior', mats: { crystal: { 2: 7, 4: 3 }, core: { 3: 2 } }, tutorial: { phase: 'done' },
})));
game.reload();
const migratedSave = game.run(() => ({ scene: S.scene, mats: S.mats }));


console.log('\n到達深度実測');
console.table(report.combat.map(row => ({ プロファイル: row.name, レベル: row.level, '50%死亡深度': row.depth, 死亡率: `${(row.deathRate * 100).toFixed(1)}%` })));
console.log('床の種類ごとの死亡率（装備はその深度に合わせる）');
console.table(report.plain.map(row => ({ プロファイル: row.name, 測った深度: row.depths.join('/'), 通常床の死亡率: `${(row.rate * 100).toFixed(1)}%`, ボス床の死亡率: `${(row.boss * 100).toFixed(1)}%` })));
console.log('総合力2倍の到達深度', report.powerGain);
console.log('\n強化経済実測');
console.table(report.economy.map(row => ({ 深度: row.depth, 階梯: row.tier, 強化上限: row.maxLevel, 必要結晶: row.cost, '結晶/潜行': row.yieldPerDive.toFixed(2), 必要潜行数: row.dives.toFixed(1) })));
for (const row of report.combat) if (row.depth < row.range[0] || row.depth > row.range[1]) throw new Error(`${row.name}: 50%死亡深度 ${row.depth} は目標 ${row.range.join('〜')} の範囲外`);
/* 通常床の死亡率。これが手ごたえの本体で、5層ごとのボス床に振り回されない。
   下限を割れば「装備が合っていれば流せる」に戻った合図、上限を超えれば
   その深度の装備をそろえても通常床で立ち行かない。 */
/* 素手は数字を出すだけで判定しない。測れる深度が 6〜9 しかなく、
   深度差ペナルティが効き始める GEAR_GAP_FREE(8) をまたぐので、
   「ペナルティ前」と「ペナルティ後」が1つの平均に混ざって意味を持たない。 */
/* 標準の帯は「もう少し難しく」という指示で 42〜70% から 50〜80% へ上げた。
   敵の攻撃力を 1.80→2.00 にした実測が 66.7% → 72.5%。
   下限を上げているのが本体で、これは「また流せる手ごたえに戻ったら失敗させる」
   ための線。上限を70→80に動かしたのは、狙った72.5%を収めるため。
   厳選は 37.0% → 39.6% とほぼ動かず、旧帯の真ん中のままなので触らない。 */
const plainTarget = { 標準: [.50, .80], 厳選: [.25, .55] };
for (const row of report.plain) {
  const target = plainTarget[row.name]; if (!target) continue;
  const [lo, hi] = target;
  if (row.rate < lo || row.rate > hi)
    throw new Error(`${row.name}: 通常床の死亡率 ${(row.rate * 100).toFixed(1)}% は目標 ${(lo * 100)}〜${(hi * 100)}% の範囲外`);
  /* ボス床は通常床よりはっきり重いこと。ただし全滅では関門にならない。
     この検査の相手は回避も回復もしない当たり役なので、上限は甘めに取る。 */
  if (row.boss <= row.rate)
    throw new Error(`${row.name}: ボス床の死亡率 ${(row.boss * 100).toFixed(1)}% が通常床 ${(row.rate * 100).toFixed(1)}% 以下`);
}
if (report.powerGain.gain < 10 || report.powerGain.gain > 20) throw new Error(`総合力2倍の到達深度増分 +${report.powerGain.gain} は+10〜+20の範囲外`);
for (const row of report.economy) if (row.dives < 20 || row.dives > 40) throw new Error(`深度${row.depth}: ${row.dives.toFixed(1)}潜行は20〜40の範囲外`);
if (!report.depth1000.entered || !report.depth1000.finite) throw new Error('深度1000への潜行に失敗');
if (migratedSave.mats.crystal[1] !== 7 || migratedSave.mats.crystal[3] !== 3 || migratedSave.mats.core[2] !== 2) throw new Error('旧セーブの階梯移行に失敗');
console.log('\n深度1000潜行', report.depth1000);
console.log('旧セーブ移行', migratedSave);
