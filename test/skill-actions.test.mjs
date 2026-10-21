import test from 'node:test';import assert from 'node:assert/strict';
import {SkillActions,planSkillMerge} from '../dist/skill-actions.js';import {AbilityRules,SkillTreeRules} from '../dist/skill-progression.js';
const ability=new AbilityRules({bands:[5,10,15,20],supportMaxLevel:5,cost:{base:2,perStep:2,supportMul:2},empowerment:{reward:{kind:'passivePoints',pointsPerRank:1}}});
const essence=Array.from({length:4},(_,i)=>({id:'e'+i,tier:i+1,label:'Essence '+i,color:'gold',glyph:String(i)}));
const tuning={merge:{common:3,magic:4,rare:5},rarities:['common','magic','rare','legendary'],empowerment:{enabled:true,copiesPerMerge:2,ranksPerMerge:1,preserveDonorRanks:true,maxRank:null}};
const mergePorts={payload:i=>i.payload,locked:i=>!!i.locked,known:id=>id==='s',restore:i=>i.instance,create:(skillId,level,rarity)=>({skillId,level,rarity,sockets:[]})};
const item=(rank,level=20,rarity='legendary')=>({payload:{skillId:'s',rarity,level,empowermentRank:rank},instance:{level,rarity,empowermentRank:rank,sockets:[{id:'support'}],treeNodes:['passive']}});
test('legendary merge keeps stable highest investment and returns only donor sockets without mutating inputs',()=>{
 const a=item(2,10),b=item(1,20),tie=item(2,10),locked=item(99);locked.locked=true;const granted=item(99);granted.payload.granted=true;const items=[a,b,tie,locked,granted],before=JSON.stringify(items);
 const plan=planSkillMerge(items,'s','legendary',tuning,mergePorts);assert.equal(plan.refusal,null);assert.deepEqual(plan.taken,[a,tie]);assert.deepEqual(plan.returnSockets,[tie]);assert.equal(plan.barred,2);assert.equal(plan.available,3);assert.equal(plan.result.empowermentRank,5);assert.equal(plan.result.level,10);assert.equal(plan.result.treeNodes,a.instance.treeNodes);assert.equal(plan.result.sockets,a.instance.sockets);assert.notEqual(plan.result,a.instance);assert.equal(JSON.stringify(items),before);
 const second=planSkillMerge([a,b],'s','legendary',tuning,mergePorts);assert.equal(second.result.level,20);assert.equal(second.result.empowermentRank,4);
});
test('ordinary merges choose highest levels, advance one rarity and return all input sockets',()=>{
 const items=[item(0,2,'common'),item(0,9,'common'),item(0,4,'common'),item(0,20,'rare')],plan=planSkillMerge(items,'s','common',tuning,mergePorts);
 assert.equal(plan.result.rarity,'magic');assert.equal(plan.result.level,9);assert.deepEqual(plan.taken,[items[1],items[2],items[0]]);assert.deepEqual(plan.returnSockets,plan.taken);assert.deepEqual(plan.result.sockets,[]);
});
test('invalid merge policies and investments refuse before custody changes',()=>{
 const items=[item(2),item(1)],before=JSON.stringify(items),withEmp=patch=>({...tuning,empowerment:{...tuning.empowerment,...patch}});
 for(const [patch,message] of [[{enabled:false},'Merging is unavailable.'],[{copiesPerMerge:1},'Merging is unavailable.'],[{copiesPerMerge:2.5},'Merging is unavailable.'],[{copiesPerMerge:3},'the font asks 3 alike'],[{ranksPerMerge:0},'Invalid empowerment policy.'],[{ranksPerMerge:Infinity},'Invalid empowerment policy.'],[{maxRank:3},'Empowerment limit reached.']]){const plan=planSkillMerge(items,'s','legendary',withEmp(patch),mergePorts);assert.equal(plan.refusal,message);assert.deepEqual(plan.taken,[]);assert.deepEqual(plan.returnSockets,[]);}
 assert.equal(planSkillMerge(items,'missing','legendary',tuning,mergePorts).refusal,'Merging is unavailable.');assert.equal(planSkillMerge(items,'s','legendary',tuning,{...mergePorts,restore:()=>undefined}).refusal,'This skill is unavailable.');
 assert.equal(planSkillMerge([item(Number.MAX_SAFE_INTEGER),item(0)],'s','legendary',tuning,mergePorts).refusal,'Invalid empowerment policy.');assert.equal(planSkillMerge([item(0,Infinity),item(0)],'s','legendary',tuning,mergePorts).refusal,'Invalid skill investment.');
 assert.equal(planSkillMerge(items,'s','legendary',withEmp({preserveDonorRanks:false}),mergePorts).result.empowermentRank,3);assert.equal(JSON.stringify(items),before);
});
function setup(){
 const events=[],def={id:'s',name:'Skill',color:'blue',tree:{level:5,nodes:[{id:'p',name:'Passive',empowermentPassive:true},{id:'branch',name:'Branch',excludes:['rival']},{id:'rival',name:'Rival',excludes:['branch']}]},delivery:{type:'summon'}};
 const skill={def,level:4,rarity:'legendary',empowermentRank:2,treeNodes:[],sockets:[],state:{triggerOff:true,trigDepth:3},replenishmentPaused:true},rules=new SkillTreeRules(def,ability),seat={wallet:{e0:100,e1:0,e2:0,e3:10},known:new Map([['s',skill]]),granted:new Map(),position:{x:1,y:2},near:true,memory:null,swap:null};
 const state=()=>({level:skill.level,ids:skill.treeNodes?[...skill.treeNodes]:null,wallet:{...seat.wallet},triggerOff:skill.state.triggerOff??null,paused:skill.replenishmentPaused??null});
 const emit=(name,...args)=>events.push({name,args,state:state()});let plan={need:0,available:0,barred:0,taken:[],returnSockets:[],refusal:'short'};
 const ports={ability:()=>ability,tree:()=>rules,essences:()=>essence,font:()=>({convertUp:3,convertDown:2,reset:{count:1}}),wallet:s=>s.wallet,known:(s,id)=>s.known.get(id),granted:(s,id)=>s.granted.get(id),skillMax:()=>20,supportMax:()=>5,nearFont:s=>s.near,memoryRefusal:s=>s.memory,swapRefusal:s=>s.swap,position:s=>s.position,
  text:(...a)=>emit('text',...a),fail:(_s,key,reason)=>emit('fail',key,reason),markMetaDirty:()=>emit('meta'),markCharacterDirty:()=>emit('character'),pickup:(_s,e,c)=>emit('pickup',e.id,c),awaken:()=>emit('awaken'),dismiss:()=>emit('dismiss'),clearSummons:()=>emit('summons'),clearFields:()=>emit('fields'),trigger:i=>i.treeNodes?.includes('branch')?'tree-trigger':'base-trigger',recalculate:()=>emit('recalculate'),
  mergePlan:()=>plan,sockets:i=>i.sockets,remove:(_s,i)=>emit('remove',i.id),grantSkill:(_s,i)=>emit('grantSkill',i),grantSupport:(_s,g)=>emit('grantSupport',g),announceMerge:()=>emit('mergeNotice')};
 return {host:new SkillActions(ports),ports,seat,skill,rules,events,plan:p=>{plan=p;}};
}
test('level-to-choice-to-reset preserves callback order and first-use cleanup semantics',()=>{
 const {host,seat,skill,events}=setup();assert(host.levelSkill(seat,'s'));assert.equal(skill.level,5);assert.equal(seat.wallet.e0,90);assert.deepEqual(events.map(e=>e.name),['meta','awaken','character']);assert.equal(events[0].state.level,4);assert.equal(events[1].state.level,5);
 events.length=0;host.pick(seat,'s','branch');assert.deepEqual(events.map(e=>e.name),['summons','fields','recalculate','character','text']);assert.deepEqual(events[0].state.ids,[]);assert.deepEqual(events[2].state.ids,['branch']);
 events.length=0;host.pick(seat,'s','branch');assert.equal(events.length,0);host.pick(seat,'s','rival');assert.equal(events[0].name,'text');assert(events[0].args[1].includes('sealed'));
 events.length=0;host.pick(seat,'s','p');host.pick(seat,'s','p');assert.deepEqual(skill.treeNodes,['branch','p','p']);assert.equal(seat.wallet.e0,90);
 events.length=0;assert(host.reset(seat,'s'));assert.equal(skill.treeNodes,undefined);assert.equal(skill.empowermentRank,2);assert.equal(skill.state.triggerOff,undefined);assert.equal(skill.state.trigDepth,undefined);assert.equal(skill.replenishmentPaused,undefined);assert.equal(seat.wallet.e0,89);assert.deepEqual(events.map(e=>e.name),['meta','dismiss','summons','fields','recalculate','character','text']);assert.deepEqual(events[3].state.ids,['branch','p','p']);assert.equal(events[4].state.ids,null);
 events.length=0;assert.equal(host.reset(seat,'s'),false);assert.equal(events.length,0);
});
test('permission and funds refusals leave paid investment untouched; granted skills may pick but cannot level',()=>{
 const {host,seat,skill,events}=setup();seat.wallet.e0=0;assert(!host.levelSkill(seat,'s'));assert.equal(skill.level,4);assert.equal(events[0].name,'fail');skill.level=20;
 for(const [field,reason] of [['memory','account gate'],['swap','combat gate']]){events.length=0;seat[field]=reason;host.pick(seat,'s','p');assert.deepEqual(skill.treeNodes,[]);assert(events[0].args.includes(reason));seat[field]=null;}
 seat.known.delete('s');seat.granted.set('s',skill);events.length=0;assert(!host.levelSkill(seat,'s'));assert.equal(events[0].args[0],'s:granted');host.pick(seat,'s','p');assert.deepEqual(skill.treeNodes,['p']);assert(!host.reset(seat,'s'));
});
test('wallet clamp, fractional credits, lossy conversion and strict invalid-input boundary are independent',()=>{
 const {host,seat,events}=setup();host.grant(seat,0,.5);assert.equal(seat.wallet.e0,100.5);assert.deepEqual(events.map(e=>e.name),['text','pickup','meta']);events.length=0;host.grant(seat,9,-1);assert.equal(events.length,0);
 assert(host.spend(seat,{tier:0,count:.5},'test'));assert.equal(seat.wallet.e0,100);assert(host.convert(seat,1,'up'));assert.equal(seat.wallet.e0,97);assert.equal(seat.wallet.e1,1);assert(host.convert(seat,2,'down'));assert.equal(seat.wallet.e0,99);assert.equal(seat.wallet.e1,0);
 const before=JSON.stringify(seat.wallet);for(const direction of ['sideways',undefined])assert.equal(host.convert(seat,1,direction),false);for(const cost of [{tier:1,count:-1},{tier:1,count:NaN},{tier:1.5,count:1}])assert.throws(()=>host.spend(seat,cost,'bad'));assert.throws(()=>host.grant(seat,1,Infinity));assert.equal(JSON.stringify(seat.wallet),before);
 const support={def:{id:'support'},level:1};assert(host.levelSupport(seat,support));assert.equal(support.level,2);support.level=5;assert(!host.levelSupport(seat,support));
});
test('merge preflights every donor before consuming and grants the keeper before supports',()=>{
 const {host,seat,skill,events,plan}=setup(),a={id:'a',sockets:[null,{id:'supportA'}]},b={id:'b',sockets:[{id:'supportB'}]};
 plan({need:2,available:2,barred:0,taken:[a,b],returnSockets:[b,{id:'corrupt'}],result:skill,refusal:null});assert(!host.merge(seat,'s','legendary'));assert.equal(events.length,0);
 plan({need:2,available:2,barred:0,taken:[a,b],returnSockets:[b],result:skill,refusal:null});assert(host.merge(seat,'s','legendary'));assert.deepEqual(events.map(e=>e.name),['remove','remove','grantSkill','grantSupport','character','mergeNotice']);assert.equal(events[3].args[0],b.sockets[0]);
});
test('hosts own their ports and reject callback reentry without poisoning later operations',()=>{
 const {seat,ports,skill}=setup();seat.wallet.e1=100;let host;ports.markMetaDirty=()=>assert.throws(()=>host.levelSkill(seat,'s'),/Reentrant/);host=new SkillActions(ports);ports.markMetaDirty=()=>{throw new Error('Replaced caller port');};assert(host.levelSkill(seat,'s'));assert.equal(skill.level,5);assert(host.levelSkill(seat,'s'));assert.equal(skill.level,6);
 const second=setup();assert.equal(second.skill.level,4);assert.equal(second.seat.wallet.e0,100);assert.throws(()=>new SkillActions({...ports,clearFields:null}),/clearFields/);
});
