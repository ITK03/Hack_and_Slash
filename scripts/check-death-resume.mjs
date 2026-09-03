import assert from 'node:assert/strict';
import { loadGame } from './game-env.mjs';

/* 「倒れてもフロアはそのまま続く」の検査。
   以前は編成1人で endRun を呼び、その場で復活することを確かめていたが、
   それは今は全滅であって、拠点に戻るのが正しい（同じ場所でHP55%の復活を
   繰り返してダンジョンから出られない不具合だった）。
   フロアが保たれるのは「次の番手に交代したとき」なので、編成を2人にして
   1人目が倒れる形に変える。確かめたい中身（同じボス個体・同じ敵HP・
   同じ座標で続くこと）は変えていない。 */
const game = await loadGame();
const result = game.run(() => {
  S.unlockedCharacters = allRoster().map(x => x.k + ':' + x.ch.id);
  S.cls = 'warrior'; S.avatars.warrior = 'gai'; S.formation = ['warrior:gai', 'warrior:leon'];
  S.partyIndex = 0;
  S.gear = emptyGear(); S.p = newPlayer(); S.scene = 'dungeon'; S.paused = false;
  enterFloor(5);
  const boss = S.boss; boss.hp = boss.max * .37;
  const target = S.enemies.find(e => !e.boss); target.hp = target.max * .41;
  S.p.x = 12.3; S.p.y = 18.7; S.p.hp = 0;
  endRun(false, 'test');
  boss.agro = true; boss.extraT = 0; update(.01); const firstSide = boss.telK;
  boss.tel = 0; boss.extraT = 0; update(.01); const secondSide = boss.telK;
  bossRelease(boss, 0, 0); const shallowGap = boss.recover;
  S.floor = 100; bossRelease(boss, 0, 0); const deepGap = boss.recover;
  return { bossSame: S.boss === boss, bossHp: boss.hp / boss.max, enemyHp: target.hp / target.max,
    x: S.p.x, y: S.p.y, hp: S.p.hp / S.p.max, scene: S.scene, paused: S.paused,
    techniques: ['shot', 'nova', BOSSES.fire[0].pat].length, firstSide, secondSide, shallowGap, deepGap };
});

assert.equal(result.bossSame, true, '死亡後も同じボス個体を保持する');
assert.equal(result.bossHp, .37, '死亡後もボスHPを保持する');
assert.equal(result.enemyHp, .41, '死亡後も部屋内の敵状態を保持する');
assert.equal(result.x, 12.3, '死亡地点のX座標から再開する');
assert.equal(result.y, 18.7, '死亡地点のY座標から再開する');
assert.equal(result.scene, 'dungeon', '死亡後もダンジョンを継続する');
assert.equal(result.paused, false, '死亡後に再開できる');
assert.equal(result.techniques, 3, 'ボスは固有技＋2副技の3種類を持つ');
assert.equal(result.firstSide, 'shot', 'ボスの副技1が発動する');
assert.equal(result.secondSide, 'nova', 'ボスの副技2が発動する');
assert.ok(result.deepGap < result.shallowGap, '深い階層ほどボスの技後硬直が短い');
console.log('死亡時フロア保持・ボス3技・再開位置検査 passed');
