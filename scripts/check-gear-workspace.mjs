import assert from 'node:assert/strict';
import { loadGame } from './game-env.mjs';

const game = await loadGame();
const result = game.run(function () {
  S.tutorial = { phase: 'done' };
  const checks = [];
  for (const slot of SLOTK) {
    const valid = [];
    for (let i = 0; i < 120 && valid.length < 2; i++) {
      const item = makeItem(30, 0, 0, 2);
      if (gearCandidateAllowed(item, slot)) valid.push(item);
    }
    S.stash = valid;
    const shown = S.stash.filter(x => gearCandidateAllowed(x, slot));
    checks.push({
      slot,
      count: shown.length,
      allCorrectSlot: shown.every(x => x.slot === slot),
      allCorrectClass: shown.every(x => (!x.wt || WCLS[x.wt] === S.cls) && (!x.ac || x.ac === S.cls)),
    });
  }
  let candidate;
  do candidate = makeItem(30, 0, 0, 2); while (!gearCandidateAllowed(candidate, candidate.slot));
  S.stash = [candidate];
  const before = combatPower();
  const predicted = powerWith(candidate.slot, candidate);
  equipItem(candidate, candidate.slot);
  const actual = combatPower();
  return { checks, before, predicted, actual };
});

for (const row of result.checks) {
  assert.ok(row.count > 0, `${row.slot} の候補を生成できる`);
  assert.equal(row.allCorrectSlot, true, `${row.slot} 以外を候補に出さない`);
  assert.equal(row.allCorrectClass, true, `${row.slot} に他職装備を出さない`);
}
assert.equal(result.predicted, result.actual, '比較画面の戦闘力予測が装備後の実値と一致する');
console.table(result.checks);
console.log('戦闘力比較', { before: result.before, predicted: result.predicted, actual: result.actual });
console.log('部位別装備画面検査 passed');
