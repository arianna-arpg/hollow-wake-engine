// Executed inside the locked game or its isolated installed-SDK adapter.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makeSimWorld,bootSimEngine} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {SKILLS} from '../src/data/skills';
import {SUPPORTS} from '../src/data/supports';
import {CLASSES} from '../src/data/classes';
import {NullInput} from '../src/net/intent';
import {BAR_SLOTS,makeSkillInstance,type SkillInstance} from '../src/engine/skills';
import {makeSkillGemItem,makeSupportGemItem,packSkillGemPayload} from '../src/engine/gemitems';
import {nextItemUid} from '../src/engine/itemgen';
import {autoPlace,setBagBoardSource} from '../src/engine/inventory';
import type {Seat} from '../src/engine/world';
import type {ItemInstance} from '../src/engine/items';

bootSimEngine();
const wire=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
const courses:unknown[]=[];
const skills=Object.values(SKILLS);
function skill(id:string,level=1,sockets=2){
  const inst=makeSkillInstance(SKILLS[id],level,sockets);inst.rarity='rare';return inst;
}
function body(inst:SkillInstance|null){
  return inst?{...packSkillGemPayload(inst),locked:!!inst.locked,derivedGrafts:inst.grafts?.length??0}:null;
}
function course(name:string,run:(ctx:ReturnType<typeof setup>)=>void){
  const restore=seedGlobalRandom(41000+courses.length);
  try{const ctx=setup();run(ctx);courses.push({name,steps:ctx.steps});}
  finally{setBagBoardSource(null);restore();}
}
function setup(){
  const w=makeSimWorld('swashbuckler',2843),local=w.localSeat;
  const guest=w.addSeat('remote',CLASSES[0],new NullInput(),{startingCompanions:false,startingFlasks:false});
  const board={w:3,h:2};setBagBoardSource(()=>board);
  w.time=100;w.lastCombatAt=-100;w.devIgnoreSkillAttributes=true;
  for(const s of [local,guest]){
    s.actor.skills=Array(BAR_SLOTS).fill(null);
    s.meta.knownSkills.clear();s.meta.items=[];s.meta.equipped={};
    for(const k of Object.keys(s.meta.attrs))s.meta.attrs[k as keyof typeof s.meta.attrs]=200;
  }
  const known=(i:SkillInstance,slot:number|null,s=local)=>{
    s.meta.knownSkills.set(i.def.id,i);if(slot!==null)w.seatHero(s).skills[slot]=i;return i;
  };
  const put=(i:ItemInstance,s=local)=>{assert(autoPlace(s.meta.items,i));return i;};
  const loose=(i:SkillInstance,s=local)=>put(makeSkillGemItem(i),s);
  const support=(s=local)=>put(makeSupportGemItem({def:SUPPORTS.splitting,level:3,locked:true}),s);
  const snapshot=(s:Seat)=>({
    items:s.meta.items,known:[...s.meta.knownSkills].map(([id,i])=>[id,body(i)]),
    grants:[...(s.grantedInsts??[])].map(([id,i])=>[id,body(i)]),
    actor:s.actor.skills.map(i=>i?.def.id??null),hero:w.seatHero(s).skills.map(i=>i?.def.id??null),
    toggles:[...s.actor.summonToggles.keys()],auras:[...s.actor.activeAuras.keys()],
    companions:w.actors.filter(a=>a.owner===s.actor&&a.companion&&!a.dead).map(a=>[a.defId,a.sourceSkillId,a.downed]),
  });
  let events:unknown[]=[],observing=false;
  const methods=['meetsRequirements','unlearnRefusal','swapRefusal','failNote','markMetaDirty','rebindWornGrafts',
    'rememberSkillSlots','clearTreeFields','deactivateAura','dismissSummonToggle','showCompanionCue','kill',
    'restoreCompanions','mireilleStampLived','grantSupportGemItem','recalcSeat','resyncMinionSupports'] as const;
  const world=w as any;
  for(const method of methods){
    const original=world[method];assert.equal(typeof original,'function',method);
    world[method]=function(...args:any[]){
      if(!observing)return original.apply(this,args);
      let detail:unknown;
      if(method==='failNote')detail=[args[0]===local.actor?'local':args[0]===guest.actor?'guest':'home',args[1],args[2]];
      if(method==='swapRefusal')detail=args.slice(1);
      if(method==='unlearnRefusal')detail=args[0].def.id;
      if(method==='meetsRequirements')detail=args[0];
      if(method==='restoreCompanions')detail=args[0].map((c:any)=>[c.skillId,c.downed]);
      events.push({method,detail});
      return original.apply(this,args);
    };
  }
  const steps:any[]=[];
  function step(label:string,method:string,args:any[],expected:boolean|null,seat=local){
    const before=wire([snapshot(local),snapshot(guest)]),next=nextItemUid()+1;
    events=[];observing=true;
    let result;
    try{
      switch(method){
        case 'learn':result=w.learnSkill(args[0],seat,args[1]);break;
        case 'unlearn':result=w.unlearnSkill(args[0],seat,args[1],args[2]);break;
        case 'socket':result=w.socketSupport(args[0],args[1],seat);break;
        case 'unsocket':result=w.unsocketSupport(args[0],args[1],seat);break;
        case 'stored':result=w.unsocketBagSkill(args[0],args[1],seat);break;
        case 'intent':w.applyAction(seat,args[0]);result=null;break;
        default:throw Error(method);
      }
    }finally{observing=false;}
    assert.equal(result,expected,label+': '+JSON.stringify(events));
    steps.push(wire({label,method,args,seat:seat===local?0:1,board,before,next,result,
      allocated:nextItemUid()-next,after:[snapshot(local),snapshot(guest)],events}));
  }
  return {w,local,guest,board,steps,step,known,loose,support};
}

