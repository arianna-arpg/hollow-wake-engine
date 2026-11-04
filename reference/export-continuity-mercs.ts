import fs from 'node:fs';
import assert from 'node:assert/strict';
import {CLASSES} from '../src/data/classes';
import {PASSIVE_ADJACENCY,classStartNode} from '../src/data/passives';
import {type MercSnapshot} from '../src/meta/mercs';
import {makeSimWorld,bootSimEngine} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {applySavedCharacter,serializeCharacter} from '../src/meta/character';
bootSimEngine();
const make=(def:typeof CLASSES[number]):MercSnapshot=>{
 const root=classStartNode(def.id),bar=[...def.bar],opening=bar.filter((s):s is string=>s!==null);
 return {classId:def.id,level:28,baseAttrs:{...def.attributes},bar,allocated:[root,...(PASSIVE_ADJACENCY[root]??[]).slice(0,3),'voc_warbringer_root','__retired_node'],
  vocations:['warbringer'],knownSkills:opening.map((id,i)=>({skillId:id,level:2+(i%3),rarity:'common',sockets:[{supportId:'momentum',level:3}]})),equipped:{}};
};
const records=[],company=[];
for(const [index,def]of CLASSES.entries()){
 const restore=seedGlobalRandom(667+index);
 try{
  const world=makeSimWorld('warrior',667+index),snapshot=make(def),name='Blade '+def.id;
  world.restoreHiredMerc({name,snapshot,mercId:'merc-'+def.id});
  assert.equal(world.hiredMercs.length,1);
  const hired=world.hiredMercs[0],seat=hired.seat;
  const describe=()=>({id:seat.id,name:seat.meta.name,actorName:seat.actor.name,level:seat.actor.level,mode:seat.meta.modeId,
    opening:seat.meta.opening,skills:seat.actor.skills.map(s=>s?[s.def.id,s.level,s.sockets.map(p=>p?[p.def.id,p.level]:null)]:null),attrs:seat.meta.baseAttrs,
    roots:[...seat.meta.allocated],vocations:seat.meta.vocations,owned:seat.meta.opening!==snapshot.bar&&seat.meta.baseAttrs!==snapshot.baseAttrs&&seat.meta.baseAttrs!==seat.meta.attrs,
    maxLife:seat.actor.maxLife(),lifeFraction:seat.actor.life/seat.actor.maxLife()});
  const first=describe();seat.actor.life=seat.actor.maxLife()/2;world.player.level=12;world.resyncMercenary();
  const synced=describe();assert(Math.abs(synced.lifeFraction-.5)<1e-8);assert.equal(synced.name,name);
  const saved=serializeCharacter(world),other=makeSimWorld('warrior',701+index);
  assert(applySavedCharacter(other,saved));assert.equal(other.hiredMercs.length,1);
  records.push({id:def.id,first,synced,saved:saved.mercenaries?.map(h=>[h.name,h.snapshot.classId,h.mercId]),resumed:other.hiredMercs.map(h=>({id:h.seat.id,name:h.seat.meta.name,classId:h.seat.meta.classDef.id,opening:h.seat.meta.opening,mercId:h.mercId}))});
  if(index===0){
    const one={name:'Old blade',snapshot,mercId:'retained'},two={name:'New blade',snapshot:make(CLASSES[1]),templateId:'hire-a'},bad={name:'Retired calling',snapshot:{...snapshot,classId:'__removed'}};
    for(const [label,members]of [['legacy',undefined],['empty',[]],['multiple',[two,bad,one]],['retired',[bad]]] as const){
      const w=makeSimWorld('warrior',790);const sample={...saved,mercenary:one,mercenaries:members?[...members]:undefined};assert(applySavedCharacter(w,sample));
      company.push({label,members:w.hiredMercs.map(h=>({id:h.seat.id,name:h.name,cls:h.seat.meta.classDef.id,mercId:h.mercId??null,template:h.templateId??null})),seats:w.seats.map(s=>s.id)});
    }
  }
 }finally{restore();}
}
fs.writeFileSync(process.argv[2],JSON.stringify({records,company})+'\n',{flag:'wx'});
