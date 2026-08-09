import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const gamePath = fileURLToPath(new URL('../public/index.html', import.meta.url));
const server = createServer(async (_request, response) => {
  response.setHeader('content-type', 'text/html; charset=utf-8');
  response.end(await readFile(gamePath));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${port}`);

const report = await page.evaluate(() => {
  const profiles = [
    { name: '素手', level: 10, rarity: null, quality: null, enhance: 0, range: [7, 13] },
    { name: '標準', level: 60, rarity: 2, quality: 1, enhance: .5, range: [55, 70] },
    { name: '厳選', level: 90, rarity: 4, quality: 1.4, enhance: 1, range: [100, 120] },
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
        affix.q = profile.quality;
        affix.v = Math.max(1, Math.round(rule.f(item.ilvl) * profile.quality));
      }
      item.lv = 1 + Math.floor((itemMaxLv(item) - 1) * profile.enhance);
      item.score = iScore(item);
      S.gear[slot] = item;
    }
  }

  function trial(profile, depth) {
    S.cls = 'warrior'; S.scene = 'dungeon'; S.paused = false; S.training = false; S.returnInvulnerable = false;
    S.base = { lv: profile.level, xp: 0, pts: 0, str: profile.level * 3, mag: 0, def: profile.level, agi: profile.level, spi: 0, luk: 0 };
    equip(profile, depth);
    S.p = newPlayer();
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

  function deathRate(profile, depth, runs) {
    let deaths = 0;
    for (let run = 0; run < runs; run++) deaths += trial(profile, depth);
    return deaths / runs;
  }

  const combat = [];
  for (const profile of profiles) {
    let lower = 1, upper = 150;
    while (lower < upper) {
      const middle = Math.floor((lower + upper) / 2);
      if (deathRate(profile, middle, 48) >= .5) upper = middle; else lower = middle + 1;
    }
    const rate = deathRate(profile, lower, 160);
    combat.push({ name: profile.name, level: profile.level, depth: lower, deathRate: rate, range: profile.range });
  }

  // A dive sample is produced by the real floor generator and reward handlers.
  // Every spawned enemy and barrel is resolved through the game's own hit/drop path.
  function materialDive(depth) {
    S.cls = 'warrior'; S.base = { lv: 100, xp: 0, pts: 0, str: 500, mag: 0, def: 500, agi: 500, spi: 0, luk: 0 };
    S.gear = {}; S.p = newPlayer(); S.scene = 'dungeon'; S.paused = false; S.training = false;
    enterFloor(depth);
    for (const prop of S.props) if (prop.t === 'barrel') breakPot(prop);
    while (S.enemies.length) { const enemy = S.enemies[0]; hurtE(enemy, enemy.hp + enemy.shield + 1, false, 0, 0, true); }
    let crystals = 0;
    for (const drop of S.drops) {
      if (drop.mat === 'crystal') crystals += drop.n;
      if (drop.it) crystals += crystalQty(drop.it);
    }
    return crystals;
  }
  const economy = [10, 50, 100, 300, 1000].map(depth => {
    const item = makeItem(depth, 0, 0, 2); item.lv = 1; item.xp = 0;
    let cost = 0;
    while (item.lv < itemMaxLv(item)) { cost += crystalNeed(item); item.lv++; }
    let yieldTotal = 0;
    for (let run = 0; run < 400; run++) yieldTotal += materialDive(depth);
    const yieldPerDive = yieldTotal / 400;
    return { depth, cost, yieldPerDive, dives: cost / yieldPerDive, tier: materialTier(depth), maxLevel: itemMaxLv(item) };
  });
  enterFloor(1000);
  const depth1000 = { entered: S.floor === 1000, enemies: S.enemies.length, finite: S.enemies.every(enemy => Number.isFinite(enemy.hp) && Number.isFinite(enemy.dmg)) };
  return { combat, economy, depth1000 };
});

await page.evaluate(() => localStorage.setItem('descent_v5', JSON.stringify({
  cls: 'warrior', mats: { crystal: { 2: 7, 4: 3 }, core: { 3: 2 } }, tutorial: { phase: 'done' },
})));
await page.reload();
const migratedSave = await page.evaluate(() => ({ scene: S.scene, mats: S.mats }));

await browser.close();
await new Promise(resolve => server.close(resolve));
console.log('\n到達深度実測');
console.table(report.combat.map(row => ({ プロファイル: row.name, レベル: row.level, '50%死亡深度': row.depth, 死亡率: `${(row.deathRate * 100).toFixed(1)}%` })));
console.log('\n強化経済実測');
console.table(report.economy.map(row => ({ 深度: row.depth, 階梯: row.tier, 強化上限: row.maxLevel, 必要結晶: row.cost, '結晶/潜行': row.yieldPerDive.toFixed(2), 必要潜行数: row.dives.toFixed(1) })));
for (const row of report.combat) if (row.depth < row.range[0] || row.depth > row.range[1]) throw new Error(`${row.name}: 50%死亡深度 ${row.depth} は目標 ${row.range.join('〜')} の範囲外`);
for (const row of report.economy) if (row.dives < 20 || row.dives > 40) throw new Error(`深度${row.depth}: ${row.dives.toFixed(1)}潜行は20〜40の範囲外`);
if (!report.depth1000.entered || !report.depth1000.finite) throw new Error('深度1000への潜行に失敗');
if (migratedSave.mats.crystal[1] !== 7 || migratedSave.mats.crystal[3] !== 3 || migratedSave.mats.core[2] !== 2) throw new Error('旧セーブの階梯移行に失敗');
console.log('\n深度1000潜行', report.depth1000);
console.log('旧セーブ移行', migratedSave);