course('owned-round-trip',({w,local,guest,known,loose,support,step})=>{
  const inst=skill('fireball',5);inst.locked=true;inst.sockets[1]={def:SUPPORTS.splitting,level:2,locked:true};
  const gem=loose(inst),cut=support();
  step('foreign-wrapper','learn',[gem.uid],false,guest);
  step('wrong-wrapper-kind','learn',[cut.uid],false);
  step('learn-from-intent','intent',[{t:'learn',uid:gem.uid}],null);
  assert.equal(local.actor.skills[0]?.def.id,'fireball');
  step('socket-from-bag','socket',[cut.uid,'fireball'],true);
  step('remove-to-exact-cell','unlearn',['fireball',2,1],true);
  const returned=local.meta.items.find(i=>i.gem?.kind==='skill')!;
  step('stored-locked-cut','stored',[returned.uid,1],true);
  step('stored-return-exactly-once','stored',[returned.uid,1],false);
  step('restore-at-explicit-seat','learn',[returned.uid,2],true);
  step('unsocket-learned','unsocket',['fireball',0],true);
  const remote=loose(skill('firebolt'),guest);
  step('remote-intent','intent',[{t:'learn',uid:remote.uid,slot:3}],null,guest);
  assert.equal(w.seatHero(guest).skills[3]?.def.id,'firebolt');
  known(skill('life_flask'),1);
  step('flask-removal-hooks','unlearn',['life_flask'],true);
});
course('one-copy-and-capacity',({local,board,known,loose,support,step})=>{
  board.w=2;board.h=1;
  const old=known(skill('fireball',3),4);old.sockets[0]={def:SUPPORTS.splitting,level:4,locked:true};
  known(skill('firebolt'),1);
  const upgrade=loose(skill('fireball',9)),filler=support();
  step('two-departures-one-cell','learn',[upgrade.uid,1],false);
  assert.equal(local.meta.items.at(-1),upgrade);
  local.meta.items.splice(local.meta.items.indexOf(filler),1);
  step('two-departures-two-cells','learn',[upgrade.uid,1],true);
  const previous=local.meta.items.find(i=>i.gem?.kind==='skill'&&i.gem.skillId==='fireball')!;
  step('default-upgrade-uses-known-seat','learn',[previous.uid],true);
  local.meta.knownSkills.get('fireball')!.grafts=[{def:SUPPORTS.splitting,level:1}];
  step('full-bag-keeps-seated-copy','unlearn',['fireball'],false);
  assert.equal(local.meta.knownSkills.get('fireball')!.grafts,undefined);
  step('out-of-board-exact-cell','unlearn',['fireball',99,0],false);
  step('negative-seat','learn',[local.meta.items[0].uid,-1],false);
  step('seat-past-end','learn',[local.meta.items[0].uid,BAR_SLOTS],false);
});
course('remembered-companion',({w,local,known,step})=>{
  known(skill('tame_beast'),2);
  const gift=CLASSES.flatMap(c=>c.startingCompanions??[]).find(c=>c.skillId==='tame_beast')!;
  const beast=w.createMonster(gift.monsterId,1,local.actor.team,local.actor);
  w.actors.push(beast);w.tameCompanion(local.actor,beast,'tame_beast');
  step('sever-and-store-bond','unlearn',['tame_beast'],true);
  assert.equal(w.stashedCompanions.filter(c=>c.skillId==='tame_beast').length,1);
  step('relearn-restores-downed-bond','learn',[local.meta.items[0].uid],true);
  assert(w.companionsOfSkill(local.actor,'tame_beast')[0].downed);
  assert.equal(w.stashedCompanions.filter(c=>c.skillId==='tame_beast').length,0);
});
course('possessed-body',({w,local,known,loose,step})=>{
  const old=known(skill('fireball'),0),gem=loose(skill('firebolt'));
  const hero=local.actor,body=w.createMonster('gnoll_impaler',1,hero.team,hero);
  local.home=hero;local.actor=body;body.skills=[old];w.actors.push(body);
  step('learn-uses-home-but-unlearn-clears-body','learn',[gem.uid,1],true);
  step('remove-known-from-body','unlearn',['fireball'],true);
  assert.equal(hero.skills[0],old);assert.equal(body.skills[0],null);
});
course('gates-and-legacy',({w,local,known,loose,step})=>{
  const requiring=skills.find(d=>Object.values(d.requirements??{}).some(n=>n>0))!;
  w.devIgnoreSkillAttributes=false;
  const first=loose(skill(requiring.id));
  for(const k of Object.keys(local.meta.attrs))local.meta.attrs[k as keyof typeof local.meta.attrs]=0;
  step('actual-attribute-shortfall','learn',[first.uid],false);
  w.devIgnoreSkillAttributes=true;
  const old=known(skill('fireball'),null),upgrade=loose(skill('fireball',8));
  step('known-off-bar-default','learn',[upgrade.uid],true);
  const aura=skills.find(d=>d.delivery.type==='aura'&&d.delivery.overdrive)!;
  const debtor=known(skill(aura.id),1);
  const lane=(aura.delivery as any).overdrive.lane as 'mana'|'life';
  local.actor.overdrive[lane]={debt:1} as any;
  step('owed-aura-refuses-before-allocation','unlearn',[debtor.def.id],false);
  const replacement=loose(skill('fireball',4));
  step('departing-sitter-debt','learn',[replacement.uid,1],false);
  local.actor.overdrive={};
  const swap=w.zone;
  try{
    w.zone={...swap,objective:{kind:'clear'}} as typeof swap;
    w.lastCombatAt=w.time;
    step('field-discipline','unlearn',['fireball'],false);
    w.lastCombatAt=-100;local.actor.cooldowns.set('fireball',1);
    step('second-departure-cooldown','learn',[replacement.uid,1],false);
  }finally{w.zone=swap;}
  local.actor.cooldowns.clear();
  local.grantedInsts=new Map([['frost_nova',skill('frost_nova')]]);
  step('gear-grant-is-not-a-loose-skill','unlearn',['frost_nova'],false);
  local.actor.skills[5]=local.grantedInsts.get('frost_nova')!;
  step('grant-cannot-be-displaced','learn',[replacement.uid,5],false);
  assert(old!==local.meta.knownSkills.get('fireball'));
});
course('structural-limits',({local,known,loose,step})=>{
  const gem=loose(skill('fireball'));
  for(const d of skills.filter(d=>d.id!=='fireball').slice(0,BAR_SLOTS))known(skill(d.id),null);
  step('book-at-cap-with-empty-seats','learn',[gem.uid],false);
  local.actor.skills=[...local.meta.knownSkills.values()];
  step('no-free-default','learn',[gem.uid],false);
  step('replace-at-cap','learn',[gem.uid,3],true);
});
course('full-return-and-crew',({local,board,known,loose,support,step})=>{
  board.w=1;board.h=1;
  known(skill('summon_skeleton_archer'),0);
  const cut=support();
  step('crew-only-socket','socket',[cut.uid,'summon_skeleton_archer'],true);
  const stored=skill('fireball');stored.sockets[0]={def:SUPPORTS.splitting,level:2,locked:true};
  const item=loose(stored);
  step('full-pack-learned-return','unsocket',['summon_skeleton_archer',0],false);
  step('full-pack-stored-return','stored',[item.uid,0],false);
  step('full-pack-skill-return','unlearn',['summon_skeleton_archer'],false);
  step('learn-to-free-cell','learn',[item.uid],true);
  step('retry-after-making-room','unsocket',['summon_skeleton_archer',0],true);
  assert.equal(local.meta.items.length,1);
});
const all:unknown[]=[];
const restore=seedGlobalRandom(44992);
try{
  const w=makeSimWorld('swashbuckler',44992),s=w.localSeat;w.devIgnoreSkillAttributes=true;
  s.meta.equipped={};s.meta.knownSkills.clear();s.actor.skills=Array(BAR_SLOTS).fill(null);
  for(const [index,def] of skills.entries()){
    s.meta.items=[];const inst=skill(def.id);if(index%2===1)inst.locked=true;
    const item=makeSkillGemItem(inst);assert(autoPlace(s.meta.items,item));const at=index%BAR_SLOTS;
    w.applyAction(s,{t:'learn',uid:item.uid,slot:at});
    assert.equal(s.actor.skills[at],s.meta.knownSkills.get(def.id),def.id);
    assert(s.actor.skills[at],def.id);
    const learned=body(s.actor.skills[at]);
    assert(w.unlearnSkill(def.id,s),def.id);
    assert(!s.meta.knownSkills.size&&s.actor.skills.every(i=>i===null)&&s.meta.items.length===1,def.id);
    all.push({id:def.id,at,item,learned,returned:s.meta.items[0]});
  }
}finally{restore();}
fs.writeFileSync(process.argv[2],JSON.stringify({courses,all})+'\n',{flag:'wx'});
