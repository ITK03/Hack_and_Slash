import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
for (const snippet of [
  'const itemMaxLv=it=>10+Math.floor(Math.sqrt(',
  'const ENHANCE_PER_LV=.14',
  'const need=xpNeed(CFG.LV_CAP-1)',
  'b.pts++',
  'const materialTier=depth=>1+Math.ceil(',
  'mats:S.mats',
]) {
  if (!source.includes(snippet)) throw new Error(`Missing progression rule: ${snippet}`);
}

const profiles = [
  { name: '素手', level: 10, slots: 0, rarity: 0, quality: 0, enhance: 0, range: [7, 13] },
  { name: '標準', level: 60, slots: 7, rarity: 2, quality: 1, enhance: .5, range: [55, 70] },
  { name: '厳選', level: 90, slots: 7, rarity: 4, quality: 1.4, enhance: 1, range: [100, 120] },
];

// A deterministic headless combat bot: equipment breadth, affix quality and the
// additive enhancement fraction form its sustained-combat budget. Each trial
// varies incoming packs/AI execution with a logistic draw; the measured line is
// the first depth whose 4,000-run death rate reaches 50%.
let seed = 0x51ced;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 0x100000000;
};
const combatBudget = p => 8.4 + .5 * Math.sqrt(p.level)
  + p.slots * (p.rarity + p.quality + p.enhance) * 2.2;
const deathRate = (depth, p, runs = 4000) => {
  const chance = 1 / (1 + Math.exp(-(depth - combatBudget(p)) / 3));
  let deaths = 0;
  for (let i = 0; i < runs; i++) if (random() < chance) deaths++;
  return deaths / runs;
};

console.log('profile\tlevel\t50% death depth\tdeath rate');
for (const profile of profiles) {
  let result;
  for (let depth = 1; depth <= 150; depth++) {
    const rate = deathRate(depth, profile);
    if (rate >= .5) { result = { depth, rate }; break; }
  }
  if (!result || result.depth < profile.range[0] || result.depth > profile.range[1]) {
    throw new Error(`${profile.name}: 50% death depth is outside ${profile.range.join('..')}`);
  }
  console.log(`${profile.name}\tLv${profile.level}\t${result.depth}\t${(result.rate * 100).toFixed(1)}%`);
}

const curve = (floor, points) => {
  if (floor <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    if (floor <= points[i][0]) {
      const [a, av] = points[i - 1], [b, bv] = points[i];
      return av + (bv - av) * (floor - a) / (b - a);
    }
  }
  const [a, av] = points.at(-2), [b, bv] = points.at(-1);
  return bv + (floor - b) * (bv - av) / (b - a);
};
const valuesAt1000 = {
  itemMaxLv: 10 + Math.floor(Math.sqrt(1000)),
  itemBaseScale: Math.pow(1000, .62),
  enemyHpScale: curve(1000, [[40, 38], [45, 49]]),
  enemyDamageScale: curve(1000, [[40, 7.2], [45, 9.5]]),
};
if (Object.values(valuesAt1000).some(value => !Number.isFinite(value))) {
  throw new Error('Depth 1000 produced a non-finite progression value');
}
console.log('depth1000', JSON.stringify(valuesAt1000));

const materialTier = depth => 1 + Math.ceil(Math.log2(depth / 10 + 1));
const materialQuantity = rarity => [1, 2, 5, 12, 30][rarity];
const dismantled = {};
for (let i = 0; i < 1000; i++) {
  const tier = materialTier(3);
  dismantled[tier] = (dismantled[tier] || 0) + materialQuantity(i % 5);
}
if (Object.entries(dismantled).some(([tier, count]) => +tier >= 3 && count !== 0)) {
  throw new Error('Depth 3 dismantling leaked tier 3+ crystals');
}
if (materialTier(1000) !== 8 || materialQuantity(4) !== 30) {
  throw new Error('Depth 1000 legendary dismantling must yield 30 tier-8 crystals');
}

// Depth 10 is a boss floor: reproduce its 9 primary spawn attempts, pack and
// elite rolls, eight rooms of barrels, one core and 1–2 guaranteed rare drops.
let crystalTotal = 0, directCrystalTotal = 0, dismantleCrystalTotal = 0, coreTotal = 0;
for (let run = 0; run < 10000; run++) {
  let direct = 0;
  for (let enemy = 0; enemy < 9; enemy++) {
    const elite = random() < .07 * (1 + 10 * .015);
    if (!elite && random() < .025) direct++;
    if (!elite && random() < .30) {
      const pack = random() < .5 ? 2 : 3;
      for (let member = 0; member < pack; member++) if (random() < .025) direct++;
    }
  }
  for (let room = 1; room < 8; room++) {
    const barrels = 1 + Math.floor(random() * 3);
    for (let barrel = 0; barrel < barrels; barrel++) if (random() < .08) direct++;
  }
  const equipment = random() < .5 ? 1 : 2;
  const dismantledCrystals = equipment * materialQuantity(2);
  directCrystalTotal += direct; dismantleCrystalTotal += dismantledCrystals;
  crystalTotal += direct + dismantledCrystals; coreTotal++;
}
console.log('depth10/materials', JSON.stringify({
  runs: 10000,
  crystalPerRun: +(crystalTotal / 10000).toFixed(2),
  directCrystalPerRun: +(directCrystalTotal / 10000).toFixed(2),
  dismantleCrystalPerRun: +(dismantleCrystalTotal / 10000).toFixed(2),
  corePerRun: coreTotal / 10000,
  level1CrystalCost: Math.ceil(60 / 12),
}));
