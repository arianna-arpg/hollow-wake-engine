// Original-only raw material. No SDK or draft adoption implementation imports.
import assert from 'node:assert/strict';import {writeFileSync} from 'node:fs';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';import {seedGlobalRandom,mulberry32} from '../src/sim/rng';
import {forgeItem} from '../src/engine/itemgen';import {BAR_SLOTS,treeNodeRefusal,makeSkillInstance} from '../src/engine/skills';
import {packGrantState,packSkillGemPayload} from '../src/engine/gemitems';import {SKILLS} from '../src/data/skills';
import {RELIQUARY} from '../src/data/containers';import {bankRelic} from '../src/engine/accountReliquary';import {reliquaryPower} from '../src/meta/reliquary';
bootSimEngine();const restore=seedGlobalRandom(0x7164),rng=mulberry32(0x7164),original:any[]=[];
const json=(value:any)=>JSON.stringify(value),copy=(value:any)=>JSON.parse(json(value));
try{
 const w=makeSimWorld('magician',0x7164),p=w.player,m=w.meta,seat=w.localSeat,native=w as any;
 w.walk=null;w.actors=[p];m.modeId='immortal';m.charId='adoption-probe';m.relicScope='adoption-probe';
 m.knownSkills.clear();m.items=[];m.equipped={};m.containers={};p.skills=Array(BAR_SLOTS).fill(null);w.recalcSeat(seat);
 const worn=forgeItem({baseId:'ring_lapis',ilvl:40,quality:1,rng})!,helmet=forgeItem({uniqueId:'cindervigil',ilvl:40,quality:1,rng})!,ring=forgeItem({uniqueId:'emberbrand',ilvl:40,quality:1,rng})!;
 assert(worn&&helmet&&ring);m.equipped.ring2=worn;w.recalcSeat(seat);m.equipped.helmet=helmet;m.equipped.ring1=ring;w.recalcSeat(seat);
 const grant=seat.grantedInsts!.get('firebolt')!;assert.equal(grant.level,10);grant.treeNodes=[];
 for(let n=0;n<2;n++){assert.equal(treeNodeRefusal(grant,'flame_studies'),null);grant.treeNodes.push('flame_studies');}
 assert(w.bindSkill(2,'firebolt'));w.recalcSeat(seat);delete m.equipped.ring1;w.recalcSeat(seat);
 assert.equal(grant.level,5);assert.equal(grant.treeNodes.length,2);
 const skill=(s:any)=>s?{id:s.def.id,level:s.level,bonus:s.bonusLevels,sockets:s.sockets.map((r:any)=>r?{id:r.def.id,level:r.level,...(r.locked?{locked:true}:{}),...(r.rolled?{rolled:r.rolled}:{})}:null),
  tree:s.treeNodes,grafts:s.grafts?.map((r:any)=>({id:r.def.id,level:r.level})),host:s.grantedHostUid,source:s.grantedBy}:null;
 const observe=()=>json({bar:p.skills.map(skill),known:[...m.knownSkills].map(([id,s])=>[id,skill(s)]),grants:[...(seat.grantedInsts??[])].map(([id,s])=>[id,skill(s)]),
  companions:[...(native.companionGrants.owners.get(p)??[])].map(([id,r]:any)=>[id,skill(r.inst)]),equipped:m.equipped,attrs:m.attrs,sources:p.sheet.sourceNames().map(id=>[id,p.sheet.getSourceMods(id)]),conduits:m.conduits});
 const input=()=>copy({level:p.level,classId:m.classDef.id,baseAttrs:m.baseAttrs,allocated:[...m.allocated],choices:m.choices,grafts:m.grafts,equipped:m.equipped,containers:m.containers,
  features:[...w.account.features],relicEnabled:w.account.reliquary.enabled,relicEmpowerment:reliquaryPower(w.account.reliquary),
  learned:[...m.knownSkills.values()].map(inst=>({gem:packSkillGemPayload(inst),...(inst.locked?{locked:true}:{})}))});
 const seed=()=>({sourceOrder:p.sheet.sourceNames(),grants:[...(seat.grantedInsts??[])].map(([skillId,inst])=>({skillId,level:inst.level,hostUid:inst.grantedHostUid,state:packGrantState(inst)})),
  companions:[...(native.companionGrants.owners.get(p)??[])].map(([skillId,row]:any)=>({skillId,level:row.inst.level}))});
 const capture=(label:string)=>original.push(copy({label,input:input(),seed:seed(),view:JSON.parse(observe()),live:{time:w.time,life:p.life,mana:p.mana,useLock:p.useLock,cooldowns:[...p.cooldowns],
  cast:p.casting?{id:p.casting.inst.def.id,level:p.casting.inst.level,tree:p.casting.inst.treeNodes,owner:p.casting.inst===grant?'original-grant':'other',mode:p.casting.mode,elapsed:p.casting.elapsed,total:p.casting.total,paidCost:p.casting.paidCost}:null,
  projectiles:w.projectiles.map(q=>({id:q.inst.def.id,level:q.inst.level,tree:q.inst.treeNodes,owner:q.inst===grant?'original-grant':'other'}))}}));
 capture('lowered-live-grant');p.fillResources();p.useLock=0;p.cooldowns.clear();w.time=100;
 const aim={x:p.pos.x+100,y:p.pos.y};assert(w.useSkill(p,grant,aim,true));const cast=p.casting;assert(cast&&cast.inst===grant);
 w.time+=cast.total/4;native.updateCasting(p,cast.total/4);assert.equal(p.casting,cast);capture('paid-cast-quarter');
 w.time+=cast.total;native.updateCasting(p,cast.total);assert.equal(p.casting,null);assert(w.projectiles.some(q=>q.inst===grant));capture('completed-cast');
 // Trusted mutable-level observation; this is not a claimed player UI command.
 const learned=makeSkillInstance(SKILLS.firebolt,10,2);learned.treeNodes=['flame_studies','flame_studies'];learned.locked=true;m.knownSkills.set('firebolt',learned);w.recalcSeat(seat);learned.level=5;w.recalcSeat(seat);
 assert.equal(learned.treeNodes.length,2);assert.equal(p.skills[2],learned);capture('trusted-learned-level-adjustment');
 for(const rung of RELIQUARY.ladder)w.account.features.add(rung.feature);
 const idol=forgeItem({uniqueId:'unquarried_idol',ilvl:40,quality:1,rng})!;assert.equal(bankRelic(w.account,idol,'adoption-probe'),idol);idol.x=0;idol.y=0;w.account.reliquary.seated=[idol.relicKey!];w.restoreAccountRelics(seat);w.recalcSeat(seat);capture('canonical-companion');
 writeFileSync(process.argv[2],json({original}),{flag:'wx'});
}finally{restore();}
