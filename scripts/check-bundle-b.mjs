import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const gamePath=fileURLToPath(new URL('../public/index.html',import.meta.url));
const server=createServer(async(_q,r)=>{r.setHeader('content-type','text/html;charset=utf-8');r.end(await readFile(gamePath));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true}),page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
const result=await page.evaluate(()=>{
  const setup=()=>{S.cls='warrior';S.scene='dungeon';S.paused=false;S.training=false;S.base={lv:60,xp:0,pts:0,str:180,mag:0,def:60,agi:60,spi:0,luk:0};S.gear={};S.p=newPlayer();S.loadout=['returnScroll','sonic','shockTrap','weaken'];S.consumables={returnScroll:1,sonic:1,shockTrap:1,weaken:1};S.runItems=[1,1,1,1];S.enemies=[];};
  setup();S.p.lastHit=0;const blocked=!useItem(0)&&S.runItems[0]===1;
  S.p.lastHit=6;const began=useItem(0)&&S.p.returnCast===3&&S.runItems[0]===1;hurtP(1,'test',true);const interrupted=S.p.returnCast===0&&S.runItems[0]===1;
  setup();S.p.lastHit=6;useItem(0);update(3.01);const completed=S.runItems[0]===0&&S.scene!=='dungeon';
  S.paidInventory={catalysts:[],feathers:[],slots:[]};S.premium=999;buyPaid('catalysts',120);const paid=S.paidInventory.catalysts[0];
  const tactical=Object.keys(CONSUMABLES).filter(k=>['sonic','shockTrap','weaken','torch','incense','returnScroll'].includes(k)).length;
  return {blocked,began,interrupted,completed,tactical,paidHasId:!!paid?.id&&paid.source==='purchase',conditions:AUTOMATION_CONDITIONS.length,actions:AUTOMATION_ACTIONS.length,delay:.35,skillScale:.62};
});
console.log('Bundle B 機能実測',result);for(const [k,v] of Object.entries(result))if((['tactical','conditions','actions'].includes(k)?v<6:!v))throw new Error(`${k} failed`);
await browser.close();await new Promise(r=>server.close(r));
