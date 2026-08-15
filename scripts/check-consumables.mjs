import { loadGame } from './game-env.mjs';
import { installDiveMeasurement } from './measure-dive.mjs';

const game = await loadGame();
installDiveMeasurement(game);
/* 1段目だけの持ち込みと、3段目までそろえた持ち込みを別々に測る。
   「浅い層の品は弱く、深く潜って上位素材を集めた品ほど強い」が設計の要なので、
   両方の到達深度を測り、差が出ていることまで検査する。 */
const result=game.run(()=>{
 const KITS={low:['mend1','edge1','ward1','swift1'],high:['mend3','edge3','ward3','swift2']};
 let sum=0;for(let i=0;i<100;i++)sum+=window.measureMaterialDive(10);const crystals=sum/100;
 // Real update(): fixed profile, deterministic bot, consumables used as soon as eligible.
 function trial(depth,kit){S.cls='warrior';S.scene='dungeon';S.paused=false;S.training=false;S.returnInvulnerable=false;S.formation=['warrior:gai'];S.settings.controlMode='manual';S.base={lv:60,xp:0,pts:0,str:180,mag:0,def:60,agi:60,spi:0,luk:0};S.gear={};for(const slot of ['weapon','helm','armor','glove','boot','ring','amulet']){let it;do it=makeItem(depth,0,0,2);while(it.slot!==slot||it.rar!==2||(it.ac&&it.ac!=='warrior'));it.lv=1+Math.floor((itemMaxLv(it)-1)*.5);it.element=ELEMENT_KEYS[['weapon','helm','armor','glove','boot','ring','amulet'].indexOf(slot)%ELEMENT_KEYS.length];S.gear[slot]=it;}S.p=newPlayer();S.loadout=(KITS[kit]||[null,null,null,null]).slice();S.consumables={};for(const k of S.loadout)if(k)S.consumables[k]=CONSUMABLES[k].max;S.runItems=S.loadout.map(k=>k?CONSUMABLES[k].max:0);enterFloor(depth);HELD.fill(true);for(let t=0;t<45&&S.scene==='dungeon'&&S.p.hp>0&&S.enemies.length;t+=.05){let e=S.enemies[0],best=1e9;for(const x of S.enemies){const z=d2(S.p.x,S.p.y,x.x,x.y);if(z<best){best=z;e=x;}}const a=Math.atan2(e.y-S.p.y,e.x-S.p.x);S.p.x=e.x-Math.cos(a)*1.15;S.p.y=e.y-Math.sin(a)*1.15;S.p.face=a;for(let i=0;i<3;i++)if(S.p.cds[i]<=0&&S.p.mp>=activeSkills()[i].c)useSkill(i);if(kit&&S.p.itemCd<=0){if(S.p.hp<S.p.max*.7&&S.runItems[0])useItem(0);else if(S.p.hp>S.p.max*.85)for(let i=1;i<4;i++){const b=S.loadout[i]&&CONSUMABLES[S.loadout[i]].buff;if(S.runItems[i]&&b&&!S.p.itemBuffs[b]){useItem(i);break;}}}update(.05);}HELD.fill(false);return S.scene!=='dungeon'||S.p.hp<=0||S.enemies.length>0;}
 function rate(depth,kit,runs=48){let deaths=0;for(let i=0;i<runs;i++){_s=(depth*2654435761+i*1013904223)>>>0;deaths+=trial(depth,kit);}return deaths/runs;}
 function cycleRate(depth,kit,runs=48){let total=0;const runsPerDepth=Math.max(1,Math.floor(runs/8));for(let offset=0;offset<8;offset++)total+=rate(depth+offset,kit,runsPerDepth);return total/8;}
 function boundary(kit,lower,upper){while(lower<upper){const middle=(lower+upper)>>1;if(cycleRate(middle,kit)>=.5)upper=middle;else lower=middle+1;}return lower;}
 // Measure the standard baseline first, then center the consumable search on that result.
 let upper=16;while(upper<300&&cycleRate(upper,null,32)<.5)upper=Math.min(300,upper*2);
 const none=boundary(null,Math.max(1,upper>>1),upper);
 /* 到達深度そのものは段差の粗い階段関数で、死亡率が10ポイント動いても
    境界が1深度も動かないことがある（実測: 深度57で死亡率 50%→42%→25% と
    はっきり差が出ているのに、境界は 57/55/62 とほぼ動かなかった）。
    そこで同一深度での死亡率を直接比べる。属性検査と同じ理由で同じ方法を採る。 */
 const depths=[none-5,none,none+5].filter(d=>d>=5);
 const at=depths.map(depth=>{
   const a=rate(depth,null,64),b=rate(depth,'low',64),c=rate(depth,'high',64);
   return {depth,無し:a,一段目:b,三段目:c,一段目差:a-b,三段目差:a-c,段階差:b-c};});
 const avg=k=>at.reduce((x,r)=>x+r[k],0)/at.length;
 return {crystals,heals:crystals/CONSUMABLES.mend1.craft.crystal,none,at,
   lowGain:avg('一段目差'),highGain:avg('三段目差'),tierGain:avg('段階差')};
});
/* 右端のアイテム列を実際のDOMとハンドラで検査する。
   持ち込み枠ぶんのボタンが並び、1タップで使え、ゲームは止まらないこと。
   （長押しで扇を開く方式は廃止した。押しっぱなしが要り、選択中の中身も見えなかった。） */
