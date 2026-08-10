import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const gamePath=fileURLToPath(new URL('../public/index.html',import.meta.url));
const server=createServer(async(_q,res)=>{res.setHeader('content-type','text/html; charset=utf-8');res.end(await readFile(gamePath));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true});const page=await browser.newPage();
await page.goto(`http://127.0.0.1:${server.address().port}`);
const report=await page.evaluate(()=>{
  S.cls='warrior';S.base={lv:60,xp:0,pts:0,str:180,mag:0,def:60,agi:60,spi:0,luk:0};S.p=newPlayer();
  const bands=[[1,20],[21,50],[51,100],[101,300]],distribution=[],floorRatios=[];
  for(const [lo,hi] of bands){const count=Object.fromEntries(ELEMENT_KEYS.map(k=>[k,0]));let total=0;
    for(let fl=lo;fl<=hi;fl++){_s=(fl*2654435761)>>>0;enterFloor(fl);const normal=S.enemies.filter(e=>!e.boss),dom=dominantElement(fl),major=normal.filter(e=>e.element===dom).length;floorRatios.push({floor:fl,ratio:major/normal.length});for(const e of normal){count[e.element]++;total++;}}
    distribution.push({band:`${lo}-${hi}`,...Object.fromEntries(ELEMENT_KEYS.map(k=>[k,count[k]/total]))});}
  const matchup=[];for(const a of [...ELEMENT_KEYS,'neutral'])for(const d of [...ELEMENT_KEYS,'neutral'])matchup.push({attacker:a,defender:d,multiplier:elementMultiplier(a,d)});
  const slots=SLOTK,build=e=>Object.fromEntries(slots.map((slot,i)=>[slot,{slot,element:i<5?e:'neutral',main:{id:'atk',v:10},affs:[],lv:1}]));
  const resonanceRows=ELEMENT_KEYS.map(element=>{S.gear=build(element);return{element,...resonance()};});S.gear=Object.fromEntries(slots.map(slot=>[slot,{slot,element:'neutral',main:{id:'atk',v:10},affs:[],lv:1}]));const neutral={...resonance(),mainValue:mainV(S.gear.weapon)};
  // 同一の実ダメージ経路を通して、有利/不利フロア相当の撃破時間比を測る。
  S.gear=build('fire');S.p=newPlayer();const timeToKill=element=>{const e={hp:10000,max:10000,x:0,y:0,r:.3,element,eleRes:{fire:1},boss:0,heavy:1,shield:0,flash:0,agro:false};S.enemies=[e];S.dmgLog=[];let hits=0;while(e.hp>0&&hits<1000){hurtE(e,100,false,0,0,true);hits++;}return hits;};
  return{distribution,floorRatios,matchup,resonanceRows,neutral,clearTime:{advantage:timeToKill('wood'),disadvantage:timeToKill('water')}};
});
await page.evaluate(()=>localStorage.setItem('descent_v5',JSON.stringify({cls:'warrior',tutorial:{phase:'done'},gear:{weapon:{slot:'weapon',wt:'sword',base:'ロングソード',main:{id:'atk',v:10},affs:[],rar:0,ilvl:1,lv:1}}})));
await page.reload();const legacy=await page.evaluate(()=>S.gear.weapon.element);
await browser.close();await new Promise(resolve=>server.close(resolve));
console.log('\n深度帯ごとの属性分布');console.table(report.distribution.map(r=>({深度帯:r.band,火:(r.fire*100).toFixed(1)+'%',水:(r.water*100).toFixed(1)+'%',木:(r.wood*100).toFixed(1)+'%',光:(r.light*100).toFixed(1)+'%',闇:(r.dark*100).toFixed(1)+'%'})));
console.log('\n共鳴（5個）');console.table(report.resonanceRows.map(r=>({属性:r.element,段階:r.stage,与ダメージ:r.damage,耐性:r.resist})));
console.log('\n実ダメージによるクリア時間');console.table([{有利:report.clearTime.advantage,不利:report.clearTime.disadvantage,時間比:(report.clearTime.disadvantage/report.clearTime.advantage).toFixed(2)}]);
for(const row of report.distribution)for(const k of ['fire','water','wood','light','dark'])if(row[k]<.15||row[k]>.25)throw new Error(`${row.band} ${k}: ${(row[k]*100).toFixed(1)}% は15〜25%の範囲外`);
for(const row of report.floorRatios)if(row.ratio<.60||row.ratio>.70)throw new Error(`深度${row.floor}: 優勢比率 ${(row.ratio*100).toFixed(1)}% は60〜70%の範囲外`);
const expected={fire:{wood:1.5,water:.6},water:{fire:1.5,wood:.6},wood:{water:1.5,fire:.6},light:{dark:1.3},dark:{light:1.3}};
for(const [a,defs] of Object.entries(expected))for(const [d,m] of Object.entries(defs))if(elementMultiplierFrom(report.matchup,a,d)!==m)throw new Error(`${a}→${d} の倍率が${m}ではない`);
if(report.clearTime.disadvantage/report.clearTime.advantage<1.4)throw new Error('有利・不利フロアのクリア時間差が1.4倍未満');
if(report.neutral.stage!==0||report.neutral.mainValue!==12)throw new Error('無属性装備の共鳴除外または基礎値1.15倍が不正');
if(legacy!=='neutral')throw new Error('既存セーブ装備が無属性へ移行されない');
console.log('既存セーブ移行',legacy,'/ 全属性分布・局所優勢・倍率を確認');
function elementMultiplierFrom(rows,a,d){return rows.find(x=>x.attacker===a&&x.defender===d).multiplier;}
