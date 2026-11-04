import fs from 'node:fs';
import assert from 'node:assert/strict';
import {CLASSES,kitRungs} from '../src/data/classes';
import {classTierId,CLASS_TIER_BY_ID} from '../src/data/classTiers';
import {makeAccount} from '../src/meta/account';
import {ownedKitRungs,kitChoicesFor,resolveClassKit,rememberKitPicks,kitHasOptions} from '../src/meta/classkit';
import {makeSimWorld,bootSimEngine} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {serializeCharacter,rebuildSavedMeta} from '../src/meta/character';
import {NullInput} from '../src/net/intent';
bootSimEngine();
const matrix=[],hands=[];
for(const [index,c]of CLASSES.entries()){
  const rows=kitRungs(c),tiers=[...new Set(rows.map(r=>r.tier))];assert(tiers.length<=5);
  for(let mask=0;mask<(1<<tiers.length);mask++){
    const account=makeAccount();account.unlockedClassTiers=new Set(tiers.filter((_,i)=>mask&(1<<i)).map(t=>classTierId(c.id,t)));
    const alternate=Object.fromEntries(rows.filter(r=>r.replaces).map(r=>[r.replaces!,r.skill]));
    const illegal=Object.fromEntries(c.bar.filter((s):s is string=>!!s).map(s=>[s,'__illegal']));
    for(const [label,saved,request]of [['default',{},undefined],['remembered',alternate,undefined],['invalid',illegal,illegal],['explicit',illegal,alternate]] as const){
      account.kitPicks={[c.id]:{...saved},__other:{old:'untouched'}};
      const choice=kitChoicesFor(account,c),bar=resolveClassKit(account,c,request);
      const owned=ownedKitRungs(account,c);assert(owned.every(r=>rows.includes(r)));
      const hasOptions=kitHasOptions(account,c);rememberKitPicks(account,c,request??saved);
      matrix.push({id:c.id,mask,label,owned:owned.map(r=>[r.tier,r.skill,r.replaces??null]),choice,hasOptions,bar,stored:account.kitPicks});
    }
  }
  const restore=seedGlobalRandom(931+index);
  try{
    const world=makeSimWorld(c.id,931+index),account=world.account;
    for(const row of rows)account.unlockedClassTiers.add(classTierId(c.id,row.tier));
    const picks=Object.fromEntries(rows.filter(r=>r.replaces).map(r=>[r.replaces!,r.skill]));
    const bar=resolveClassKit(account,c,picks);
    world.createPlayer(c,{charId:'hand-'+c.id,name:'  Chosen '+c.name+'  ',modeId:'immortal',kit:bar,startingCompanions:false,startingFlasks:false});
    const snap=serializeCharacter(world),rebuilt=rebuildSavedMeta(snap);assert(rebuilt);
    const next=CLASSES[(index+1)%CLASSES.length],seat=world.addSeat('ally',next,new NullInput(),{startingCompanions:false,startingFlasks:false});
    assert.notEqual(seat.meta.baseAttrs,world.meta.baseAttrs);assert.notEqual(seat.meta.opening,world.meta.opening);
    hands.push({id:c.id,bar,opening:world.meta.opening,name:world.meta.name,actorName:world.player.name,persisted:snap.opening,restored:rebuilt.meta.opening,heroSkills:world.player.skills.map(s=>s?.def.id??null),
      ally:{id:seat.meta.classDef.id,opening:seat.meta.opening,mode:seat.meta.modeId,stage:seat.meta.modeStage,charId:seat.meta.charId,roots:[...seat.meta.allocated]}});
  }finally{restore();}
}
const registeredTiers=Object.keys(CLASS_TIER_BY_ID);
fs.writeFileSync(process.argv[2],JSON.stringify({registeredTiers,matrix,hands})+'\n',{flag:'wx'});
console.log({classes:hands.length,cases:matrix.length,registeredTiers});
