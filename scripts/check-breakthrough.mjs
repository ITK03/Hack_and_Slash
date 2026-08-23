import { loadGame } from './game-env.mjs';
const game=await loadGame();
const r=game.run(()=>{
 S.mats={crystal:{},core:{}};S.unlockedCharacters=['warrior:gai'];S.breakthroughs={};
 const steps=[];for(let i=0;i<6;i++){steps.push(awardCharacter('warrior:gai'));}
 const level=breakthroughLevel('warrior:gai');
 const beforeCore=materialCount('core');const capped=awardCharacter('warrior:gai');
 return{steps:steps.map(x=>x.kind),level,capped,coreGain:materialCount('core')-beforeCore,
   hasCoreRoute:typeof globalThis.breakthroughWithCore==='function'};
});
console.log('重複入手だけの限界突破実測',r);
if(r.steps.slice(0,5).some(x=>x!=='breakthrough')||r.level!==5)throw new Error('重複1体ごとに1凸して5凸で止まらない');
if(r.hasCoreRoute)throw new Error('核による限界突破経路が残っている');
if(r.capped.kind!=='core'||r.coreGain!==3)throw new Error('5凸後の重複変換が不正');
