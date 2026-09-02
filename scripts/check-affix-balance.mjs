import assert from 'node:assert/strict';
import { loadGame } from './game-env.mjs';

const game = await loadGame();
const report = game.run(() => {
  S.cls = 'warrior'; S.avatars.warrior = 'gai';
  S.base = { lv: 100, xp: 0, pts: 0, str: 0, mag: 0, def: 9999, agi: 9999, spi: 0, luk: 0 };
  S.gear = emptyGear();
  const naked = derive();
  S.base.agi = 0;
  const peaks = {};
  for (const id of ['crit', 'cdmg', 'stRes', 'dodge', 'as', 'ms', 'ls', 'mf']) {
    S.gear = emptyGear(); const rule = AFF.find(a => a.id === id), step = rule.step || 1;
    for (const slot of SLOTK) {
      const v = Math.max(step, Math.round(rule.f(100) * 1.35 / step) * step);
      S.gear[slot] = { slot, element: 'neutral', lv: 1, ilvl: 100, main: null, affs: [{ id, v }], pw: null };
    }
    const d = derive(); peaks[id] = id === 'mf' ? d.dropRate : d[id];
  }
  return { ids: AFF.map(a => a.id), affixNames: AFF.map(a => a.n).sort(), shownNames: DSHOW.map(a => a[1]).sort(),
    mainIds: SLOTS.map(s => s.main), naked: { crit: naked.crit, stRes: naked.stRes, dodge: naked.dodge }, peaks };
});

for (const removed of ['atkP', 'dr', 'rng']) assert.ok(!report.ids.includes(removed), `${removed} は抽選対象外`);
for (const added of ['mpF', 'stRes', 'dodge']) assert.ok(report.ids.includes(added), `${added} は抽選対象`);
assert.equal(Array.from(report.affixNames).join('|'), Array.from(report.shownNames).join('|'), '全ステータスと抽選オプションが一致');
for (const id of report.mainIds) assert.ok(report.ids.includes(id), `主能力 ${id} も全ステータス内に存在`);
assert.equal(report.naked.crit, .01, '能力値を振ってもクリティカル率は1%のまま');
assert.equal(report.naked.stRes, 0, '能力値を振っても状態異常耐性は0%のまま');
assert.equal(report.naked.dodge, 0, '能力値を振っても回避率は0%のまま');
for (const [id, target] of Object.entries({ crit: .25, cdmg: 2.5, stRes: .2, dodge: .15, as: 2.5, ms: 2.5, ls: .1, mf: .25 }))
  assert.ok(Math.abs(report.peaks[id] - target) <= .005, `${id} の100層厳選値 ${report.peaks[id]} ≒ ${target}`);

console.log('装備オプション整合・100層厳選上限検査 passed');
