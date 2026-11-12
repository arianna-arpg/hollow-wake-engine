// Installed adoption course. Original actors keep running; private builds own
// only durable investment and an ordered projection of durable stat sources.
import assert from 'node:assert/strict';import {writeFileSync} from 'node:fs';
import {createCharacterBuilds} from 'authored/factory';import pack from 'authored/pack';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';import {seedGlobalRandom,mulberry32} from '../src/sim/rng';
import {forgeItem} from '../src/engine/itemgen';import {BAR_SLOTS,treeNodeRefusal,makeSkillInstance} from '../src/engine/skills';
import {packGrantState,packSkillGemPayload} from '../src/engine/gemitems';import {SKILLS} from '../src/data/skills';
import {RELIQUARY} from '../src/data/containers';import {bankRelic} from '../src/engine/accountReliquary';import {reliquaryPower} from '../src/meta/reliquary';
bootSimEngine();const restore=seedGlobalRandom(0x7164),rng=mulberry32(0x7164),rows:any[]=[],original:any[]=[],builds:any=createCharacterBuilds(pack);
const json=(value:any)=>JSON.stringify(value),copy=(value:any)=>JSON.parse(json(value));
try{
 const w=makeSimWorld('magician',0x7164),p=w.player,m=w.meta,seat=w.localSeat,native=w as any;
 w.walk=null;w.actors=[p];m.modeId='immortal';m.charId='adoption-probe';m.relicScope='adoption-probe';
 m.knownSkills.clear();m.items=[];m.equipped={};m.containers={};p.skills=Array(BAR_SLOTS).fill(null);w.recalcSeat(seat);
 const worn=forgeItem({baseId:'ring_lapis',ilvl:40,quality:1,rng})!,helmet=forgeItem({uniqueId:'cindervigil',ilvl:40,quality:1,rng})!,ring=forgeItem({uniqueId:'emberbrand',ilvl:40,quality:1,rng})!;
 assert(worn&&helmet&&ring);
 m.equipped.ring2=worn;w.recalcSeat(seat);m.equipped.helmet=helmet;m.equipped.ring1=ring;w.recalcSeat(seat);
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
 const bar=()=>p.skills.map(inst=>inst?.def.id??null);
 const seed=()=>({sourceOrder:p.sheet.sourceNames(),grants:[...(seat.grantedInsts??[])].map(([skillId,inst])=>({skillId,level:inst.level,hostUid:inst.grantedHostUid,state:packGrantState(inst)})),
  companions:[...(native.companionGrants.owners.get(p)??[])].map(([skillId,row]:any)=>({skillId,level:row.inst.level}))});
 const capture=(label:string)=>original.push(copy({label,input:input(),seed:seed(),view:JSON.parse(observe()),live:{time:w.time,life:p.life,mana:p.mana,useLock:p.useLock,cooldowns:[...p.cooldowns],
  cast:p.casting?{id:p.casting.inst.def.id,level:p.casting.inst.level,tree:p.casting.inst.treeNodes,owner:p.casting.inst===grant?'original-grant':'other',mode:p.casting.mode,elapsed:p.casting.elapsed,total:p.casting.total,paidCost:p.casting.paidCost}:null,
  projectiles:w.projectiles.map(q=>({id:q.inst.def.id,level:q.inst.level,tree:q.inst.treeNodes,owner:q.inst===grant?'original-grant':'other'}))}}));
 const record=(name:string,check:()=>void)=>{check();rows.push({name,sourceOrder:p.sheet.sourceNames(),grants:[...(seat.grantedInsts??[])].map(([id,s])=>[id,s.level,s.treeNodes])});};
 const initial=input(),initialBar=bar(),initialSeed=seed();
 capture('lowered-live-grant');
 const cold=builds.open(initial,initialBar);
 record('cold repair differs from live investment',()=>{assert.equal(builds.read(cold).grants.find((r:any)=>r[0]==='firebolt')[1].tree.length,1);assert.equal(grant.treeNodes!.length,2);});
 record('live source history differs from cold slot order',()=>{assert.notDeepEqual(builds.read(cold).sources.map((r:any)=>r[0]),p.sheet.sourceNames());assert(p.sheet.sourceNames().indexOf('gear:ring2')<p.sheet.sourceNames().indexOf('gear:helmet'));});
 p.fillResources();p.useLock=0;p.cooldowns.clear();w.time=100;
 const aim={x:p.pos.x+100,y:p.pos.y};assert(w.useSkill(p,grant,aim,true));const cast=p.casting;assert(cast&&cast.inst===grant);
 w.time+=cast.total/4;native.updateCasting(p,cast.total/4);assert.equal(p.casting,cast);
 capture('paid-cast-quarter');
 const before=observe(),clock={time:w.time,elapsed:cast.elapsed,mana:p.mana,life:p.life,paid:json(cast.paidCost)},itemBefore=json(m.equipped);
 let draws=0;const seeded=Math.random;Math.random=()=>{draws++;return seeded();};
 let adopted:any;assert.doesNotThrow(()=>{adopted=builds.adopt(initial,initialBar,initialSeed);});
 record('adoption preserves full original durable projection',()=>assert.equal(json(builds.read(adopted)),before));
 record('adoption does not advance or replace a paid cast',()=>{assert.equal(p.casting,cast);assert.equal(cast.inst,grant);assert.equal(w.time,clock.time);assert.equal(cast.elapsed,clock.elapsed);assert.equal(json(cast.paidCost),clock.paid);assert.equal(draws,0);assert.equal(p.mana,clock.mana);assert.equal(p.life,clock.life);});
 record('adoption leaves item investment and inputs untouched',()=>{assert.equal(json(m.equipped),itemBefore);assert.equal(json(initial),json(input()));assert.equal(json(initialSeed),json(seed()));});
 const second=builds.rebuild(adopted,initial);
 record('adopted grant continuity survives subsequent preparation',()=>{assert.equal(json(builds.read(second)),before);assert.equal(builds.lineages(adopted).get('grant/firebolt'),builds.lineages(second).get('grant/firebolt'));});
 const reject=(name:string,change:(value:any)=>void,pattern:RegExp)=>{const changed=copy(initialSeed);change(changed);record(name,()=>{assert.throws(()=>builds.adopt(initial,initialBar,changed),pattern);assert.equal(observe(),before);assert.equal(p.casting,cast);});};
 reject('wrong grant host rejected',s=>{s.grants.find((r:any)=>r.skillId==='firebolt').hostUid++;},/Stale adopted grant/);
 reject('wrong observed grant level rejected',s=>{s.grants.find((r:any)=>r.skillId==='firebolt').level++;},/Stale adopted grant/);
 reject('missing grant identity rejected',s=>{s.grants.pop();},/Stale adopted grant set/);
 reject('duplicate adopted identity rejected',s=>{s.grants.push(s.grants[0]);},/Invalid adopted grant/);
 reject('unknown durable source rejected',s=>{s.sourceOrder.push('temporary:combat');},/Invalid durable source order/);
 reject('missing durable source rejected',s=>{s.sourceOrder=s.sourceOrder.filter((id:string)=>id!=='gear:ring2');},/Stale adopted source order/);
 reject('missing base source rejected',s=>{s.sourceOrder=s.sourceOrder.filter((id:string)=>id!=='level');},/Invalid durable source order/);
 record('cast completion still launches the original retained skill',()=>{w.time+=cast.total;native.updateCasting(p,cast.total);assert.equal(p.casting,null);assert(w.projectiles.some(q=>q.inst===grant));});
 capture('completed-cast');
 Math.random=seeded;
 // A live learned skill also retains investment that a cold load would repair.
 const learned=makeSkillInstance(SKILLS.firebolt,10,2);learned.treeNodes=['flame_studies','flame_studies'];learned.locked=true;m.knownSkills.set('firebolt',learned);w.recalcSeat(seat);learned.level=5;w.recalcSeat(seat);
 const learnedInput=input(),learnedSeed=seed(),learnedCold=builds.open(learnedInput,bar()),learnedAdopted=builds.adopt(learnedInput,bar(),learnedSeed);
 record('adoption preserves learned investment and residence lock',()=>{assert.equal(builds.read(learnedCold).known[0][1].tree.length,1);assert.equal(builds.read(learnedAdopted).known[0][1].tree.length,2);assert.equal(builds.investment(learnedAdopted).learned[0].locked,true);assert.equal(p.skills[2],learned);assert.equal(json(builds.read(learnedAdopted)),observe());});
 capture('trusted-learned-level-adjustment');
 // Use a canonical original relic, not a duplicated character-owned body.
 for(const rung of RELIQUARY.ladder)w.account.features.add(rung.feature);
 const idol=forgeItem({uniqueId:'unquarried_idol',ilvl:40,quality:1,rng})!;assert.equal(bankRelic(w.account,idol,'adoption-probe'),idol);idol.x=0;idol.y=0;w.account.reliquary.seated=[idol.relicKey!];w.restoreAccountRelics(seat);w.recalcSeat(seat);
 const companionSeed=seed(),companionInput=input(),companion=builds.adopt(companionInput,bar(),companionSeed);
 record('canonical companion declarations adopt without touching bodies',()=>{assert.equal(json(builds.read(companion)),observe());assert(builds.lineages(companion).has('companion/summon_stone_golem'));});
 capture('canonical-companion');
 record('missing companion declaration rejected',()=>assert.throws(()=>builds.adopt(companionInput,bar(),{...companionSeed,companions:[]}),/Stale adopted companions/));
 record('stale companion level rejected',()=>assert.throws(()=>builds.adopt(companionInput,bar(),{...companionSeed,companions:companionSeed.companions.map((r:any)=>({...r,level:r.level+1}))}),/Stale adopted companion/));
 writeFileSync(process.argv[2],json({rows,original,scope:'Diagnostic adoption only; no account/workshop state publication, live acknowledgement or native qualification. Learned level lowering is a trusted-data fixture, not a claimed player command.'}),{flag:'wx'});
}finally{restore();}
