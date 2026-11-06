import fs from 'node:fs';
import assert from 'node:assert/strict';
import {makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {SKILLS} from '../src/data/skills';
import {SUPPORTS} from '../src/data/supports';
import {makeSkillInstance,BAR_SLOTS} from '../src/engine/skills';
import {canonicalVein} from '../src/engine/supportbase';
import {serializeCharacter,applySavedCharacter} from '../src/meta/character';
import {makeSkillGemItem} from '../src/engine/gemitems';
import {autoPlace} from '../src/engine/inventory';

const restore=seedGlobalRandom(32051);
try{
  const world=makeSimWorld('swashbuckler',32051),seat=world.localSeat;
  seat.meta.items=[];seat.meta.equipped={};seat.meta.knownSkills.clear();seat.actor.skills=Array(BAR_SLOTS).fill(null);
  world.devIgnoreSkillAttributes=true;
  const cut=Object.values(SUPPORTS).find(d=>d.rollBase)!;
  const ids=['fireball','firebolt','tame_beast'];
  for(const [at,id] of ids.entries()){
    const inst=makeSkillInstance(SKILLS[id],5,2);inst.rarity='legendary';inst.empowermentRank=1;inst.locked=true;
    inst.sockets[1]={def:cut,level:3,locked:true,rolled:canonicalVein(cut.rollBase!)};
    const wrapper=makeSkillGemItem(inst);assert(autoPlace(seat.meta.items,wrapper));
    assert(world.learnSkill(wrapper.uid,seat,at*2),id);
  }
  const original=serializeCharacter(world),rows=[];
  const inputs:(string|null)[][]=[original.bar,[],[ids[2]],['retired',null,ids[0],ids[0]],
    Array(BAR_SLOTS).fill('retired'),[...Array(BAR_SLOTS).fill('retired'),null,ids[1]]];
  for(const [n,bar] of inputs.entries()){
    const s=JSON.parse(JSON.stringify(original));s.bar=[...bar];
    if(n===3){
      s.knownSkills.push({...s.knownSkills[0],skillId:'retired'});
      s.knownSkills[1].sockets[1].supportId='retired';
      s.knownSkills[1].replenishmentPaused=true;
    }
    const w=makeSimWorld('swashbuckler',32052+n),adopt=w.adoptSavedMeta;
    let passed:string[]|undefined;
    w.adoptSavedMeta=function(meta,slots,level){passed=[...slots] as string[];return adopt.call(this,meta,slots,level);};
    const before=JSON.stringify(s);
    assert(applySavedCharacter(w,s));assert(passed);assert.equal(JSON.stringify(s.bar),JSON.stringify(bar));
    const saved=serializeCharacter(w);
    const known=[...w.localSeat.meta.knownSkills.keys()];
    assert.deepEqual(known,ids);
    const learned=w.localSeat.meta.knownSkills.get(ids[0])!;
    const seated=w.seatHero(w.localSeat).skills.filter(i=>i?.def.id===ids[0]);
    assert(seated.every(i=>i===learned));assert(learned.locked&&learned.sockets[1]?.locked);
    const removed=w.unlearnSkill(ids[0]);assert(removed);const gem=w.meta.items.find(i=>i.gem?.kind==='skill'&&i.gem.skillId===ids[0])!;
    assert(gem.locked&&gem.gem?.kind==='skill'&&gem.gem.sockets[1]?.locked);
    assert.deepEqual(gem.gem.sockets[1].rolled,canonicalVein(cut.rollBase!));
    rows.push({inputBar:bar,known,passed,capacity:BAR_SLOTS,bar:saved.bar,book:saved.knownSkills,retiredCopy:gem,
      sameInput:before===JSON.stringify(s),seatedReferences:seated.length});
  }
  fs.writeFileSync(process.argv[2],JSON.stringify(rows)+'\n',{flag:'wx'});
}finally{restore();}
