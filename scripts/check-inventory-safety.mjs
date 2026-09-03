import assert from 'node:assert/strict';
import { loadGame } from './game-env.mjs';

const game = await loadGame();
const beforeReload = game.run(function () {
  S.tutorial = { phase: 'done' };
  S.cls = 'warrior';
  S.avatars.warrior = 'gai';
  S.unlockedCharacters = ['warrior:gai', 'warrior:luca'];
  S.formation = ['warrior:gai', 'warrior:luca'];
  S.characterStates = {};
  S.gear = emptyGear();
  S.p = newPlayer();

  const loot = [];
  for (const slot of SLOTK) {
    let item;
    do item = makeItem(30, 0, 0, 2); while (item.slot !== slot);
    loot.push(item);
  }
  S.bag = loot.slice();
  endRun(true, 'test');
  const extractedSlots = S.stash.map(x => x.slot).sort();
  const glove = S.stash.find(x => x.slot === 'glove');
  setItemLocked(glove, true);

  const protectedMaterial = S.stash.find(x => x !== glove && x.slot === 'helm');
  protectedMaterial.locked = true;
  const target = Object.assign({}, protectedMaterial, {
    uid: newItemUid(), locked: false, rar: protectedMaterial.rar,
    ilvl: Math.max(1, protectedMaterial.ilvl - 1), affs: protectedMaterial.affs.map(x => Object.assign({}, x)),
  });
  S.stash.push(target);
  const protectedExcluded = !inheritCandidates(target).includes(protectedMaterial);

  let otherItem;
  do otherItem = makeItem(35, 0, 0, 2); while (otherItem.slot !== 'ring');
  const otherGear = emptyGear(); otherGear.ring = otherItem;
  S.characterStates['warrior:luca'] = { base: newBase(), gear: otherGear };
  requestEquipItem(otherItem, 'ring');
  const transferAsked = askFn !== null && $("askT").textContent === '装備を付け替える';
  const stayedBeforeConfirm = otherGear.ring === otherItem && S.gear.ring !== otherItem;
  askFn(); askFn = askNoFn = null;
  const movedAfterConfirm = otherGear.ring === null && S.gear.ring === otherItem;

  let leaveItem;
  do leaveItem = makeItem(25, 0, 0, 2); while (leaveItem.slot !== 'boot');
  otherGear.boot = leaveItem;
  let partyCommitted = false;
  confirmPartyLeave('warrior:luca', () => { partyCommitted = true; });
  const leaveAsked = askFn !== null && $("askY").textContent === '全て外して解除' && $("askN").textContent === '装備のまま解除';
  askFn(); askFn = askNoFn = null;
  const unequippedOnLeave = partyCommitted && otherGear.boot === null && S.stash.some(x => sameGear(x, leaveItem));

  const oldPotionRate = CFG.POTION_POT_DROP;
  CFG.POTION_POT_DROP = 1;
  S.drops = []; S.loadout = ['edge1', null, null, null]; barrelDrop(1, 1);
  const noPotionWithoutLoadout = !S.drops.some(x => x.pot);
  S.drops = []; S.loadout = ['mend1', null, null, null]; barrelDrop(1, 1);
  const basicPotionWithLoadout = S.drops.some(x => x.pot === 'mend1');
  CFG.POTION_POT_DROP = oldPotionRate;

  S.floor = 100; S.p.mDrop = 1; S.p.sDrop = 1; S.p.d.dropRate = .25;
  S.p.d.pw = []; S.p.d.pwN = {};
  const boostedItemDrop = itemDropChance(S.p);
  const damagingSkills = [];
  for (const pool of Object.values(SKILL_POOL)) for (const skill of pool) if (skill.mul > 0) damagingSkills.push(skill.mul);
  for (const { ch } of allRoster()) if (ch.uniq && ch.uniq.mul > 0) damagingSkills.push(ch.uniq.mul);

  /* 開始階層は誰に対しても 1+5n へ切り下げる。以前はデバッグ・管理者だけ刻みを
     外していたが、出撃バーの自由入力から1階層単位で潜れてしまっていた。
     1階層単位のテストは管理者パネル専用の入口（confirmDive の exact）に残す。 */
  S.deepest = 100; setDiveFloor(77);
  const legalFloor = S.diveFloor;
  S.debug = true; setDiveFloor(77); const debugFloor = S.diveFloor;
  S.formation = ['warrior:gai']; confirmDive(77, true); const debugExactFloor = S.diveFloor; S.debug = false;
  save();
  return {
    extractedSlots, gloveLocked: glove.locked, protectedExcluded,
    transferAsked, stayedBeforeConfirm, movedAfterConfirm,
    leaveAsked, unequippedOnLeave,
    noPotionWithoutLoadout, basicPotionWithLoadout,
    boostedItemDrop, legalFloor, debugFloor, debugExactFloor, maxSkill: Math.max(...damagingSkills),
    gloveUid: glove.uid,
  };
});

assert.equal(Array.from(beforeReload.extractedSlots).join(','), 'amulet,armor,boot,glove,helm,ring,weapon', '全7部位を帰還時に倉庫へ移す');
assert.equal(beforeReload.gloveLocked, true, '手袋を保護できる');
assert.equal(beforeReload.protectedExcluded, true, '保護品は継承素材にならない');
assert.equal(beforeReload.transferAsked, true, '他キャラ装備の移管前に確認する');
assert.equal(beforeReload.stayedBeforeConfirm, true, '確認前には所有者を変えない');
assert.equal(beforeReload.movedAfterConfirm, true, '確認後に元キャラから外して移管する');
assert.equal(beforeReload.leaveAsked, true, '編成離脱時に全装備を外すか選べる');
assert.equal(beforeReload.unequippedOnLeave, true, '全解除を選ぶと倉庫へ戻す');
assert.equal(beforeReload.noPotionWithoutLoadout, true, '癒血の雫を持ち込まないと樽から出ない');
assert.equal(beforeReload.basicPotionWithLoadout, true, '癒血の雫を持ち込むと樽から出る');
assert.equal(beforeReload.boostedItemDrop, 0.06, 'ドロップ率25%が装備抽選にも共通倍率で乗る');
assert.ok(beforeReload.maxSkill <= 2, `攻撃技の最大倍率は2倍以下（実値 ${beforeReload.maxSkill}）`);
assert.equal(beforeReload.legalFloor, 76, '通常プレイの開始階層を1+5nへ丸める');
assert.equal(beforeReload.debugFloor, 76, 'デバッグモードでも出撃バーからは1+5nへ丸める');
assert.equal(beforeReload.debugExactFloor, 77, '管理者パネルの1階層単位テストだけは任意階を指定できる');

game.reload();
const afterReload = game.run(function (uid) {
  const item = allOwnedGear().find(x => x.uid === uid);
  return { exists: !!item, slot: item && item.slot, locked: item && item.locked };
}, beforeReload.gloveUid);
assert.equal(afterReload.exists, true, '手袋が保存後も消えない');
assert.equal(afterReload.slot, 'glove', '保存後も手袋の部位を保つ');
assert.equal(afterReload.locked, true, '保護状態が保存後も消えない');

console.log('所持品・装備移管・保護・共通ドロップ率・階層入力検査 passed');
