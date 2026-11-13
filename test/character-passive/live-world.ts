import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {classStartNode} from '../src/data/passives';
import {SKILLS} from '../src/data/skills';
import {makeSkillInstance,BAR_SLOTS} from '../src/engine/skills';
import {packSkillGemPayload} from '../src/engine/gemitems';
import type {PassiveBuildState} from 'candidate/passive-policy-types';
import type {CharacterPassiveEffectPorts} from 'candidate/passive-effects';
import type {SkillInstance} from '../src/engine/skills';
import type {Actor} from '../src/engine/actor';
import {resolveMinionInheritance,applyMinionPlyBonus} from '../src/engine/minionInheritance';
import {syncAttributeBequests} from '../src/engine/bequests';
import {batchScaleOf} from '../src/engine/throng';
import {RELIQUARY_CFG} from '../src/data/reliquary';
bootSimEngine();
const copy=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
export function livePassiveWorld(){
 const w=makeSimWorld('warrior',74119),s=w.localSeat,m=s.meta,p=s.actor;w.loadZone('lastlight');
 const font=w.fonts[0];p.pos={...font.pos};p.tier=font.tier??0;w.actors=[p];
 m.items=[];m.equipped={};m.containers={};m.knownSkills.clear();const skill=makeSkillInstance(SKILLS.cleave,1);m.knownSkills.set('cleave',skill);
 p.skills=Array(BAR_SLOTS).fill(null);p.skills[0]=skill;m.allocated=new Set([classStartNode('warrior')]);m.choices={};m.grafts={};m.vocations=[];
 m.passivePoints=100;m.vocationPoints=0;m.realmPoints={devotion:2};w.ledger.devotion_attuned=1;w.recalcSeat(s);p.cooldowns.set('cleave',5);
 const summon=makeSkillInstance(SKILLS.summon_skeleton,1);m.knownSkills.set(summon.def.id,summon);
 const spawn=()=>{const body=w.createMonster('skeleton_warrior',1,'player',p);body.summonInst=summon;w.actors.push(body);w.bakeMinionOwnerStats(body,p,summon);body.life=body.maxLife();body.radius*=1.7;body.spawnScale=(body.spawnScale??1)*1.4;return body;};
 const firstBody=spawn();firstBody.cooldowns.set('cleave',3);
 const events:unknown[]=[],refreshed:Actor[]=[];
 const passives=():PassiveBuildState=>copy({classId:m.classDef.id,allocated:[...m.allocated],choices:m.choices,grafts:m.grafts,vocations:m.vocations,
  passivePoints:m.passivePoints,vocationPoints:m.vocationPoints,realmPoints:m.realmPoints});
 const snapshot=()=>copy({passives:passives(),attributes:m.attrs,life:p.life,mana:p.mana,maxLife:p.maxLife(),maxMana:p.maxMana(),
  cooldowns:[...p.cooldowns],time:w.time,passiveMods:p.sheet.getSourceMods('passives'),summons:w.actors.filter(a=>a.owner===p&&a.summonInst).map(a=>({life:a.life,maxLife:a.maxLife(),damage:a.sheet.get('damage'),dead:a.dead,cooldowns:[...a.cooldowns],radius:a.radius,spawnScale:a.spawnScale}))});
 for(const name of ['recalcSeat','refreshPassiveCompany','markMetaDirty','resyncMinionSupports','bakeMinionOwnerStats','failNote']){
  const world=w as any,original=world[name];world[name]=function(...args:any[]){const result=original.apply(this,args);events.push({name,state:snapshot()});return result;};
 }
 return{w,s,m,p,skill,events,passives,snapshot,spawn,firstBody,refreshed,
  input:(contentId:string)=>({capability:'character-workshop/residence-diagnostic',nextUid:1,state:{board:{w:16,h:16},items:[],equipped:{},overflow:[],essences:{},
   skillBook:{known:[...m.knownSkills.values()].map(inst=>({gem:packSkillGemPayload(inst)})),bar:p.skills.map(inst=>inst?.def.id??null)}},
   character:{schemaVersion:2,capability:'workshop-character/progression-diagnostic',contentId,level:p.level,baseAttrs:copy(m.baseAttrs),passives:passives(),containers:{},abilityEssences:{}}}),
  account:()=>copy({ledger:w.account.ledger,features:[...w.account.features]}),
  advance:()=>{p.life-=5;p.mana-=2;p.updateTimers(.25);for(const body of w.actors)if(body.owner===p&&body.summonInst){body.life-=1;body.updateTimers(.25);}w.time+=.25;},
  original:(command:{op:string;nodeId:string})=>command.op==='allocate'?w.allocateNode(command.nodeId):w.refundPassiveNode(command.nodeId),
  effectPorts:(rebuild:(index:number)=>PassiveBuildState):CharacterPassiveEffectPorts<SkillInstance,Actor>=>({
   rebuild:(index:number)=>{const value=rebuild(index);if(value.classId!==m.classDef.id)throw Error('Wrong live class');
    m.allocated.clear();for(const id of value.allocated)m.allocated.add(id);m.choices=copy(value.choices);m.grafts=copy(value.grafts);m.vocations=copy(value.vocations);
    m.passivePoints=value.passivePoints;m.vocationPoints=value.vocationPoints;m.realmPoints=copy(value.realmPoints);w.recalcSeat(s);
   },
   captureSummons:()=>w.actors.filter(a=>!a.dead&&a.owner===p&&!a.construct&&!a.companion&&a.summonInst),alive:(body:{dead:boolean})=>!body.dead,
   learned:()=>m.knownSkills.values(),granted:()=>s.grantedInsts?.values()??[],known:(id:string)=>m.knownSkills.get(id),
   refreshSupports:inst=>{w.resyncMinionSupports(inst);},refreshSummon:body=>{
    refreshed.push(body);const inst=body.summonInst!;
    // Match the qualified World adapter: ordinary inheritance never reapplies
    // spawn-time geometry. Batch bodies retain their distinct refresh path.
    if(inst.def.throng||inst.def.hivecall)w.bakeMinionOwnerStats(body,p,inst,inst.def.throng?batchScaleOf(inst.def.throng):1);
    else{const inherited=resolveMinionInheritance(p,inst,body.defId);
     body.sheet.setSource('owner',inherited.ownerMods);body.sheet.setSource('minionCombat',inherited.combatMods);body.guardMode=inherited.guard;
     applyMinionPlyBonus(body,inherited.plyBonus);syncAttributeBequests(body,inst.relicSource?RELIQUARY_CFG.minion.ordinaryStats:1,inherited.tags,inherited.extra);
    }
    body.life=Math.min(body.life,body.maxLife());
   },
   refreshCompany:()=>{(w as any).refreshPassiveCompany(s);},markMetaDirty:()=>{(w as any).markMetaDirty(s);},markCharacterDirty:()=>{(w as any).charDirty=true;},
   refusal:(key:string,reason:string)=>{(w as any).failNote(p,key,reason);}
  })};
}
