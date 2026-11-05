import assert from 'node:assert/strict';
import {test} from 'node:test';
import {CraftingActions} from '../dist/crafting-actions.js';
import {createCraftingRules} from '../dist/crafting.js';
import {CraftingContent} from '../dist/crafting-content.js';
import {ItemContent} from '../dist/item-rules.js';
import {itemPack} from '../scripts/compile-item-content.mjs';
import {craftingPack} from '../scripts/compile-crafting-content.mjs';
const items=new ItemContent(itemPack()),rules=new CraftingContent(craftingPack(items),items).rules;
const mint=(uid=1)=>({uid,baseId:'helmet_armor',rarity:'magic',ilvl:80,tier:1,baseRoll:.5,affixes:[]});
function setup(){
 const ctx={items:[mint()],equipped:{},essences:{coarse:100,glimmering:100,brilliant:100,pristine:100}},account={craftLore:{},ledger:{}};
 const def=rules.ports.pools(items.pack.bases.helmet_armor).prefix.find(d=>d.tiers.some(t=>!t.magicOnly));
 account.craftLore[def.family]={rank:1,progress:0};const events=[];
 const ports={carry:c=>c,account:()=>account,hasFeature:()=>false,progression:()=>true,reach:()=>true,nearBench:()=>true,nearCounter:()=>true,
  bagItem:(c,uid)=>c.items.find(i=>i.uid===uid),findCarried:(c,uid)=>[...c.items,...Object.values(c.equipped)].find(i=>i.uid===uid),
  remove:(bag,uid)=>{const index=bag.findIndex(i=>i.uid===uid);if(index>=0)bag.splice(index,1);events.push('remove');},
  spend:(c,gain)=>{events.push('spend');if((c.essences[gain.essence]??0)<gain.count)return false;c.essences[gain.essence]-=gain.count;return true;},
  grant:(c,gain)=>{events.push('grant');c.essences[gain.essence]=(c.essences[gain.essence]??0)+gain.count;},
  random:()=>{events.push('draw');return .5;},recalc:()=>events.push('recalc'),dirty:()=>events.push('dirty'),save:()=>events.push('save'),
  refuse:(_c,reason)=>events.push(reason),cue:(_c,cue)=>events.push(cue),skill:item=>item.skill??null,support:item=>item.support??null,
  skillPayload:item=>item.gem?.kind==='skill'?item.gem:null,grantSupport:(_c,support)=>events.push(support),memoryKind:()=>null,
 };
 return {ctx,account,def,events,ports,actions:()=>new CraftingActions(rules,ports)};
}
test('craft pays before rolling, reroll rolls before payment, and neither replaces item identity',()=>{
 const h=setup(),item=h.ctx.items[0],actions=h.actions();actions.craftAffix(h.ctx,1,h.def.id,1);
 assert.equal(h.ctx.items[0],item);assert.equal(item.affixes.length,1);assert(h.events.indexOf('spend')<h.events.indexOf('draw'));assert(item.affixes[0].crafted);
 h.events.length=0;item.affixes=[{id:h.def.id,tier:1,rolls:[.5]}];h.ctx.essences.glimmering=0;
 actions.rerollAffix(h.ctx,1,0,0);assert(h.events.indexOf('draw')<h.events.indexOf('spend'));assert(!item.affixes[0].locked);assert(!h.events.includes('dirty'));
});
test('worn crafting spends and recalculates, keeper lock protects salvage only',()=>{
 const h=setup(),item=h.ctx.items.pop();h.ctx.equipped.helmet=item;item.locked=true;
 h.actions().craftSocket(h.ctx,item.uid);assert.deepEqual(item.sockets,[null]);assert.equal(item.craftedSockets,1);
 assert(h.events.indexOf('spend')<h.events.indexOf('recalc'));assert(h.events.indexOf('recalc')<h.events.indexOf('dirty'));
 h.events.length=0;h.actions().salvageItem(h.ctx,item.uid);assert.deepEqual(h.events,[]);assert.equal(h.ctx.equipped.helmet,item);
});
test('salvage checks progression after granting and batches account writes',()=>{
 const h=setup();h.account.craftLore[h.def.family]={rank:0,progress:2};h.ctx.items[0].affixes=[{id:h.def.id,tier:0,rolls:[.5]}];
 let active=true;const grant=h.ports.grant;h.ports.grant=(...args)=>{grant(...args);active=false;};h.ports.progression=()=>active;
 h.actions().salvageItem(h.ctx,1,'break');assert.equal(h.ctx.items.length,0);assert.equal(h.account.craftLore[h.def.family].rank,0);assert(!h.events.includes('save'));
 const b=setup();b.ctx.items.push(mint(2));b.actions().salvageBulk(b.ctx,'item');assert.equal(b.events.filter(e=>e==='save').length,1);assert.equal(b.events.filter(e=>e==='dirty').length,1);
 b.events.length=0;b.actions().salvageBulk(b.ctx,'item');assert.deepEqual(b.events,['dirty']);
});
test('bulk skill uses payload rarity, snapshots targets and leaves granted gems',()=>{
 const h=setup(),support={level:4,locked:true,rolled:{power:.75}};
 h.ctx.items=[{...mint(),gem:{kind:'skill',rarity:'legendary'},skill:{level:2,rarity:'legendary',sockets:[support]}},
  {...mint(2),gem:{kind:'skill',rarity:'legendary',granted:true}}, {...mint(3),gem:{kind:'skill',rarity:'rare'}}];
 h.actions().salvageBulk(h.ctx,'skill','legendary','sell');assert.deepEqual(h.ctx.items.map(i=>i.uid),[2,3]);assert(h.events.includes(support));assert(!h.events.includes('save'));
 const bulk=h.events.find(e=>e.kind==='bulk');assert.equal(bulk.count,1);assert.deepEqual(bulk.gains,[{essence:'coarse',count:11}]);
});
test('callback exceptions retain committed writes and release the recursion guard',()=>{
 const h=setup();let actions;h.ports.grant=()=>actions.salvageBulk(h.ctx,'item');actions=h.actions();
 assert.throws(()=>actions.salvageItem(h.ctx,1),/Reentrant/);assert.equal(h.ctx.items.length,0);
 assert.doesNotThrow(()=>actions.salvageBulk(h.ctx,'item'));assert.equal(h.events.at(-1),'dirty');
 const b=setup();b.ports.cue=()=>{throw new Error('presentation unavailable');};const bActions=b.actions();
 assert.throws(()=>bActions.craftAffix(b.ctx,1,b.def.id),/presentation/);assert.equal(b.ctx.items[0].affixes.length,1);assert.equal(b.ctx.essences.glimmering,94);
 bActions.salvageLockSet(b.ctx,1,true);assert.equal(b.ctx.items[0].locked,true);bActions.salvageLockSet(b.ctx,1,false);assert(!Object.hasOwn(b.ctx.items[0],'locked'));
});
test('the bound ports retain their receiver and cannot be replaced after construction',()=>{
 const h=setup();h.ports.value=true;h.ports.hasFeature=function(){return this.value;};const actions=h.actions();
 h.ports.hasFeature=()=>false;assert.equal(actions.craftSlots(),2);h.ports.value=false;assert.equal(actions.craftSlots(),1);
 const bad={...h.ports,random:undefined};assert.throws(()=>new CraftingActions(rules,bad),/random/);
 // Valid custom content identifiers must not read inherited account properties.
 const custom=setup(),definition={...custom.def,family:'__proto__'};
 const customRules=createCraftingRules({...rules.ports,ledgerCraftsUnlocked:'constructor',affix:id=>id===definition.id?definition:rules.ports.affix(id)});
 custom.account.craftLore=Object.fromEntries([['__proto__',{rank:0,progress:2}]]);
 custom.ctx.items[0].affixes=[{id:definition.id,tier:0,rolls:definition.lines.map(()=>.5)}];
 new CraftingActions(customRules,custom.ports).salvageItem(custom.ctx,1);
 assert.equal(custom.account.ledger.constructor,1);assert(Object.hasOwn(custom.account.ledger,'constructor'));
 assert.equal(Object.getPrototypeOf(custom.account.ledger),Object.prototype);assert.equal(custom.account.craftLore.__proto__.rank,1);
 const wallet=setup(),walletRules=createCraftingRules({...rules.ports,essenceIds:['constructor'],coarseEssence:'constructor'});
 wallet.ctx.essences={};wallet.ports.grant=(ctx,gain)=>Object.defineProperty(ctx.essences,gain.essence,{value:gain.count,writable:true,enumerable:true,configurable:true});
 const expected=walletRules.sellItemYield(wallet.ctx.items[0]);new CraftingActions(walletRules,wallet.ports).salvageBulk(wallet.ctx,'item',undefined,'sell');
 assert.deepEqual(wallet.events.find(e=>e.kind==='bulk').gains,[expected]);
});
