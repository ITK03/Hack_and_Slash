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
/* 100層で7部位すべてを厳選したときの上限。
   旧目標は crit .25 / cdmg 2.5 / stRes .2 / dodge .15 / as 2.5 / ms 2.5 / ls .1 / mf .25。
   この検査は無属性の装備で測っており、旧値には無属性の上乗せ(NEUTRAL_BASE 1.15)が
   そのまま乗っていた。上乗せは「無属性は共鳴しない代わりに主ステータスが高い」という
   決めごとなのに、オプションにも掛かっていて、上限そのものが装備の属性で変わっていた。
   オプションから外したので、ここは AFF の表が本当に出せる値へ置き直す（いずれも旧値の約87%）。
   数字を緩めたのではなく、上乗せを二重に数えていたのをやめた結果の実値。 */
for (const [id, target] of Object.entries({ crit: .22, cdmg: 2.368, stRes: .175, dodge: .133, as: 2.33, ms: 2.33, ls: .091, mf: .217 }))
  assert.ok(Math.abs(report.peaks[id] - target) <= .005, `${id} の100層厳選値 ${report.peaks[id]} ≒ ${target}`);

console.log('装備オプション整合・100層厳選上限検査 passed');
