import assert from 'node:assert/strict';
import { loadGame } from './game-env.mjs';

const game = await loadGame();

const before = game.run(function () {
  S.deepest = 1;
  S.gold = 0;
  S.reachClaims = {};
  return {
    claimed: claimReachMission(10),
    gold: S.gold,
    marks: { ...S.reachClaims },
  };
});
assert.equal(before.claimed, false, '深度1では10F到達報酬を受け取れない');
assert.equal(before.gold, 0, '未到達時に報酬が増えない');
assert.equal(Object.keys(before.marks).length, 0, '未到達時に受取済みにならない');

const after = game.run(function () {
  S.deepest = 10;
  const first = claimReachMission(10);
  const gold = S.gold;
  const second = claimReachMission(10);
  return { first, second, gold, claimed: S.reachClaims[10] };
});
assert.equal(after.first, true, '10F到達後は報酬を受け取れる');
assert.equal(after.second, false, '同じ到達報酬は二重受領できない');
assert.equal(after.gold, 1500);
assert.equal(after.claimed, true);

console.table({ '深度1の新規セーブ': before, '10F到達後': after });
console.log('到達報酬検査 passed');
