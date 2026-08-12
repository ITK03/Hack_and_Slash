import { loadGame } from './game-env.mjs';

const game = await loadGame();
const report = game.run(() => {
  const xpPerDive = 197540, levels = [90, 100, 110];
  const dives = levels.map(level => ({ level, depth: 100, cumulativeXP: xpCum(level), dives: xpCum(level) / xpPerDive }));
  const anchors = CFG.XP_ANCHOR.map(([level, cumulativeXP]) => ({ level, cumulativeXP, actual: xpCum(level) }));
  S.base = { lv: 100, xp: xpNeed(100) - 1, pts: 0, str: 0, mag: 0, def: 0, agi: 0, spi: 0, luk: 0 };
  S.cls = 'warrior'; S.p = newPlayer(); gainXP(1);
  const unlimited = { level: S.base.lv, points: S.base.pts, xp: S.base.xp };
  return { dives, anchors, unlimited, acceleration: { start: CFG.ENEMY_ACCEL_START, growth: CFG.ENEMY_ACCEL_GROWTH } };
});

const oldSave = { cls: 'warrior', tutorial: { phase: 'done' }, base: { lv: 100, xp: 12345, pts: 7, para: 8, str: 200, mag: 3, def: 100, agi: 90, spi: 4, luk: 2 } };
game.run(save => localStorage.setItem('descent_v5', JSON.stringify(save)), oldSave);
game.reload();
const migration = game.run(() => ({ ...S.base }));

console.log('\nXP曲線実測（深度100周回、1潜行197,540 XP）');
console.table(report.dives.map(row => ({ レベル: row.level, 仮定深度: row.depth, 累積XP: row.cumulativeXP, 必要潜行数: row.dives.toFixed(1) })));
console.log('Lv40までのアンカー', report.anchors);
console.log('Lv100以降の通常レベルアップ', report.unlimited);
console.log('旧セーブ移行', migration);

const ranges = { 90: [150, 250], 100: [350, 600], 110: [2000, 4000] };
for (const row of report.dives) if (row.dives < ranges[row.level][0] || row.dives > ranges[row.level][1]) throw new Error(`Lv${row.level}: ${row.dives.toFixed(1)}潜行は範囲外`);
for (const row of report.anchors) if (row.actual !== row.cumulativeXP) throw new Error(`Lv${row.level}の既存XPアンカーが変化`);
if (report.unlimited.level !== 101 || report.unlimited.points !== 5 || report.unlimited.xp !== 0) throw new Error('Lv100以降の通常レベルアップが不正');
for (const stat of ['str', 'mag', 'def', 'agi', 'spi', 'luk']) if (migration[stat] !== oldSave.base[stat]) throw new Error(`移行で${stat}が失われた`);
if ('para' in migration || migration.lv <= 100 || migration.pts < oldSave.base.pts) throw new Error('旧レベル・XP・能力ポイントの移行が不正');
