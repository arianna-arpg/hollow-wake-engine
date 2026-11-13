import {AccountRelicItems} from '../../dist/account-relic-items.js';import {ItemRules} from '../../dist/item-rules.js';
import {reliquaryExperience,accountRelicBoard} from 'candidate/relic-original';
import {relicPowerActive} from '../../.reference/src/engine/relicPower.ts';
{
 const mint=new ItemRules(items,481,10000),bodies=[1,2].map(n=>{const item=mint.forge({baseId:'relic_charm',ilvl:1,rarity:'magic',quality:1,affixes:[]});assert(item);return{...item,relicKey:'xp-relic-'+n,x:n-1,y:0};});
 const bare=setup(),characterSaves=bare.saves().map(r=>{const save=copy(r.save);save.workshop.nextUid=20000;return save;});
 const codec=new AccountRelicItems(workshop),definitions={...account,relicItems:codec,relicBuilds:true};
 function relicOwner(flags=Array(16).fill(false),extra={}){
  const observations=[],trace=[],owner=new RunCharacterSession({account:definitions,character,experience:rules},{conditions:()=>({refundRefusal:null,openAllRealms:false}),trace:r=>trace.push(r),
   experience:r=>{const suppressed=flags[observations.length]??false;observations.push({profile:r.profile,suppressed});return{eligible:true,blessing:.5,relicSuppressed:suppressed,local:r.profile===1,accountOwned:true,...extra};}});
  ok(owner.command({op:'open-account',account:1,key:'account-a',seed:14,relicItems:true}));
  const state=ok(owner.command({op:'account-relic-items',account:1})).state;state.items=copy(bodies);state.seated=bodies.map(b=>b.relicKey);
  ok(owner.command({op:'account',account:1,command:{op:'relic-items',state}}));
  for(const profile of [1,2])ok(owner.command({op:'restore-workshop',account:1,profile,save:characterSaves[profile-1]}));
  ok(owner.command({op:'activate-workshop',account:1,profile:1}));
  owner.attach(copy(bare.owner.read()),[{profile:1,key:'character-1'},{profile:2,key:'character-2'}]);
  const snapshot=()=>({run:owner.read(),account:ok(owner.command({op:'account-save',account:1})),active:ok(owner.command({op:'active-workshop',account:1})),characters:[1,2].map(profile=>ok(owner.command({op:'workshop-save',profile})))});
  return{owner,state,observations,trace,snapshot};
 }
 const set=state=>({kind:'command',command:{op:'account',account:1,command:{op:'relic-items',state}}});
 const select=profile=>({kind:'command',command:{op:'activate-workshop',account:1,profile}});
 let compared=0;
 for(const mode of ['commit','abort','late-failure']){
  const flags=[false,false,false,false,false,false,false,true,false],f=relicOwner(flags),before=f.snapshot();
  const disabled={...copy(f.state),enabled:false},carried={...copy(f.state),seated:[bodies[0].relicKey],carried:[bodies[1].relicKey]};
  const actions=[award(1),set(disabled),award(1),set(carried),award(1),select(2),award(1),award(1,2),set(copy(f.state)),award(1,2),select(1),award(1),award(1),award(1)];
  if(mode==='late-failure'){
   assert.throws(()=>f.owner.prepareTrusted([...actions,command(1,{op:'allocate',nodeId:node.id,ledger:{forged:1}})]),/unknown-field/);
   assert.deepEqual(f.snapshot(),before,'late failure leaked relic-dependent XP or account selection');continue;
  }
  const prepared=ok(f.owner.prepareTrusted(actions)),journal=f.owner.prepared(prepared.token).journal;
  assert.deepEqual(f.snapshot(),before,'prepared relic policy leaked into committed owner');
  let state=f.state,active=1,awardIndex=0;const xp={1:0,2:0};
  for(let n=0;n<actions.length;n++){
   const action=actions[n],entry=journal[n];
   if(action.kind==='award'){
    const suppressed=flags[awardIndex++],factor=reliquaryExperience(active===action.profile?accountRelicBoard({reliquary:state}):[],relicPowerActive({relicEffectsSuppressed:suppressed},active===action.profile&&state.enabled));
    xp[action.profile]+=Math.round(action.amount*1.5)*factor;
    assert.equal(entry.experience.after.xp,xp[action.profile],'staged relic policy mismatch');
    assert.equal(entry.character.transitions.length,0,'ordinary relic-adjusted XP rebuilt a character');assert.equal(entry.character.accounts.length,0,'ordinary XP wrote account progress');compared++;
   }else if(action.command.op==='account')state=action.command.command.state;
   else active=action.command.profile;
  }
  assert.equal(f.owner.prepared(prepared.token).state.characters[0].xp,xp[1]);assert.equal(f.owner.prepared(prepared.token).state.characters[1].xp,xp[2]);
  ok(f.owner.command({op:mode==='commit'?'commit-prepared':'abort-prepared',token:prepared.token}));
  if(mode==='abort')assert.deepEqual(f.snapshot(),before);else for(const profile of [1,2])assert.equal(f.owner.read().characters[profile-1].xp,xp[profile]);
 }
 {
  const f=relicOwner([false],{multiplier:0}),before=f.snapshot();assert.throws(()=>f.owner.prepareTrusted([award(1)]),/unknown-field/,'host must not replace owner-derived multiplier');assert.deepEqual(f.snapshot(),before);
 }
 console.log({passed:true,canonicalRelicCourses:4,originalAwardFactorsCompared:compared,source:'accountRelicBoard + reliquaryExperience + relicPowerActive',durableRunStore:false});
}
