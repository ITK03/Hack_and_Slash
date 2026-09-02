import { loadGame } from './game-env.mjs';

const game = await loadGame();
const result = game.run(function () {
  const body = $('townBody');
  const walk = (root, out = []) => {
    for (const child of root.children || []) { out.push(child); walk(child, out); }
    return out;
  };
  const byClass = (root, name) => walk(root).find(el => String(el.className || '').split(/\s+/).includes(name));
  const allByClass = (root, name) => walk(root).filter(el => String(el.className || '').split(/\s+/).includes(name));

  S.tutorial.done = true;
  S.tutorial.phase = null;

  S.tab = 'gear'; S.gearSub = 'equip'; S.gearSlot = null; openTown();
  const panel = byClass(body, 'gearPanel');
  const gearStats = allByClass(panel, 'gearStats');
  const gearSlots = allByClass(panel, 'slot');
  const hasOverview = !!byClass(body, 'gearOverview');

  S.gearSub = 'ability'; S.alloc = null; openTown();
  const abilityChildren = body.children.map(el => String(el.className || ''));
  const allocGrid = byClass(body, 'allocGrid');

  S.loadout = ['mend3', 'ward2', 'clear2', 'swift2'];
  S.tab = 'prep'; openTown();
  const loadout = byClass(body, 'loadout');
  const loadoutRows = (loadout?.children || []).map(el => el.innerHTML);

  S.tab = 'inv'; S.invSub = 'gear'; S.inv.sellMode = false; S.inv.dismantleMode = false; openTown();
  const tools = byClass(body, 'invTools');
  const toolMarkup = (tools?.children || []).map(el => el.innerHTML);

  openMissions('daily');
  const popup = $('itC'), missionTabs = byClass(popup, 'missionTabs');
  const missionLabels = (missionTabs?.children || []).map(el => el.textContent);

  S.tab = 'conf'; S.settingsPage = 'display'; openTown();
  const settingsNav = byClass(body, 'settingsNav');
  const settingsLabels = (settingsNav?.children || []).map(el => el.textContent);

  showGachaResult('10連結果', '', () => {});
  const gachaActions = $('itC').children.at(-1)?.children.map(el => el.textContent) || [];

  return {
    gearStats: gearStats.length,
    gearStatRows: (gearStats[0]?.innerHTML.match(/class="stat"/g) || []).length,
    gearSlotCount: gearSlots.length,
    recommendCount: gearSlots.filter(el => String(el.className).includes('recommendSlot')).length,
    hasOverview,
    abilityChildren,
    allocTiles: allocGrid?.children.length || 0,
    loadoutRows,
    toolMarkup,
    missionLabels,
    settingsLabels, gachaActions,
  };
});

const fail = message => { throw new Error(message); };
if (result.gearStats !== 1) fail(`装備タブの全ステータス表が ${result.gearStats} 件`);
if (result.gearStatRows !== 16) fail(`装備タブのステータスが ${result.gearStatRows}/16 項目`);
if (result.gearSlotCount !== 8 || result.recommendCount !== 1) fail(`装備欄が7部位＋おすすめになっていない`);
if (result.hasOverview) fail('装備診断行が残っている');
if (result.abilityChildren.some(x => x.includes('gearStats'))) fail('能力タブに全ステータス表が残っている');
if (result.allocTiles !== 6) fail(`能力割り振りが ${result.allocTiles}/6 項目`);
const leadIndex = result.abilityChildren.indexOf('abilityLead'), gridIndex = result.abilityChildren.indexOf('allocGrid');
if (leadIndex < 0 || gridIndex < 0 || leadIndex > gridIndex) fail('残り能力ポイントが割り振り欄より上にない');
if (result.loadoutRows.length !== 4) fail(`持ち込み枠が ${result.loadoutRows.length}/4 件`);
for (const [i, key] of ['mend3', 'ward2', 'clear2', 'swift2'].entries()) {
  const expected = game.run(function (k) { return CONSUMABLES[k].n; }, key);
  if (!result.loadoutRows[i]?.includes(expected)) fail(`持ち込み品名「${expected}」が表示されない`);
  if (/\.\.\.|…/.test(result.loadoutRows[i])) fail(`持ち込み品名「${expected}」が省略されている`);
}
if (!result.toolMarkup.length || result.toolMarkup.some(x => !x.includes('<svg'))) fail('倉庫の操作アイコンがSVGで統一されていない');
if (result.toolMarkup.some(x => /[▽↕◇]/.test(x))) fail('倉庫の操作列に文字記号アイコンが残っている');
if (result.missionLabels.join('/') !== 'デイリー/恒常/到達報酬') fail(`ミッション区分が崩れている: ${result.missionLabels.join('/')}`);
if (result.settingsLabels.join('/') !== '表示/操作/データ/その他') fail(`設定区分が崩れている: ${result.settingsLabels.join('/')}`);
if (result.gachaActions.join('/') !== '閉じる/10連回す') fail(`10連結果の操作が崩れている: ${result.gachaActions.join('/')}`);

console.log('UI structure: equipment stats, allocation-only ability, readable loadout, SVG tools, and tab labels passed.');
