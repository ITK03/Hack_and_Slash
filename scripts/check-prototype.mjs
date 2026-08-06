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
  '管理者／デバッグコード',
  '全装備オプション（自由入力）',
  'この編成で潜る',
];
const missingRegressions = regressionSnippets.filter((snippet) => !index.includes(snippet));
if (missingRegressions.length) {
  throw new Error(`Gameplay regression fixes are incomplete: ${missingRegressions.join(', ')}`);
}

const wrangler = await readFile('wrangler.jsonc', 'utf8');
if (!wrangler.includes('"directory": "./public"')) {
  throw new Error('wrangler.jsonc must keep assets.directory set to ./public');
}

console.log('Prototype is readable: public/index.html and deployment config checks passed.');
