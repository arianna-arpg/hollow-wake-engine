import assert from 'node:assert/strict';
import {PassivePolicy} from '../../dist/passive-policy.js';
const copy=value=>JSON.parse(JSON.stringify(value));
export function runOriginalPassiveActions(Actions,fixture){
 const authored=new PassivePolicy(fixture.authored);let count=0;
 for(const scenario of fixture.scenarios){
  const policy=scenario.policy?new PassivePolicy(scenario.policy):authored,state={...copy(scenario.initial),allocated:new Set(scenario.initial.allocated)},session=policy.attach(state);
  let command,events=[],known=new Map(),characterDirty=false;
  const actions=new Actions({session:()=>session,access:()=>({ledger:command.ledger??{},openAllRealms:command.openAllRealms}),
   refundRefusal:()=>command.serviceRefusal??null,graft:(_,key)=>state.grafts[key]??null,knownIds:()=>new Set(known.keys()),known:(_,id)=>known.get(id),
   skills:()=>[...known.values()],summons:()=>[],alive:()=>true,recalculate:()=>{events.push('recalc');},refreshCompany:()=>{events.push('company');},
   resyncSupports:()=>{events.push('supports');},refreshSummon:()=>assert.fail('Unexpected summon in policy-only course'),
   markMetaDirty:()=>{events.push('dirty');},markCharacterDirty:()=>{characterDirty=true;},fail:(_,key,reason)=>{assert.equal(key,'passiveRefund');events.push('refused:'+reason);}});
  for(const row of scenario.steps){
   command=row.command;events=[];const c=command;let result;
   if(c.type==='allocate')result=actions.allocate(0,c.id,c.option);
   else if(c.type==='refund'){
    const quote=session.quoteRefund(c.id),accepted=actions.refund(0,c.id);
    result={accepted,quote,refusal:c.serviceRefusal??quote.refusal};if(accepted)assert(characterDirty);
   }else if(c.type==='quote')result=session.quoteRefund(c.id);
   else if(c.type==='choice')result=session.choiceLock(c.id,c.option);
   else if(c.type==='roots')actions.ensureOpenRoots(0);
   else if(c.type==='grant')actions.grantRealmPoints(0,c.currency,c.amount);
   else if(c.type==='bind'){known=new Map(c.knownSkills.map(id=>[id,{id}]));result=actions.bindGraft(0,c.key,c.skillId);}
   else assert.fail(c.type);
   assert.deepEqual(result,row.result,scenario.name+': '+c.type);assert.deepEqual(events,row.events,scenario.name+': effect order');
   assert.deepEqual({...state,allocated:[...state.allocated]},row.expected,scenario.name+': state');
   if(++count%13===0)Object.assign(state,{...copy(row.expected),allocated:new Set(row.expected.allocated)});
  }
 }
 assert.equal(count,9699);return count;
}
export function verifyPassiveActionOrdering(Actions){
 const pack={schemaVersion:1,capability:'passive-policy/v1',contentId:'passive-action-order',defaultPick:1,pickCost:1,requireVocationGate:false,
  nodes:[{id:'root',name:'Root'},{id:'leaf',name:'Leaf',graft:{support:'support'}},{id:'crest',name:'Crest',realm:'other'},{id:'distant',name:'Distant',realm:'other'}],
  adjacency:{root:['leaf'],leaf:['root'],crest:['distant'],distant:['crest']},groups:[],realms:[{id:'tree'},{id:'other',roots:['crest'],currency:'favor',unlockLedger:'open'}],
  classes:[{id:'hero',startNode:'root'}],vocations:[]};
 const state={classId:'hero',allocated:new Set(['root','leaf']),choices:{},grafts:{},vocations:[],passivePoints:3,vocationPoints:0,realmPoints:{}};
 const session=new PassivePolicy(pack).attach(state),first={id:'a'},second={id:'b'},bodies=[{id:1,alive:true},{id:2,alive:true}],known=new Map([['a',first],['b',second]]);
 let events=[],service=null,reenter=false,kill=false,remove=false;
 const actions=new Actions({session:()=>session,access:()=>({ledger:{open:1}}),refundRefusal:()=>service,graft:(_,key)=>state.grafts[key]??null,
  knownIds:()=>new Set(known.keys()),known:(_,id)=>known.get(id),skills:()=>[...known.values()],summons:()=>{assert(state.allocated.has('leaf'));events.push('capture');return [...bodies];},
  alive:body=>body.alive,recalculate:()=>{events.push('recalc');if(kill){bodies[1].alive=false;bodies.push({id:3,alive:true});}if(reenter)actions.grantRealmPoints(0,'favor',1);},
  refreshCompany:()=>{events.push('company');},resyncSupports:inst=>{events.push('support:'+inst.id);if(remove)known.delete('b');},
  refreshSummon:(_,body)=>{events.push('body:'+body.id);},markMetaDirty:()=>{events.push('dirty');},markCharacterDirty:()=>{events.push('character-dirty');},
  fail:(_,key,reason)=>{events.push(key+':'+reason);}});
 assert(actions.bindGraft(0,'leaf','a'));assert.deepEqual(events,['recalc','support:a']);events=[];
 assert(actions.bindGraft(0,'leaf','a'));assert.deepEqual(events,[]);
 assert(actions.bindGraft(0,'leaf','b'));assert.deepEqual(events,['recalc','support:a','support:b']);events=[];
 service='service wins';assert.equal(actions.refund(0,'missing'),false);assert.deepEqual(events,['passiveRefund:service wins']);events=[];service=null;
 kill=true;remove=true;assert(actions.refund(0,'leaf'));
 assert.deepEqual(events,['capture','recalc','support:a','support:b','body:1','company','dirty','character-dirty']);
 assert.equal(state.allocated.has('leaf'),false);assert.equal(state.passivePoints,4);events=[];kill=false;remove=false;
 reenter=true;assert.throws(()=>actions.allocate(0,'leaf'),/Reentrant passive action/);assert(state.allocated.has('leaf'));assert.equal(state.passivePoints,3);
 reenter=false;events=[];actions.grantRealmPoints(0,'unused',1);assert.deepEqual(events,['dirty']);events=[];
 assert.equal(actions.allocate(0,'distant'),false);assert(state.allocated.has('crest'));assert.equal(state.allocated.has('distant'),false);assert.deepEqual(events,['recalc']);
 return 7;
}
