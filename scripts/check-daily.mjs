import { loadGame } from './game-env.mjs';

const game = await loadGame();

const daily = game.run(() => {
  dailyClock = () => new Date(2026, 0, 2, 3, 59);
  S.daily = null;
  ensureDaily();
  dailyProgress('clear', 40);
  dailyProgress('kills', 123);
  dailyProgress('dismantled', 4);
  const beforeReset = { date: S.daily.date, ...S.daily, stamina: S.stamina };
  const diveMultipliers = [beginDailyDive(), beginDailyDive(), beginDailyDive(), beginDailyDive()];
  const afterFourDives = { stamina: S.stamina, diveMultipliers };

  dailyClock = () => new Date(2026, 0, 2, 4, 1);
  ensureDaily();
  const afterReset = { ...S.daily, stamina: S.stamina };

  S.deepest = 100;
  const shallow = { target: dailyClearTarget(), tier: materialTier(S.deepest) };
  dailyProgress('clear', shallow.target);
  const completedAt100 = dailyDone(0);
  claimDaily(0);
  const rewardedTierAt100 = Object.keys(S.mats.crystal).map(Number).sort((a, b) => b - a)[0];

  S.deepest = 1000;
  const deep = { target: dailyClearTarget(), tier: materialTier(S.deepest) };
  const remainsCompleteAfterDeepestChanges = dailyDone(0);
  return { beforeReset, afterFourDives, afterReset, shallow, deep, completedAt100, rewardedTierAt100, remainsCompleteAfterDeepestChanges };
});

if (daily.beforeReset.kills !== 123 || daily.beforeReset.dismantled !== 4 || daily.beforeReset.clear !== 40) throw new Error('日替わり任務の進捗を保持できない');
if (daily.afterFourDives.diveMultipliers.join(',') !== '2,2,2,1' || daily.afterFourDives.stamina !== 0) throw new Error('4潜行目の報酬倍率または潜行可否が不正');
if (daily.afterReset.kills || daily.afterReset.dismantled || daily.afterReset.clear || daily.afterReset.stamina !== 3) throw new Error('4:00の日次リセットに失敗');
if (!daily.completedAt100 || daily.rewardedTierAt100 !== daily.shallow.tier) throw new Error('任務の目標深度または報酬階梯が最深度に追従しない');
if (daily.deep.target <= daily.shallow.target || daily.deep.tier <= daily.shallow.tier || daily.remainsCompleteAfterDeepestChanges) throw new Error('最深度更新後に任務1が追従しない');

game.run(() => localStorage.setItem('descent_v5', JSON.stringify({
  cls: 'warrior', deepest: 12, stamina: 100, tutorial: { phase: 'done' },
})));
game.reload();
const legacy = game.run(() => ({ daily: S.daily, stamina: S.stamina, scene: S.scene }));
if (!legacy.daily || legacy.daily.kills || legacy.daily.dismantled || legacy.daily.clear || legacy.stamina !== 3 || legacy.scene !== 'town') throw new Error('既存セーブの日次状態初期化に失敗');

console.log('日次リセット', { before: daily.beforeReset, after: daily.afterReset });
console.log('4潜行の報酬倍率', daily.afterFourDives);
console.log('最深度追従', { shallow: daily.shallow, deep: daily.deep });
console.log('既存セーブ移行', legacy);


