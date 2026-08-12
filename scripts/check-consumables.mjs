import { loadGame } from './game-env.mjs';
import { installDiveMeasurement } from './measure-dive.mjs';

const game = await loadGame();
installDiveMeasurement(game);
const result=game.run(()=>{
 let sum=0;for(let i=0;i<100;i++)sum+=window.measureMaterialDive(10);const crystals=sum/100;
 // Real update(): fixed profile, deterministic bot, consumables used as soon as eligible.
 function trial(depth,full){S.cls='warrior';S.scene='dungeon';S.paused=false;S.training=false;S.returnInvulnerable=false;S.formation=['warrior:gai'];S.settings.controlMode='manual';S.base={lv:60,xp:0,pts:0,str:180,mag:0,def:60,agi:60,spi:0,luk:0};S.gear={};for(const slot of ['weapon','helm','armor','glove','boot','ring','amulet']){let it;do it=makeItem(depth,0,0,2);while(it.slot!==slot||it.rar!==2||(it.ac&&it.ac!=='warrior'));it.lv=1+Math.floor((itemMaxLv(it)-1)*.5);it.element=ELEMENT_KEYS[['weapon','helm','armor','glove','boot','ring','amulet'].indexOf(slot)%ELEMENT_KEYS.length];S.gear[slot]=it;}S.p=newPlayer();S.loadout=full?['heal','power','hard','gale']:[null,null,null,null];S.consumables={heal:3,power:5,hard:5,gale:5};S.runItems=full?[3,5,5,5]:[0,0,0,0];enterFloor(depth);HELD.fill(true);for(let t=0;t<45&&S.scene==='dungeon'&&S.p.hp>0&&S.enemies.length;t+=.05){let e=S.enemies[0],best=1e9;for(const x of S.enemies){const z=d2(S.p.x,S.p.y,x.x,x.y);if(z<best){best=z;e=x;}}const a=Math.atan2(e.y-S.p.y,e.x-S.p.x);S.p.x=e.x-Math.cos(a)*1.15;S.p.y=e.y-Math.sin(a)*1.15;S.p.face=a;for(let i=0;i<3;i++)if(S.p.cds[i]<=0&&S.p.mp>=S.p.d.C.skills[i].c)useSkill(i);if(full&&S.p.itemCd<=0){if(S.p.hp<S.p.max*.7&&S.runItems[0])useItem(0);else for(let i=1;i<4;i++)if(S.runItems[i]&&!S.p.itemBuffs[S.loadout[i]]){useItem(i);break;}}update(.05);}HELD.fill(false);return S.scene!=='dungeon'||S.p.hp<=0||S.enemies.length>0;}
 function rate(depth,full,runs=48){let deaths=0;for(let i=0;i<runs;i++){_s=(depth*2654435761+i*1013904223)>>>0;deaths+=trial(depth,full);}return deaths/runs;}
 function cycleRate(depth,full,runs=48){let total=0;const runsPerDepth=Math.max(1,Math.floor(runs/8));for(let offset=0;offset<8;offset++)total+=rate(depth+offset,full,runsPerDepth);return total/8;}
 function boundary(full,lower,upper){while(lower<upper){const middle=(lower+upper)>>1;if(cycleRate(middle,full)>=.5)upper=middle;else lower=middle+1;}return lower;}
 // Measure the standard baseline first, then center the consumable search on that result.
 let upper=16;while(upper<300&&cycleRate(upper,false,32)<.5)upper=Math.min(300,upper*2);
 const none=boundary(false,Math.max(1,upper>>1),upper);
 const full=boundary(true,Math.max(1,none-8),Math.min(300,none+16));
 return {crystals,heals:crystals/CONSUMABLES.heal.crystal,none,full,difference:full-none};
});
// Exercise the real pointer handlers: open the fan, observe time advancing while it is open, then release.
game.run(()=>{S.cls='warrior';S.base={lv:60,xp:0,pts:0,str:180,mag:0,def:60,agi:60,spi:0,luk:0};S.gear={};S.p=newPlayer();S.scene='dungeon';S.paused=false;S.training=false;S.loadout=['heal','power','hard','gale'];S.runItems=[1,1,1,1];S.consumables={heal:1,power:1,hard:1,gale:1};S.runT=0;});
game.clearTimers();  // 計測中に積み上がった未発火タイマーを切り離してから操作を検査する
game.dispatch('pot','pointerdown',{pointerId:1,pointerType:'mouse',clientX:20,clientY:20,buttons:1});
game.advance(400);   // 長押し判定(360ms)を仮想時間で越える
const fanStart=game.run(()=>({open:document.querySelector('#itemFan').classList.contains('on'),paused:S.paused,time:S.runT}));
// 扇が開いている間もゲーム更新が進むことを、実際に update() を回して確かめる
game.run(()=>{for(let i=0;i<12;i++)update(1/60);});
game.dispatch('pot','pointermove',{pointerId:1,pointerType:'mouse',clientX:70,clientY:5,buttons:1});
game.advance(120);
const fanDuring=game.run(()=>({open:document.querySelector('#itemFan').classList.contains('on'),paused:S.paused,time:S.runT}));
game.dispatch('pot','pointerup',{pointerId:1,pointerType:'mouse',clientX:70,clientY:5,buttons:0});
result.fanDoesNotPause=fanStart.open&&fanDuring.open&&!fanStart.paused&&!fanDuring.paused&&fanDuring.time>fanStart.time;
console.log('消耗品実測',result);if(result.heals<3||result.heals>5)throw new Error(`深度10一周の回復薬換算 ${result.heals.toFixed(2)} は約4個でない`);if(result.difference<5||result.difference>10)throw new Error(`50%死亡深度差 ${result.difference} は+5〜+10でない`);if(!result.fanDoesNotPause)throw new Error('長押し中に停止した');
