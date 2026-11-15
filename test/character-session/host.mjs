import {StatSheet} from '@hollow-wake/engine';
import {CompanionGrants} from '@hollow-wake/engine/companions/grants';
import {createDamagePipeline} from '@hollow-wake/engine/combat/damage';

// A small deterministic test host. No World, renderer, account or storage.
export function body(rules,id=1){
  return{id,level:1,sheet:new StatSheet(rules.stats),life:1,mana:1,reservedMana:0,reservedLife:0,
    es:0,esDelay:0,esRecharging:false,esBroke:false,ward:0,absorb:0,absorbLayers:new Map(),insight:0,poise:0,poiseBroken:false,endurance:0,enduranceDelay:0,
    dead:false,downed:false,invulnerable:false,evadeEntropy:0,evadeWindow:0,plies:0,lastGaspCd:0,lastGaspSpan:0,gasped:false,
    hitFlash:0,aiNerve:1,statuses:[],activeAuras:new Map(),summonToggles:new Map(),restoreStreams:[],gainEvents:[],skills:Array(8).fill(null),casting:null,
    get absorbTotal(){return this.absorb+[...this.absorbLayers.values()].reduce((n,row)=>n+row.amount,0);},
    maxLife(){return this.sheet.get('life');},maxMana(){return this.sheet.get('mana');},maxPoise(){return this.sheet.get('poise');},
    effectiveWeight(){return this.sheet.get('weight');},insightMomentum(){return 1;},
    damagePoise(n){this.poise=Math.max(0,this.poise-n);return this.poise===0;},ledgerCap(){return 0;},
    applyStatus(id){this.statuses.push({id,stacks:1});},stanceRead(){return null;},
    healBy(n){const before=this.life;this.life=Math.min(this.maxLife(),this.life+Math.max(0,n));return this.life-before;},
    gainWard(n){this.ward+=n;return n;},gainEs(n){this.es+=n;return n;},gainPoise(n){this.poise+=n;return n;},
    availableMaxMana(){return Math.max(0,this.maxMana()-this.reservedMana);},lifeCeiling(){return Math.max(1,this.maxLife()-this.reservedLife);},
    staggerDamage(n){this.stagger=(this.stagger??0)+n;}};
}
export function liveHost(kit,session){
  const actor=body(kit.rules),seat={},meta={knownSkills:new Map()},companions={},events=[],retired=[];
  const grants=new CompanionGrants({summon:kit.rules.summon,maxLevel:kit.rules.equipment.skillMaxLevel,makeSkill:kit.rules.equipment.makeSkill,
    grantedLevel:(owner,def)=>owner.sheet.get(kit.rules.equipment.companionGrantStat(def.id)),respawnScale:()=>1});
  const frame={actor,seat,meta,attributes:(value,mods)=>{meta.attrs=value;actor.sheet.setSource('attributes',mods);},conduits:value=>{actor.conduits=value;},
    deriveCompanions:(definitions,name,key)=>grants.derive(companions,actor,definitions,name,body=>{body.dead=true;},()=>{},key),
    deactivateAura:id=>{actor.activeAuras.delete(id);events.push({kind:'retire-aura',id});},dismissSummon:id=>{actor.summonToggles.delete(id);events.push({kind:'retire-summon',id});},
    syncGuard:()=>{},refreshBonds:()=>{}};
  const publisher=kit.live(frame,{retire:skill=>{retired.push(skill);for(const map of [actor.activeAuras,actor.summonToggles])for(const[id,row]of map)if(row.inst===skill)map.delete(id);
      if(actor.casting?.inst===skill)actor.casting=null;},event:event=>{events.push(event);if(event.kind==='level-up'&&!actor.downed){actor.life=actor.maxLife();actor.mana=actor.availableMaxMana();}}});
  publisher.initialize(session.current());actor.life=actor.maxLife();actor.mana=actor.availableMaxMana();
  const skill=s=>s?{id:s.def.id,level:s.level,bonus:s.bonusLevels,sockets:s.sockets.map(row=>row?{id:row.def.id,level:row.level,...(row.locked?{locked:true}:{}),...(row.rolled?{rolled:row.rolled}:{})}:null),tree:s.treeNodes,
    grafts:s.grafts?.map(row=>({id:row.def.id,level:row.level})),host:s.grantedHostUid,source:s.grantedBy}:null;
  return{actor,seat,meta,frame,companions,events,retired,publisher,
    view:()=>JSON.parse(JSON.stringify({bar:actor.skills.map(skill),known:[...meta.knownSkills].map(([id,s])=>[id,skill(s)]),grants:[...(seat.grantedInsts??[])].map(([id,s])=>[id,skill(s)]),
      companions:[...(companions.grants??[])].map(([id,row])=>[id,skill(row.inst)]),equipped:meta.equipped,attrs:meta.attrs,sources:actor.sheet.sourceNames().map(id=>[id,actor.sheet.getSourceMods(id)]),...(actor.conduits?{conduits:actor.conduits}:{})}))};
}
export function damage(kit,random){
  return createDamagePipeline({random,instanceMods:kit.queries.instanceMods,instanceInnateMods:kit.queries.instanceInnateMods,skillContextTags:kit.queries.skillContextTags,
    travelProtected:()=>false,weakPointBonus:()=>0,plyFloor:()=>1,dominantType:amounts=>Object.keys(amounts).sort((a,b)=>amounts[b]-amounts[a])[0],stampSegment:()=>{},feedWound:()=>false,resourceFlow:()=>{},boundToAbsorb:()=>false});
}
