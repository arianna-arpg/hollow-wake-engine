// Local diagnostic only: CPU samples, not acceptance or elapsed-time evidence.
import fs from 'node:fs';
import {Session} from 'node:inspector';
import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {SKILLS} from '../src/data/skills';
import {ABILITY_ESSENCES} from '../src/data/essences';
import {makeSkillGem} from '../src/engine/skills';
import {seedGlobalRandom} from '../src/sim/rng';
bootSimEngine();
const restore=seedGlobalRandom(191901),w=makeSimWorld('swashbuckler',191900);
w.fonts.push({pos:{...w.player.pos}});w.memorySecondaryRefusal=()=>null;
const inst=makeSkillGem(SKILLS.wild_strike,4,'legendary');inst.empowermentRank=2;
w.meta.knownSkills=new Map([['wild_strike',inst]]);w.player.skills=[inst];
function batch(){
 w.time=0;w.texts=[];w.flashes=[];w.metaDirty.clear();w.charDirty=false;
 const q=w as unknown as {pendingTreePips:Map<unknown,unknown>};q.pendingTreePips.clear();
 inst.level=4;inst.treeNodes=undefined;inst.state=undefined;
 for(const e of ABILITY_ESSENCES)w.meta.abilityEssences[e.id]=10000;
 w.recalcSeat(w.localSeat);
 for(let i=0;i<40;i++){
  inst.level=4;assert(w.levelUpSkill('wild_strike'));
  w.pickTreeNode('wild_strike','ws_duelist');w.pickTreeNode('wild_strike','ws_economy');
  assert(w.fontResetTree('wild_strike'));
 }
}
const session=new Session();session.connect();
const post=(method:string)=>new Promise<any>((resolve,reject)=>session.post(method as any,(error,result)=>error?reject(error):resolve(result)));
try{
 for(let i=0;i<50;i++)batch();
 await post('Profiler.enable');await post('Profiler.start');
 for(let i=0;i<2000;i++)batch();
 const {profile}=await post('Profiler.stop');
 fs.writeFileSync(process.argv[2],JSON.stringify(profile));
 console.log('Recorded CPU samples for 80000 complete skill action sequences plus per-batch preparation; no timing or allocation claim.');
}finally{session.disconnect();restore();}
