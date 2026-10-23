// Private original-only investigation. Explicit stat/body/clock setup exercises
// the condition boundary; it does not claim native item/passive acquisition.
import fs from 'node:fs';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {StatSheet,mod} from '../src/engine/stats';
bootSimEngine();
function make(){
 const world=makeSimWorld('magician',371037),a=world.player;world.actors=[a];world.walk=null;
 a.sheet=new StatSheet();a.sheet.setSource('diagnostic',[mod('life','flat',80),mod('mana','flat',100),mod('damage','increased',1,undefined,'lowLife')]);
 a.statuses=[];a.charges.clear();a.brims=undefined;a.reserves=undefined;a.derivedGauges=null;a.condRose=[];a['condMask']=-1;a['condSheet']=null;a.ward=0;
 a.life=a.maxLife();a.mana=a.maxMana();a.es=0;a.poise=0;a.casting=null;a.dead=false;return {world,a};
}
function observe(a:ReturnType<typeof make>['a']){return {life:a.life,maxLife:a.maxLife(),lowLine:a.lowLifeLine(),actorLow:a.conditionHolds('lowLife'),sheetLow:a.sheet.hasCondition('lowLife'),damage:a.sheet.get('damage'),ward:a.ward,rose:[...a.condRose],mask:a['condMask'],sheetMarkerCurrent:a['condSheet']===a.sheet,charge:a.sheet.gauge('charge:communion')};}
const results:any[]=[];
{
 const restore=seedGlobalRandom(371037);try{const {a}=make();a.sheet.setSource('feedback',[mod('life','more',-.5,undefined,'lowLife')]);a.life=a.maxLife()*.2;
 const steps=[];for(let i=0;i<6;i++){a['refreshConditions']();steps.push(observe(a));}results.push({name:'conditional-max-life-feedback',steps});}finally{restore();}
}
for(const replaceSheet of [false,true])for(const applyBeforeThrow of [false,true]){
 const restore=seedGlobalRandom(371037);try{const {a}=make();a['refreshConditions']();a.condRose=[];
 if(replaceSheet){a.sheet=new StatSheet();a.sheet.setSource('diagnostic',[mod('life','flat',80),mod('mana','flat',100),mod('damage','increased',1,undefined,'lowLife')]);}
 a.life=a.maxLife()*.2;const publish=a.sheet.setConditions.bind(a.sheet),calls:any[]=[];let fail=true;
 a.sheet.setConditions=active=>{calls.push([...active]);if(applyBeforeThrow||!fail)publish(active);if(fail){fail=false;throw new Error('diagnostic sink failure');}};
 let failure:string|null=null;try{a['refreshConditions']();}catch(error){failure=String(error);}
 const afterFailure=observe(a);a['refreshConditions']();const afterRetry=observe(a);a.life=a.maxLife();a['refreshConditions']();a.life=a.maxLife()*.2;a['refreshConditions']();
 results.push({name:'condition-sink-'+(replaceSheet?'replacement':'existing')+'-'+(applyBeforeThrow?'after-application':'before-application'),failure,afterFailure,afterRetry,afterNewEdge:observe(a),calls});
 }finally{restore();}
}
{
 const restore=seedGlobalRandom(371037);try{const {a}=make();a['refreshConditions']();a.condRose=[];a.life=a.maxLife()*.2;a.charges.set('communion',1);
 const publish=a.sheet.setGauges.bind(a.sheet),calls:any[]=[];let fail=true;a.sheet.setGauges=entries=>{calls.push(entries.map(entry=>[...entry]));if(fail){fail=false;throw new Error('diagnostic gauge failure');}publish(entries);};
 let failure:string|null=null;try{a['refreshConditions']();}catch(error){failure=String(error);}const afterFailure=observe(a);a['refreshConditions']();
 results.push({name:'gauge-sink-failure-after-condition-fold',failure,afterFailure,afterRetry:observe(a),calls});}finally{restore();}
}
{
 const restore=seedGlobalRandom(371037);try{const {world,a}=make();a.sheet.setSource('authored-proc',[mod('proc_desperate_ward','flat',1)]);a['refreshConditions']();
 const rolls:any[]=[],roll=world.rollOwnProcs.bind(world);world.rollOwnProcs=(owner,trigger,opts)=>{rolls.push({trigger,condition:opts?.condition??null,queued:owner.condRose.length});roll(owner,trigger,opts);};
 const steps:any[]=[];for(const [time,low]of [[0,true],[1,false],[2,true],[21,false],[21,true]] as const){world.time=time;a.life=a.maxLife()*(low?.2:1);a['refreshConditions']();const beforeSweep=observe(a),start=rolls.length;world['sweepTalentEvents'](a);steps.push({time,low,beforeSweep,afterSweep:observe(a),rolls:rolls.slice(start),readyAt:a.procReadyAt.get('desperate_ward')??null});}
 results.push({name:'authored-desperate-ward-condition-stat-proc',setup:'Direct stat grant of the original authored proc; original condition fold and World sweep execute the effect. Body life and world time are explicit diagnostic setup.',steps});}finally{restore();}
}
fs.writeFileSync(process.argv[2],JSON.stringify({schema:'private-condition-investigation/v1',results},null,2)+'\n',{flag:'wx'});
