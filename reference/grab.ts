import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom,mulberry32} from '../src/sim/rng';
import {Actor} from '../src/engine/actor';
import {makeSkillInstance,type SkillInstance} from '../src/engine/skills';
import {GRAB_CFG,GRAB_MARKER,GRAB_VERB_LABEL,type GrabSpec,type GrabHandoffSpec} from '../src/engine/grab';
import {DAMAGE_COLOR} from '../src/engine/stats';

const specs: {name:string;grab:GrabSpec;end?:'release'|'sever'|'struggle'|'orphan'|'handoff'}[]=[
  ...(['carry','drag','pin','swallow'] as const).map(verb=>({name:verb,grab:{verb},end:'release' as const})),
  {name:'sever',grab:{verb:'swallow'},end:'sever'}, {name:'struggle',grab:{verb:'swallow'},end:'struggle'},
  {name:'orphan',grab:{verb:'swallow'},end:'orphan'}, {name:'handoff',grab:{verb:'swallow'},end:'handoff'},
  {name:'digestion',grab:{verb:'swallow',dot:{type:'fire',frac:.1},leech:.5}},
];
const restore=seedGlobalRandom(0x4d3307),courses:unknown[]=[];
try{
  for(const spec of specs){
    const w=makeSimWorld('warrior',0x4d3307),a=new Actor('holder','player',{x:800,y:600}),v=new Actor('victim','enemy',{x:840,y:600}),r=new Actor('receiver','player',{x:820,y:620});
    w.walk=null;w.meta.modeId='immortal';w.actors=[a,v,r];w.time=1;
    for(const body of w.actors){body.radius=10;body.sheet.setBase('life',100);body.sheet.setBase('weight',1);body.sheet.setBase('healTaken',1);body.life=100;body.poise=0;body.es=0;body.ward=0;body.endurance=0;}
    a.life=50;
    const skill=makeSkillInstance({id:'m3-grab',name:'Grab',description:'',tags:['melee'],color:'#fff',manaCost:0,useTime:0,cooldown:0,delivery:{type:'self'},effects:[{type:'grabSeize',grab:{verb:'carry'}}]},1);
    a.skills=[skill];r.skills=[skill];
    const seam=w as unknown as {grabSeize(a:Actor,i:SkillInstance,v:Actor,s:GrabSpec):boolean;updateGrabs(dt:number):void;grabRelease(a:Actor):void;grabHandoff(a:Actor,v:Actor,s:GrabHandoffSpec):boolean};
    const snapshot=()=>[a,v,r].map(body=>({id:body.id,pos:{...body.pos},facing:body.facing,life:body.life,grip:body.gripping,held:body.heldBy,
      untargetable:body.untargetable,proof:body.grabProofUntil,statuses:body.statuses.map(s=>s.id),target:body.aiTargetId}));
    const originalRandom=Math.random,random=mulberry32(52),draws:number[]=[];Math.random=()=>{const n=random();draws.push(n);return n;};
    try{
      const initial=JSON.parse(JSON.stringify(snapshot())),steps:unknown[]=[];
      const record=(step:unknown)=>steps.push(JSON.parse(JSON.stringify({step,expected:snapshot(),draws:[...draws]})));
      assert(seam.grabSeize(a,skill,v,spec.grab));record({kind:'seize'});
      for(const dt of[.1,.2]){w.time+=dt;seam.updateGrabs(dt);record({kind:'advance',dt,time:w.time});}
      if(spec.end==='release')seam.grabRelease(a);
      else if(spec.end==='sever'){a.gripping!.severed=1;seam.updateGrabs(.1);}
      else if(spec.end==='struggle'){a.gripping!.struggle=1;seam.updateGrabs(.1);}
      else if(spec.end==='orphan'){w.actors=[v,r];seam.updateGrabs(.1);}
      else if(spec.end==='handoff')assert(seam.grabHandoff(a,v,{}));
      if(spec.end)record({kind:spec.end});
      courses.push({name:spec.name,grab:spec.grab,initial,steps});
    }finally{Math.random=originalRandom;}
  }
  writeFileSync(process.argv[2],JSON.stringify({originalOnly:true,rules:{...GRAB_CFG,markers:GRAB_MARKER,labels:GRAB_VERB_LABEL,physicalColor:DAMAGE_COLOR.physical},courses}));
}finally{restore();}
