// The runner inserts the two original method declarations from locked source.
// Both variants use this same installed World and all its other adapters.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import {performance} from 'node:perf_hooks';
import {makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {World,MAX_LEARNED_SKILLS,type Seat} from '../src/engine/world';
import {SKILLS} from '../src/data/skills';
import {SUPPORTS} from '../src/data/supports';
import {makeSkillInstance,BAR_SLOTS,type SkillInstance} from '../src/engine/skills';
import {makeSkillGemItem,skillOfGemItem,freeCellCount,packSkillGemPayload} from '../src/engine/gemitems';
import {setBagBoardSource,placeAt,autoPlace,removeFromBag} from '../src/engine/inventory';
import {nextItemUid} from '../src/engine/itemgen';

// ORIGINAL_RACK_CLASS
const proto=World.prototype;
const sdk={learnSkill:proto.learnSkill,unlearnSkill:proto.unlearnSkill};
const original={learnSkill:OriginalRack.prototype.learnSkill,unlearnSkill:OriginalRack.prototype.unlearnSkill};
const modes=['roundTrip','replace','fullBag'] as const;
const names=['original','sdk','control'] as const;
const orders=[[0,1,2],[1,2,0],[2,0,1],[2,1,0],[1,0,2],[0,2,1]];
const rounds=12,repeatsByMode={roundTrip:4096,replace:4096,fullBag:16384};
const samples:any=Object.fromEntries(modes.map(m=>[m,{original:[],sdk:[],control:[]}]));
function sample(mode:typeof modes[number],variant:typeof names[number]){
  const repeats=repeatsByMode[mode];
  const restore=seedGlobalRandom(58301);
  Object.assign(proto,variant==='sdk'?sdk:original);
  try{
    const w=makeSimWorld('swashbuckler',58301),s=w.localSeat,book=s.meta.knownSkills;
    book.clear();s.actor.skills=Array(BAR_SLOTS).fill(null);s.meta.items=[];s.meta.equipped={};
    w.devIgnoreSkillAttributes=true;w.time=100;w.lastCombatAt=-100;
    setBagBoardSource(()=>({w:mode==='fullBag'?1:4,h:1}));
    const inst=makeSkillInstance(SKILLS.fireball,4,2);inst.rarity='rare';inst.locked=true;
    inst.sockets[0]={def:SUPPORTS.splitting,level:3,locked:true};
    if(mode!=='roundTrip'){book.set(inst.def.id,inst);s.actor.skills[3]=inst;}
    assert(autoPlace(s.meta.items,makeSkillGemItem(inst)));
    const first=nextItemUid()+1;
    let changes=0;const t=performance.now();
    for(let i=0;i<repeats;i++){
      if(mode!=='fullBag')changes+=Number(w.learnSkill(s.meta.items[0].uid,s));
      if(mode!=='replace')changes+=Number(w.unlearnSkill('fireball',s));
    }
    const us=(performance.now()-t)*1000/(repeats*(mode==='roundTrip'?2:1));
    const result={changes,allocated:nextItemUid()-first,bar:s.actor.skills.map(i=>i?.def.id??null),
      bag:s.meta.items.map(i=>[i.x,i.y,i.gem,i.locked]),book:[...book.values()].map(packSkillGemPayload)};
    assert.equal(changes,mode==='roundTrip'?repeats*2:mode==='replace'?repeats:0);
    assert.equal(result.allocated,repeats);return {us,result};
  }finally{Object.assign(proto,sdk);setBagBoardSource(null);restore();}
}
const expected=new Map();
for(let round=-1;round<rounds;round++)for(const mode of modes){
  for(const position of orders[Math.max(round,0)%orders.length]){
    const name=names[position];
    const {us,result}=sample(mode,name);
    if(!expected.has(mode))expected.set(mode,result);
    else assert.deepEqual(result,expected.get(mode),mode);
    if(round>=0)samples[mode][name].push(us);
  }
}
const median=(values:number[])=>{const a=[...values].sort((a,b)=>a-b),mid=a.length/2;return (a[mid-1]+a[mid])/2;};
const medians=Object.fromEntries(modes.map(mode=>[mode,Object.fromEntries(names.map(n=>[n,median(samples[mode][n])]))]));
fs.writeFileSync(process.argv[2],JSON.stringify({platform:process.platform,arch:process.arch,cpu:os.cpus()[0].model,node:process.version,
  repeatsByMode,rounds,scope:'Warm menu actions in the installed game, same host with alternate method bodies. Control repeats the original code. Six orders repeated twice. Includes actor rebuilds when invoked. Renderer, I/O and physical devices excluded.',
  microsecondsPerAction:samples,medians,matchingOutcomes:true},null,2)+'\n',{flag:'wx'});
