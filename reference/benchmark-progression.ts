import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
import {makeSimWorld} from '../src/sim/arena';import {CLASSES,PROGRESSION} from '../src/data/classes';import {NullInput} from '../src/net/intent';import {seedGlobalRandom} from '../src/sim/rng';
const [previous,current,output]=process.argv.slice(2);
const load=async(game:string)=>{const get=(file:string)=>import(pathToFileURL(path.join(game,file)).href);return {...await get('src/sim/arena.ts'),...await get('src/data/classes.ts'),...await get('src/net/intent.ts'),...await get('src/sim/rng.ts')};};
const apis={original:{makeSimWorld,CLASSES,PROGRESSION,NullInput,seedGlobalRandom},previous:await load(previous),current:await load(current)},keys=Object.keys(apis) as (keyof typeof apis)[];
const states=Object.fromEntries(keys.map(key=>{const api=apis[key],restore=api.seedGlobalRandom(183000);try{const w=api.makeSimWorld('warrior',183000);for(let i=1;i<6;i++){const s=w.addSeat('guest'+i,api.CLASSES.find((c:any)=>c.id===(i%2?'magician':'warrior'))!,new api.NullInput(),{startingCompanions:false,startingFlasks:false});if(i===1)s.couch={pad:1,side:'right'};if(i===3)s.actor.downed=true;if(i===4)s.merc={name:'Measured hire'};if(i===5)s.actor.dead=true;}return [key,{w,api}];}finally{restore();}})) as Record<keyof typeof apis,{w:any;api:any}>;
function reset(state:{w:any;api:any},level:number){const {w,api}=state;w.ledger={};w.metaDirty.clear();w.texts=[];for(const s of w.seats){s.actor.level=level;s.meta.xp=0;s.meta.xpNeeded=api.PROGRESSION.xpForLevel(level);s.meta.passivePoints=api.PROGRESSION.passivePointsAtLevel(level);w.recalcSeat(s);s.actor.life=s.actor.downed?0:s.actor.maxLife()*.5;s.actor.mana=0;}w.texts=[];}
const receipt=(w:any)=>JSON.stringify({seats:w.seats.map((s:any)=>({id:s.id,level:s.actor.level,xp:s.meta.xp,xpNeeded:s.meta.xpNeeded,points:s.meta.passivePoints,life:s.actor.life,mana:s.actor.mana,attributes:s.meta.attrs,levelMods:s.actor.sheet.getSourceMods('level')})),ledger:Object.entries(w.ledger),dirty:[...w.metaDirty],texts:w.texts});
const results=[];
for(const workload of [{name:'small-awards',level:100,grants:1000,levelUps:false},{name:'level-ups',level:1,grants:60,levelUps:true}]){
 const samples=Object.fromEntries(keys.map(k=>[k,[] as number[]])) as Record<keyof typeof apis,number[]>;let expected='';
 for(let trial=-5;trial<25;trial++)for(let offset=0;offset<keys.length;offset++){
  const key=keys[((trial+keys.length*2)%keys.length+offset)%keys.length],state=states[key];reset(state,workload.level);const restore=state.api.seedGlobalRandom(183001);
  let elapsed:number;
  try{const start=performance.now();for(let n=0;n<workload.grants;n++)state.w.grantXp(workload.levelUps?state.w.localSeat.meta.xpNeeded:1);elapsed=performance.now()-start;}
  finally{restore();}
  const actual=receipt(state.w);if(!expected)expected=actual;else assert.equal(actual,expected,`${workload.name}/${key}`);if(trial>=0)samples[key].push(elapsed);
 }
 const timing=Object.fromEntries(keys.map(k=>{const sorted=[...samples[k]].sort((a,b)=>a-b);return [k,{samplesMs:samples[k],medianMs:sorted[12],p95Ms:sorted[23]}];}));
 results.push({...workload,eligibleSeats:4,excludedSeats:2,derivedSha256:createHash('sha256').update(expected).digest('hex'),...timing});console.log(workload.name+': '+keys.map(k=>k+'='+timing[k].medianMs.toFixed(4)+'ms').join(', '));
}
fs.writeFileSync(output,JSON.stringify({scope:'Complete World.grantXp for four eligible seats (one downed), one mercenary and one dead seat; original, retained v0.14.1, current. Five warmups, 25 rotating samples. State reset and comparison excluded from timing; real per-level rebuild, fill, text emission and mercenary callback retained. Seeded text positions and every final state agree. No rendering, allocation/GC, native engine or device claim.',node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,results},null,2)+'\n');
