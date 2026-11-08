// Raw frozen-World observations. No SDK imports or replacement game decisions.
// Only the casting-progress phase advances; full-frame regeneration is outside
// this equipment boundary and must not be inferred from this course.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom,mulberry32} from '../src/sim/rng';
import {forgeItem} from '../src/engine/itemgen';
import {SKILLS} from '../src/data/skills';
import {makeSkillInstance,skillCooldownSeconds} from '../src/engine/skills';
import {skillDamageBands} from '../src/engine/damage';

const clone=(value:any)=>JSON.parse(JSON.stringify(value));
const stats=['life','mana','castSpeed','critChance','critMulti','damage','accuracy','armor','evasion'];
const rows:any[]=[];
function course(name:string,bases:string[],run:(h:any)=>void,overlevel=false){
 const restore=seedGlobalRandom(430217);
 try{
  const w=makeSimWorld('magician',430217),a=w.player;
  w.walk=null;
  const skill=makeSkillInstance(SKILLS.ruin,5,0);
  a.skills=[skill];w.localSeat.meta.knownSkills.set('ruin',skill);
  w.localSeat.meta.items=[];w.localSeat.meta.equipped={};
  w.recalcSeat(w.localSeat);a.fillResources();a.useLock=0;a.cooldowns.clear();a.casting=null;
  const items=bases.map((baseId,index)=>forgeItem({baseId,ilvl:overlevel?21:1,
   rarity:overlevel?'rare':'common',quality:.5,...overlevel?{affixes:[{id:'attr_intelligence'}]}:{},rng:mulberry32(34+index)})!);
  assert(items.every(Boolean));
  items.forEach((item,index)=>{item.x=index;item.y=0;w.localSeat.meta.items.push(item);});
  const initialItems=clone(items),steps:any[]=[];
  let draws=0;const seeded=Math.random;Math.random=()=>{draws++;return seeded();};
  const observe=()=>({
   attributes:{...a.attributeValues},life:a.life,mana:a.mana,maxLife:a.maxLife(),maxMana:a.maxMana(),
   stats:Object.fromEntries(stats.map(id=>[id,a.sheet.get(id)])),
   preview:skillDamageBands(a,skill),cost:a.skillCost(skill),cooldown:skillCooldownSeconds(a,skill),
   cast:a.casting?{mode:a.casting.mode,elapsed:a.casting.elapsed,total:a.casting.total,
    paidCost:clone(a.casting.paidCost),skill:a.casting.inst.def.id,originalInstance:a.casting.inst===skill}:null,
   useLock:a.useLock,cooldowns:[...a.cooldowns],randomDraws:draws,time:w.time,
   bag:clone(w.localSeat.meta.items),equipped:clone(w.localSeat.meta.equipped)
  });
  const step=(command:any,operation:()=>void)=>{
   const active=a.casting;
   operation();
   const retainedActive=active===null?null:a.casting===active;
   if(['equip','unequip'].includes(command.op) && active)assert(retainedActive,'Equipment replaced the active cast');
   steps.push({command,retainedActive,expected:observe()});
  };
  steps.push({command:{op:'initial'},retainedActive:null,expected:observe()});
  const h={
   a,w,skill,items,
   equip:(index:number,slot:string)=>step({op:'equip',uid:items[index].uid,slot},()=>w.equipItem(w.localSeat,items[index].uid,slot)),
   unequip:(slot:string,x?:number,y?:number)=>step({op:'unequip',slot,...x===undefined?{}:{x,y}},()=>w.unequipItem(w.localSeat,slot,x,y)),
   press:()=>step({op:'press'},()=>{assert(w.useSkill(a,skill,{x:a.pos.x+100,y:a.pos.y},true));assert(a.casting);}),
   advance:(dt:number)=>step({op:'advanceCasting',dt},()=>{w.time+=dt;w.updateCasting(a,dt);}),
   resources:(life:number,mana:number)=>step({op:'setResources',life,mana},()=>{a.life=life;a.mana=mana;}),
   fill:()=>step({op:'fillResources'},()=>a.fillResources()),
   clocks:()=>step({op:'fixtureClocks',cooldowns:[['unrelated',2.75]],useLock:.03125},()=>{
    a.cooldowns.set('unrelated',2.75);a.useLock=.03125;
   }),
   ready:()=>step({op:'fixtureRecovery',useLock:0},()=>{a.useLock=0;})
  };
  run(h);
  rows.push({name,seed:430217,classId:'magician',skill:{id:'ruin',level:5,sockets:0},initialItems,steps});
 }finally{restore();}
}
for(const [base,slot] of [['ring_lapis','ring1'],['ring_coral','ring1'],['amulet_opal','amulet']]){
 course('equip-'+base+'-during-cast',[base],h=>{
  h.press();h.advance(h.a.casting.total*.25);h.clocks();h.equip(0,slot);
  h.advance(h.a.casting.total-h.a.casting.elapsed);
 });
}
for(const base of ['ring_lapis','ring_coral']){
 course('unequip-'+base+'-during-cast',[base],h=>{
  h.equip(0,'ring1');h.fill();h.press();h.advance(h.a.casting.total*.25);h.clocks();
  h.unequip('ring1');h.advance(h.a.casting.total-h.a.casting.elapsed);
 });
}
course('replace-mana-with-life-during-cast',['ring_lapis','ring_coral'],h=>{
 h.equip(0,'ring1');h.fill();h.press();h.advance(h.a.casting.total*.25);h.equip(1,'ring1');
 h.advance(h.a.casting.total-h.a.casting.elapsed);
});
course('worn-ring-swap-during-cast',['ring_lapis','ring_coral'],h=>{
 h.equip(0,'ring1');h.equip(1,'ring2');h.fill();h.press();h.equip(0,'ring2');
 h.advance(h.a.casting.total);
});
course('repeated-seat-is-no-op',['ring_lapis'],h=>{
 h.equip(0,'ring1');h.press();h.advance(h.a.casting.total*.25);
 const before=clone(h.a.casting);h.equip(0,'ring1');assert.deepEqual(clone(h.a.casting),before);
});
course('refused-level-during-cast',['ring_lapis'],h=>{
 h.press();h.advance(h.a.casting.total*.25);h.equip(0,'ring1');
 assert(!h.w.localSeat.meta.equipped.ring1);
},true);
course('blocked-unequip-during-cast',['ring_lapis','ring_coral'],h=>{
 h.equip(0,'ring1');h.fill();h.press();h.advance(h.a.casting.total*.25);
 h.unequip('ring1',h.items[1].x,h.items[1].y);assert.equal(h.w.localSeat.meta.equipped.ring1,h.items[0]);
});
course('no-refill-on-equip',['ring_lapis','ring_coral'],h=>{
 h.resources(11,13);h.equip(0,'ring1');h.equip(1,'ring2');
 assert.equal(h.a.life,11);assert.equal(h.a.mana,13);
});
course('next-cast-uses-new-gear',['amulet_opal'],h=>{
 h.press();h.advance(h.a.casting.total);h.equip(0,'amulet');
 // Only reset host recovery for the next input; the gear action must not do it.
 h.ready();
 h.press();h.advance(h.a.casting.total);
});
fs.writeFileSync(process.argv[2],JSON.stringify({schemaVersion:1,
 scope:'Original equipment actions and casting-progress phase; not full-frame regeneration or SDK acceptance',stats,rows})+'\n',{flag:'wx'});
console.log({courses:rows.length,observations:rows.reduce((n,row)=>n+row.steps.length,0)});
