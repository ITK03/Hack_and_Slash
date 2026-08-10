import { loadGame } from './game-env.mjs';

const game = await loadGame();

const report = game.run(() => {
  const base = { lv: 60, xp: 0, pts: 0, str: 180, mag: 0, def: 60, agi: 60, spi: 0, luk: 0 };
  const slots = ['weapon', 'helm', 'armor', 'glove', 'boot', 'ring', 'amulet'];
  const setup = () => {
    S.cls = 'warrior'; S.scene = 'dungeon'; S.paused = false; S.training = false;
    S.base = { ...base }; S.gear = {}; S.p = newPlayer();
    S.loadout = ['returnScroll', 'sonic', 'shockTrap', 'weaken'];
    S.consumables = { returnScroll: 1, sonic: 1, shockTrap: 1, weaken: 1 };
    S.runItems = [1, 1, 1, 1]; S.enemies = [];
  };

  setup(); S.p.lastHit = 0;
  const blocked = !useItem(0) && S.runItems[0] === 1;
  S.p.lastHit = 6;
  const began = useItem(0) && S.p.returnCast === 3 && S.runItems[0] === 1;
  // 回避抽選や直前の試行状態に左右されず、詠唱中に必ず被弾する状態を作る。
  S.floor = 1000; S.p.hurtT = 0; S.p.invulT = 0; S.p.d.agiD = 0; _s = 1;
  hurtP(1, 'test', true);
  const interrupted = S.p.returnCast === 0 && S.runItems[0] === 1;
  setup(); S.p.lastHit = 6; useItem(0); update(3.01);
  const completed = S.runItems[0] === 0 && document.querySelector('#scEnd').classList.contains('on') && S.paused;

  S.paidInventory = { catalysts: [], feathers: [], slots: [] }; S.premium = 999;
  buyPaid('catalysts', 120);
  const paid = S.paidInventory.catalysts[0];

  // Observe the real automation clock: the first aggressive rule is eligible immediately.
  setup(); S.settings.controlMode = 'onehand'; S.settings.autoPreset = 'aggressive';
  enterFloor(10); S.p.hp = S.p.max = 1e9; S.p.mp = S.p.d.mpMax; S.p.cds.fill(0);
  while (S.enemies.length < 2) S.enemies.push({ ...S.enemies[0], x: S.p.x, y: S.p.y });
  for (const enemy of S.enemies) { enemy.x = S.p.x + .5; enemy.y = S.p.y; enemy.hp = enemy.max = 1e9; enemy.dmg = 0; }
  let delay = 0;
  while (S.p.cds[0] <= 0 && delay < 1) { update(1 / 60); delay += 1 / 60; }

  // Measure the damage modifier through useSkill(), with identical RNG and target state.
  const skillDamage = automatic => {
    setup(); enterFloor(10); const enemy = S.enemies[0];
    S.enemies = [enemy]; S.p.x = enemy.x - .5; S.p.y = enemy.y; S.p.face = 0;
    enemy.hp = enemy.max = 1e9; enemy.def = 0; S.p.mp = S.p.d.mpMax; S.p.cds.fill(0); IN.dx = IN.dy = 0; _s = 12345;
    const before = enemy.hp; S.autoSkillCasting = automatic; useSkill(0); S.autoSkillCasting = false;
    return before - enemy.hp;
  };
  const manualDamage = skillDamage(false), automaticDamage = skillDamage(true);
  const skillScale = automaticDamage / manualDamage;

  function equip(depth) {
    S.gear = Object.fromEntries(slots.map(slot => [slot, null]));
    for (const slot of slots) {
      let item;
      do item = makeItem(depth, 0, 0, 2); while (item.slot !== slot || item.rar !== 2 || (item.ac && item.ac !== 'warrior'));
      item.lv = 1 + Math.floor((itemMaxLv(item) - 1) * .5); S.gear[slot] = item;
    }
  }
  function trial(depth, mode, full) {
    S.cls = 'warrior'; S.scene = 'dungeon'; S.paused = false; S.training = false; S.returnInvulnerable = false;
    S.settings.controlMode = mode; S.settings.autoPreset = 'aggressive'; S.settings.autoRules = null;
    S.base = { ...base }; equip(depth); S.p = newPlayer();
    S.loadout = full ? ['heal', 'power', 'hard', 'gale', 'sonic', 'weaken'] : [null, null, null, null, null, null];
    S.consumables = { heal: 3, power: 5, hard: 5, gale: 5, sonic: 3, weaken: 3 };
    S.runItems = full ? [3, 5, 5, 5, 3, 3] : [0, 0, 0, 0, 0, 0];
    // 移動は3モードとも同じ理想化（毎tick最寄りの敵に接敵）で揃える。
    // ここで測るのは戦闘力であって踏破力ではないため、モード差は
    // 「攻撃と技を誰が出しているか」だけに絞る。手動だけが通常攻撃を押し続け、
    // 片手と完全オートは updateAutomation が射程判定と反応遅延を通して出す。
    enterFloor(depth); HELD.fill(mode === 'manual');
    for (let elapsed = 0; elapsed < 45 && S.scene === 'dungeon' && S.p.hp > 0 && S.enemies.length; elapsed += .05) {
      let target = S.enemies[0], best = Infinity;
      for (const enemy of S.enemies) { const distance = d2(S.p.x, S.p.y, enemy.x, enemy.y); if (distance < best) { best = distance; target = enemy; } }
      const angle = Math.atan2(target.y - S.p.y, target.x - S.p.x);
      S.p.x = target.x - Math.cos(angle) * 1.15; S.p.y = target.y - Math.sin(angle) * 1.15; S.p.face = angle;
      if (mode === 'manual') for (let i = 0; i < 3; i++) if (S.p.cds[i] <= 0 && S.p.mp >= S.p.d.C.skills[i].c) useSkill(i);
      if (full && S.p.itemCd <= 0) {
        if (S.p.hp < S.p.max * .7 && S.runItems[0]) useItem(0);
        else if (S.runItems[1] && !S.p.itemBuffs.power) useItem(1);
        else if (S.runItems[2] && !S.p.itemBuffs.hard) useItem(2);
        else if (S.runItems[3] && !S.p.itemBuffs.gale) useItem(3);
        else if (S.runItems[4] && S.enemies.length >= 2) useItem(4);
        else if (S.runItems[5]) useItem(5);
      }
      update(.05);
    }
    HELD.fill(false);
    return S.scene !== 'dungeon' || S.p.hp <= 0 || S.enemies.length > 0;
  }
  function deathRate(depth, mode, full, runs = 48) {
    let deaths = 0;
    for (let run = 0; run < runs; run++) { _s = (depth * 2654435761 + run * 1013904223) >>> 0; deaths += trial(depth, mode, full); }
    return deaths / runs;
  }
  function boundary(mode, full) {
    let lower = 1, upper = 150;
    while (lower < upper) { const middle = (lower + upper) >> 1; if (deathRate(middle, mode, full) >= .5) upper = middle; else lower = middle + 1; }
    return { depth: lower, deathRate: deathRate(lower, mode, full, 160) };
  }
  function operationSample(mode) {
    S.cls = 'warrior'; S.scene = 'dungeon'; S.paused = false; S.training = false; S.returnInvulnerable = false;
    S.settings.controlMode = mode; S.settings.autoPreset = 'aggressive'; S.settings.autoRules = null;
    S.base = { ...base }; equip(12); S.p = newPlayer(); S.loadout = [null, null, null, null]; S.runItems = [0, 0, 0, 0];
    _s = 120120; enterFloor(12); const initial = S.enemies.length; let stillSeconds = 0, secondDistance = 0, previousX = S.p.x, previousY = S.p.y;
    // 片手はプレイヤーが移動を担当する。人間は壁を回り込むので、直線ではなく
    // ゲーム内の経路探索(automationWaypoint)に追従させる。直線入力だと壁の
    // 向こうの敵を狙って張り付き、射程に一度も入れないまま計測が終わる。
    let waypoint = null, waypointT = 0, attackTicks = 0;
    for (let tick = 1; tick <= 1200; tick++) {
      if (mode === 'onehand' && S.enemies.length) {
        let target = S.enemies[0], best = d2(S.p.x, S.p.y, target.x, target.y);
        for (const enemy of S.enemies) { const distance = d2(S.p.x, S.p.y, enemy.x, enemy.y); if (distance < best) { best = distance; target = enemy; } }
        waypointT -= .05;
        if (waypointT <= 0) { waypoint = automationWaypoint(S.p, target); waypointT = .35; }
        const step = waypoint || target;
        automationInput(step.x - S.p.x, step.y - S.p.y);
      } else if (mode === 'onehand') IN.dx = IN.dy = 0;
      update(.05); if (HELD[0]) attackTicks++;
      secondDistance += Math.hypot(S.p.x - previousX, S.p.y - previousY); previousX = S.p.x; previousY = S.p.y;
      if (tick % 20 === 0) { if (secondDistance < .25) stillSeconds++; secondDistance = 0; }
    }
    HELD.fill(false); IN.dx = IN.dy = 0;
    const killed = initial - S.enemies.length;
    return { initial, killed, killRate: killed / initial, stillSeconds, attackTicks };
  }
  const operation = { auto: operationSample('auto'), onehand: operationSample('onehand') };
  const tacticalNone = boundary('manual', false), tacticalFull = boundary('manual', true);
  const modes = ['manual', 'onehand', 'auto'].map(mode => ({ mode, ...boundary(mode, false) }));
  return {
    features: { blocked, began, interrupted, completed, tactical: Object.keys(CONSUMABLES).filter(key => ['sonic', 'shockTrap', 'weaken', 'torch', 'incense', 'returnScroll'].includes(key)).length, paidHasId: !!paid?.id && paid.source === 'purchase', conditions: AUTOMATION_CONDITIONS.length, actions: AUTOMATION_ACTIONS.length },
    automation: { delay, skillScale, manualDamage, automaticDamage }, operation, tactical: { none: tacticalNone, full: tacticalFull, difference: tacticalFull.depth - tacticalNone.depth }, modes,
  };
});

