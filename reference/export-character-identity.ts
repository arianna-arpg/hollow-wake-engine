import fs from 'node:fs';
import assert from 'node:assert/strict';
import {CLASSES} from '../src/data/classes';
import {makeAccount,isClassDiscovered,isClassUnlocked,unlockedClassCount,STARTER_CLASSES} from '../src/meta/account';
import {serializeCharacter,rebuildSavedMeta,applySavedCharacter} from '../src/meta/character';
import {makeSimWorld,bootSimEngine} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
bootSimEngine();assert.equal(CLASSES.length,39);
const empty=makeAccount(),initial={discovered:[...empty.unlockedClasses],pending:[...empty.pendingClassUnlocks],starter:[...STARTER_CLASSES]};
const gates=[];
for(const id of [...CLASSES.map(c=>c.id),'__retired_class']){
  const a=makeAccount(),known=[];
  for(const discovered of [false,true])for(const pending of [false,true]){
    if(discovered)a.unlockedClasses.add(id);else a.unlockedClasses.delete(id);
    if(pending)a.pendingClassUnlocks.add(id);else a.pendingClassUnlocks.delete(id);
    known.push({discovered,pending,seen:isClassDiscovered(a,id),select:isClassUnlocked(a,id),count:unlockedClassCount(a)});
  }gates.push({id,known});
}
const records=[],identityCases=[];
for(const [i,def]of CLASSES.entries()){
  const restore=seedGlobalRandom(333+i);
  try{
    const w=makeSimWorld(def.id,333+i),m=w.meta;
    assert.equal(m.classDef,def);assert.notEqual(m.baseAttrs,m.attrs);assert.notEqual(m.baseAttrs,def.attributes);
    m.charId='probe-'+def.id;
    const before={classId:def.id,name:m.name,heroName:w.player.name,opening:m.opening,borrowedOpening:m.opening===def.bar,
      base:m.baseAttrs,attrs:m.attrs,allocated:[...m.allocated],known:[...m.knownSkills.keys()],bar:w.player.skills.map(s=>s?.def.id??null),
      xp:m.xp,needed:m.xpNeeded,points:m.passivePoints,vocations:m.vocations,vocationPoints:m.vocationPoints};
    const save=serializeCharacter(w),rebuilt=rebuildSavedMeta(save);assert(rebuilt);
    const resumed=applySavedCharacter(w,save);assert(resumed);const after=w.meta;
    records.push({id:def.id,before,save:{classId:save.classId,name:save.name,charId:save.charId,opening:save.opening,bar:save.bar,level:save.level,
      mode:save.modeId,modeStage:save.modeStage,keys:Object.keys(save.baseAttrs)},rebuilt:{originalClass:rebuilt.meta.classDef===def,
      separateOpening:rebuilt.meta.opening!==save.opening,separateBase:rebuilt.meta.baseAttrs!==save.baseAttrs,
      separateAttrs:rebuilt.meta.attrs!==rebuilt.meta.baseAttrs,known:[...rebuilt.meta.knownSkills.keys()],root:[...rebuilt.meta.allocated]},
      resumed:{classId:after.classDef.id,charId:after.charId,name:after.name,actorName:w.player.name,opening:after.opening,known:[...after.knownSkills.keys()],
        bar:w.player.skills.map(s=>s?.def.id??null),attrs:after.attrs,level:w.player.level}});
    if(i===0){
      for(const [label,fragment]of [['unknown',{classId:'__retired_class'}],['legacy',{opening:undefined,modeId:undefined,modeStage:undefined,charId:undefined,name:'   '}],
        ['custom',{opening:[null,'firebolt',null],name:'  A New Name  ',modeId:'immortal',modeStage:2,charId:'stable'}],['empty',{opening:[],name:'',charId:''}]] as const){
        const variant={...save,...fragment},v=rebuildSavedMeta(variant as typeof save);
        identityCases.push({label,result:v?{classId:v.meta.classDef.id,name:v.meta.name,opening:v.meta.opening,mode:v.meta.modeId,stage:v.meta.modeStage,
          charId:v.meta.charId===save.charId?'saved':v.meta.charId==='stable'?'specified':v.meta.charId===''?'empty':'generated',
          ownsOpening:v.meta.opening!==variant.opening&&v.meta.opening!==def.bar}:null});
      }
    }
  }finally{restore();}
}
fs.writeFileSync(process.argv[2],JSON.stringify({initial,gates,records,identityCases})+'\n',{flag:'wx'});
console.log({classes:records.length,gates:gates.length*4,identityCases:identityCases.length});
