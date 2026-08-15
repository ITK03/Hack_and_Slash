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
  'function openHelpSheet',   // 管理者モードからテストプレイ用の仕様を引ける
  'const HELP_SECTIONS=',
  'const NEUTRAL_BASE=',
  'const effScore=',          // ▲は職業・属性の補正込みで比べる
  'const hasUpgrade=',
  'function craftableCount',  // 調合は個数指定と確認つき
  'CRAFT_STOCK_CAP:',
  'const DAILY_MAT_LIMIT',    // ゴールドで買える日替わり素材
  'function buyDailyMaterial',
  'const CLASS_MARK=',        // 枠の職業マーク
  'function editPlayerName',
  'id="townName"',
  'テスト用ジェム購入',
  'const INV_TABS=',          // 倉庫は 装備/結晶/分解/調合 の4区画
  'function renderMaterialPanel',
  'function renderCraftPanel',
  'const matSellValue=',
  'HEAL_RUN_CAP:',            // 回復薬は道中だけ多く持てる
  'const runCap=',
  'const conIcon=',           // 消耗品はアイコンで見分ける
  'c_heal:',
  'c_returnScroll:',
  'const PARTS=',             // 特定の敵からしか落ちない固有素材
  'const PART_BY_ENEMY=',
  'const PART_DROP=',
  'function dropPart',
  'function renderPartPanel',
  'const partIcon=',
  'p_shard:',
  'const rareFrame=',         // 枠の色＝レア度（装備と同じ等級表）
  'function craftMissing',    // 足りない材料を名指しする
  'function craftCostText',
  'mend1:', 'mend3:',         // 消耗品は系統ごとに段階を持つ
  'edge3:', 'ward3:', 'clear2:', 'swift2:', 'quake2:', 'bind2:', 'rot2:',
  'craft:{crystal:',
  'riftcore:1}', 
  '.formationOrder{',         // 番手は枠の外
  '.skillCard.uniqSkill{',    // 固有技は一覧の先頭
  'function refreshSkillButtons',  // 交代しても技ボタンの表示が中身と一致する
  'function setLevelForAll',       // レベルは全キャラへ一括で入れられる
  'const GACHA_RARITY=',           // 装備ガチャは専用の抽選表を持つ
  'function gachaRarity',
  'const hexA=',                   // 枠の色をアイテムの色から作る
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