console.log('\nBundle B 機能実測', report.features);
console.log('\n自動化実測', report.automation);
console.log('\n操作機能実測');
console.table([{ 操作: '完全オート', 開始敵数: report.operation.auto.initial, 討伐数: report.operation.auto.killed, 討伐率: `${(report.operation.auto.killRate * 100).toFixed(1)}%`, 攻撃tick: report.operation.auto.attackTicks, '静止秒数 (<0.25/秒)': report.operation.auto.stillSeconds }, { 操作: '片手', 開始敵数: report.operation.onehand.initial, 討伐数: report.operation.onehand.killed, 討伐率: `${(report.operation.onehand.killRate * 100).toFixed(1)}%`, 攻撃tick: report.operation.onehand.attackTicks, '静止秒数 (<0.25/秒)': '-' }]);
console.log('\n戦術アイテム込み持ち込み実測');
console.table([{ 条件: '持ち込みなし', '50%死亡深度': report.tactical.none.depth, 死亡率: `${(report.tactical.none.deathRate * 100).toFixed(1)}%` }, { 条件: '戦術込みフル', '50%死亡深度': report.tactical.full.depth, 死亡率: `${(report.tactical.full.deathRate * 100).toFixed(1)}%` }, { 条件: '差', '50%死亡深度': `+${report.tactical.difference}`, 死亡率: '' }]);
console.log('\n操作モード別実測');
console.table(report.modes.map(row => ({ 操作: { manual: 'フル手動', onehand: '片手', auto: '完全オート' }[row.mode], '50%死亡深度': row.depth, 死亡率: `${(row.deathRate * 100).toFixed(1)}%` })));
for (const [key, value] of Object.entries(report.features)) if (['tactical', 'conditions', 'actions'].includes(key) ? value < 6 : !value) throw new Error(`${key} failed`);
if (report.automation.delay < .35 || report.automation.delay >= .40) throw new Error(`自動化反応遅延 ${report.automation.delay.toFixed(3)}秒は0.35以上0.40未満でない`);
if (Math.abs(report.automation.skillScale - .62) > .001) throw new Error(`自動スキル倍率 ${report.automation.skillScale.toFixed(3)}は想定外`);
// 60秒で敵29体が散らばるフロアでは移動時間が支配的で、正常に動いていても
// 討伐率は2〜4割にしかならない。壊れている状態(0%)とは明確に分かれるので
// 20%を下限とし、あわせて「一度も射程に入れていない」状態を攻撃tickで弾く。
for (const [mode, label] of [['auto', '完全オート'], ['onehand', '片手']]) {
  const row = report.operation[mode];
  if (row.killRate < .2) throw new Error(`${label}実測の討伐率 ${(row.killRate * 100).toFixed(1)}% は20%未満`);
  if (row.attackTicks <= 0) throw new Error(`${label}は60秒で一度も通常攻撃の射程に入れていない`);
}
if (report.operation.auto.stillSeconds > 20) throw new Error(`完全オートの静止 ${report.operation.auto.stillSeconds}秒が20秒を超えている`);
if (report.tactical.difference < 1 || report.tactical.difference > 3) throw new Error(`戦術込み50%死亡深度差 ${report.tactical.difference} は+1〜+3でない`);
// 守るべき設計不変条件は「手動が最も強い」こと。片手と完全オートは戦闘部分が
// 同じ自動化なので、両者のあいだに厳密な大小を要求すると調整が恣意的になる。
const [manualMode, onehandMode, autoMode] = report.modes;
if (!(manualMode.depth > onehandMode.depth && manualMode.depth > autoMode.depth)) throw new Error(`フル手動が最も深くない: ${report.modes.map(row => `${row.mode}=${row.depth}`).join(' / ')}`);

