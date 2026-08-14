import { readFile } from 'node:fs/promises';

const requiredFiles = [
  'public/index.html',
  'wrangler.jsonc',
  'README.md',
  'docs/PLAN.md',
  'docs/HYPOTHESES.md',
];

for (const file of requiredFiles) {
  await readFile(file, 'utf8');
}

const index = await readFile('public/index.html', 'utf8');
const requiredSnippets = [
  '<canvas id="cv"></canvas>',
  'const CFG=',
  'function enterFloor',
  'function newPlayer',
  'localStorage',
];

const missing = requiredSnippets.filter((snippet) => !index.includes(snippet));
if (missing.length) {
  throw new Error(`public/index.html is missing expected game hooks: ${missing.join(', ')}`);
}

const shopConfirmationSnippets = [
  'ask("掘り出し物を購入する"',
  '購入後の所持金: ${S.gold-gc} G',
];
const missingShopConfirmation = shopConfirmationSnippets.filter((snippet) => !index.includes(snippet));
if (missingShopConfirmation.length) {
  throw new Error(`The bargain purchase confirmation is incomplete: ${missingShopConfirmation.join(', ')}`);
}

const gameplayQualitySnippets = [
  'ECO_DPR:1.25',
  'settings:{map:1,dmg:1,shake:1,dps:1,loot:1,timer:1,stick:1,eco:0}',
  'S.runGold+=d.gold',
  '今回獲得したゴールド',
  'const CHARACTERS=',
  'grid-template-columns:repeat(4,1fr)',
  'toast("成功: "+q.s.n,"ok")',
];
const missingGameplayQuality = gameplayQualitySnippets.filter((snippet) => !index.includes(snippet));
if (missingGameplayQuality.length) {
  throw new Error(`The gameplay quality improvements are incomplete: ${missingGameplayQuality.join(', ')}`);
}

const regressionSnippets = [
  'PICKUP_DELAY:.10',
  'PICKUP_RADIUS:.50',
  'MAGNET_SPEED:2.5',
  'const sweptD=',
  'const bossHPScale=',
  'style.visibility=S.settings.stick?"visible":"hidden"',
  '開錠失敗 — 敵が現れた',
  'code==="omiomi"',
  'const st=CFG.SKIP_STEP',
  'id="btnGiveUp"',
  'body::before{display:none}',
  'stick:1,eco:0',
  'debugFloor:S.debugFloor',
  'data-t="prep"',
  '装備・能力',
  'aria-label","モード切替コード',
  '全装備オプション（自由入力）',
  'function renderDiveBar',   // 潜る操作。旧「この編成で潜る」ボタンから常駐の出撃バーへ移した
  'confirmDive(S.diveFloor)',
  'function openFloorPick',   // ±だけでは最深まで何十回も押すことになる
  'function maxStartFloor',
  'function renderPartySection',  // 拠点は編成が先、任務は折りたたみの下
  'function renderMissionSection',
  'const SKILL_POOL=',        // 技は3枠を職ごとの6種から選ぶ
  'function activeSkills',
  'function setSkillSlot',
  'function renderSkillTab',
  'function openGachaRates',  // ガチャの提供割合を開示する
  '.gachaBtns',
  'const BOSSES={',           // ボスは属性ごとに2体、挙動も別物
  'function bossOf',
  'const BOSS_AI={',
  'const CTIER=',             // キャラクターの等級。配布はN、ガチャはR以上
  'function rollCharacter',
  'function skillPoolFor',    // 固有技はそのキャラクターだけ
  'function skillKeyFor',
  'function openProfileIconPick',
  'function openFormationChoices',
  'function confirmSelectedSell',
  'キャラクターガチャ',
  'ジェムショップ',
  '1階層単位のテスト潜入',
];
const missingRegressions = regressionSnippets.filter((snippet) => !index.includes(snippet));
if (missingRegressions.length) {
  throw new Error(`Gameplay regression fixes are incomplete: ${missingRegressions.join(', ')}`);
}

const tutorialRegressionSnippets = [
  'id="tutorialConfirm">確認',
  '.tutorialMask{display:none!important}',
  '{k:"gear_equip",msg:',
  '{k:"shop_gacha",msg:',
  'if($("tutorialBanner").style.display!=="none")return false',
];
const missingTutorialRegressions = tutorialRegressionSnippets.filter((snippet) => !index.includes(snippet));
if (missingTutorialRegressions.length) {
  throw new Error(`Tutorial regressions are incomplete: ${missingTutorialRegressions.join(', ')}`);
}
for (const forbidden of ['position:relative!important;z-index:92', '0 0 0 9999px']) {
  if (index.includes(forbidden)) {
    throw new Error(`Tutorial highlighting must not move or obscure the original UI: ${forbidden}`);
  }
}

const wrangler = await readFile('wrangler.jsonc', 'utf8');
if (!wrangler.includes('"directory": "./public"')) {
  throw new Error('wrangler.jsonc must keep assets.directory set to ./public');
}

console.log('Prototype is readable: public/index.html and deployment config checks passed.');