game.run(()=>{S.cls='warrior';S.base={lv:60,xp:0,pts:0,str:180,mag:0,def:60,agi:60,spi:0,luk:0};S.gear={};S.p=newPlayer();S.scene='dungeon';S.paused=false;S.training=false;S.loadout=['mend1','edge1','ward1','swift1'];S.runItems=[1,1,1,1];S.consumables={mend1:1,edge1:1,ward1:1,swift1:1};S.runT=0;S.p.itemCd=0;S.p.itemLock=0;S.p.hp=S.p.max*.5;renderRail();updHUD();});
game.clearTimers();  // 計測中に積み上がった未発火タイマーを切り離してから操作を検査する
/* DOMスタブは querySelectorAll を持たないため、ここではロジックだけを見る。
   ボタンが実際に並んで押せるか・重ならないかは実ブラウザで確認する（scripts/check-layout.mjs）。 */
const before=game.run(()=>({残:S.runItems.slice(),hp:Math.round(S.p.hp),time:S.runT,paused:S.paused}));
const used=game.run(()=>useItem(0));
game.run(()=>{for(let i=0;i<12;i++)update(1/60);});
const after=game.run(()=>({残:S.runItems.slice(),hp:Math.round(S.p.hp),time:S.runT,paused:S.paused}));
result.枠=game.run(()=>loadoutCapacity());
result.itemUseWorks=used&&after.残[0]===before.残[0]-1&&after.hp>before.hp;
result.doesNotPause=!after.paused&&after.time>before.time;
// 操作モードの切替が戦闘中に呼べること（右端の切替ボタンから使う関数）
result.modes=game.run(()=>{S.floor=5;S.deepest=50;S.settings.controlMode='manual';
  const seen=[];for(let i=0;i<4;i++){cycleControlMode();seen.push(S.settings.controlMode);}return seen;});
result.autoBlockedAtFrontier=game.run(()=>{S.floor=50;S.deepest=50;S.settings.controlMode='onehand';
  cycleControlMode();return S.settings.controlMode;});
console.log('消耗品実測',result);
console.table(result.at.map(r=>({深度:r.depth,無し:`${(r.無し*100).toFixed(1)}%`,一段目:`${(r.一段目*100).toFixed(1)}%`,
  三段目:`${(r.三段目*100).toFixed(1)}%`,一段目差:`${(r.一段目差*100).toFixed(1)}pt`,三段目差:`${(r.三段目差*100).toFixed(1)}pt`})));
if(result.heals<2||result.heals>5)throw new Error(`深度10一周の癒血の雫換算 ${result.heals.toFixed(2)} は2〜5個でない`);
// 1段目は「無いよりまし」で止める。ここが大きいと上位品を作る理由が消える。
const pt=x=>(x*100).toFixed(1);
if(result.lowGain<.03)throw new Error(`1段目そろえの死亡率改善 ${pt(result.lowGain)}pt が小さすぎる（持ち込む意味が無い）`);
if(result.lowGain>.15)throw new Error(`1段目そろえの死亡率改善 ${pt(result.lowGain)}pt が大きすぎる（上位品を作る動機が消える）`);
// 3段目は明確に深く行ける。ここが小さいと固有素材を集める意味が無い。
if(result.highGain<.15)throw new Error(`3段目そろえの死亡率改善 ${pt(result.highGain)}pt が小さすぎる（固有素材を集める動機が無い）`);
if(result.highGain>.40)throw new Error(`3段目そろえの死亡率改善 ${pt(result.highGain)}pt が大きすぎる（装備より持ち込みが効いてしまう）`);
if(result.tierGain<.08)throw new Error(`段階差 ${pt(result.tierGain)}pt が小さい（上位品を作る動機にならない）`);
if(!result.itemUseWorks)throw new Error('アイテムを1タップ相当の呼び出しで使用できない');
if(!result.doesNotPause)throw new Error('アイテム使用でゲームが停止した');
if(new Set(result.modes).size!==3)throw new Error(`操作モードの巡回が3種類にならない（${result.modes.join(',')}）`);
if(result.autoBlockedAtFrontier==='auto')throw new Error('未到達の深度でオートに切り替わった');
