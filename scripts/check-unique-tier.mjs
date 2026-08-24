import { loadGame } from './game-env.mjs';

const game = await loadGame();
const report = game.run(() => {
  const skills = [];
  for (const [cls, pool] of Object.entries(SKILL_POOL)) for (const skill of pool)
    skills.push({ 職: CLASSES[cls].name, 等級: '共通', 技: skill.n, 型: skill.tag, 倍率: skill.mul, 再使用: skill.cd,
      毎秒倍率: skill.mul ? +(skill.mul / skill.cd).toFixed(2) : '強化' });
  const combined = [];
  for (const [cls, chars] of Object.entries(CHARACTERS)) for (const ch of chars) {
    const skill = ch.uniq;
    skills.push({ 職: CLASSES[cls].name, 等級: ch.tier, 技: skill.n, 型: skill.tag, 倍率: skill.mul, 再使用: skill.cd,
      毎秒倍率: skill.mul ? +(skill.mul / skill.cd).toFixed(2) : `軽減${(skill.dr * 100).toFixed(1)}%/回復${(skill.heal * 100).toFixed(1)}%` });
    const trait = ch.atk || ch.hp || ch.mp || 1;
    combined.push({ キャラ: ch.n, 等級: ch.tier, 固有技補正: skill.tierMul,
      基礎特性: trait, 合成最大値: +(skill.tierMul * trait).toFixed(4) });
    if (skill.tierMul !== UNIQUE_TIER_MUL[ch.tier]) throw new Error(`${ch.n}: 等級補正が定義と一致しない`);
  }
  return { skills, combined };
});

console.log('\n全技の1秒あたり威力（倍率÷再使用時間、強化技は効果量）');
console.table(report.skills);
console.log('\n固有技等級補正 × キャラクター基礎特性（装備・限界突破なし）');
console.table(report.combined);
const max = Math.max(...report.combined.map(x => x.合成最大値));
if (max > 1.4) throw new Error(`等級と基礎特性の合成差 ${max}倍が1.4倍を超えた`);
console.log(`最大の合成差: ${max.toFixed(4)}倍`);
console.log('固有技の等級補正検査 passed');
