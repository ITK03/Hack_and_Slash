/** Install the shared definition of one dive in the running game page.
 * One dive starts at floor 1 and resolves every floor through targetDepth.
 * Rewards are generated only by the game's floor/drop functions.
 */
export function installDiveMeasurement(game) {
  game.run(() => {
    window.measureMaterialDive = targetDepth => {
      let crystals = 0;
      S.cls = 'warrior';
      S.base = { lv: 100, xp: 0, pts: 0, str: 500, mag: 0, def: 500, agi: 500, spi: 0, luk: 0 };
      S.gear = {}; S.scene = 'dungeon'; S.paused = false; S.training = false;
      S.p = newPlayer();
      for (let floor = 1; floor <= targetDepth; floor++) {
        enterFloor(floor);
        for (const prop of S.props) if (prop.t === 'barrel') breakPot(prop);
        while (S.enemies.length) {
          const enemy = S.enemies[0];
          hurtE(enemy, enemy.hp + enemy.shield + 1, false, 0, 0, true);
        }
        for (const drop of S.drops) {
          if (drop.mat === 'crystal') crystals += drop.n;
          if (drop.it) crystals += crystalQty(drop.it);
        }
      }
      return crystals;
    };
  });
}
