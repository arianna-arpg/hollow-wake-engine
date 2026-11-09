// Capture original cold-load lookup, item investment and real character resume.
// This probe never imports SDK policy or supplies a replacement implementation.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {SKILLS} from '../src/data/skills';
import {SUPPORTS} from '../src/data/supports';
import {GRANT_CFG,BAR_SLOTS,makeSkillInstance,skillGrantStat,skillMaxLevel} from '../src/engine/skills';
import {compileItemMods,rollItem} from '../src/engine/itemgen';
import {serializeCharacter,applySavedCharacter} from '../src/meta/character';
import type {World} from '../src/engine/world';
import type {SkillInstance} from '../src/engine/skills';

bootSimEngine();seedGlobalRandom(0x6e71);
const rows:unknown[]=[],identities=new WeakMap<object,number>();let serial=0;
const id=(value:object|null|undefined)=>{if(!value)return null;if(!identities.has(value))identities.set(value,++serial);return identities.get(value);};
const json=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
const packed=(s:SkillInstance|null|undefined)=>s?{identity:id(s),skillId:s.def.id,level:s.level,bonusLevels:s.bonusLevels,
 sockets:s.sockets.map(g=>g?{id:g.def.id,level:g.level,locked:g.locked,rolled:g.rolled}:null),treeNodes:s.treeNodes,
 grantedBy:s.grantedBy,grantedHostUid:s.grantedHostUid,relicSource:s.relicSource}:null;
function check(name:string,okay:unknown,w:World,result?:SkillInstance|null,save?:unknown){
 assert(okay,name);const seat=w.localSeat,p=seat.actor,m=seat.meta;
 rows.push(json({name,result:packed(result),known:[...m.knownSkills].map(([key,s])=>[key,packed(s)]),
  granted:seat.grantedInsts?[...seat.grantedInsts].map(([key,s])=>[key,packed(s)]):null,
  bar:p.skills.map(id),equipped:m.equipped,items:m.items,
  resources:{life:p.life,mana:p.mana},time:w.time,cast:id(p.casting),save}));
}
const saveView=(save:ReturnType<typeof serializeCharacter>)=>({knownSkills:save.knownSkills,bar:save.bar,equipped:save.equipped,items:save.items});
const w=makeSimWorld('warrior',0x6e71),seat=w.localSeat,m=seat.meta,p=seat.actor;
m.knownSkills.clear();p.skills=Array(BAR_SLOTS).fill(null);m.equipped={};m.items=[];w.recalcSeat(seat);
check('retired definition is absent',w.seatSkillById(seat,'retired-sdk-skill')===null,w);
check('registered definition does not confer ownership',w.seatSkillById(seat,'firebolt')===null,w);
const helm=rollItem({ilvl:20,uniqueId:'cindervigil'})!,ring=rollItem({ilvl:20,uniqueId:'emberbrand'})!;
assert(helm&&ring&&GRANT_CFG.sockets>0);
helm.grantState={firebolt:{sockets:[{supportId:'splitting',level:2,locked:true},...Array(GRANT_CFG.sockets).fill(null)],treeNodes:['retired-node']}};
const savedResidence=json(helm.grantState);
m.equipped={helmet:helm,ring1:ring};
const level=Math.min(skillMaxLevel(SKILLS.firebolt),Math.floor([helm,ring].flatMap(compileItemMods)
 .filter(line=>line.stat===skillGrantStat('firebolt')&&line.kind==='flat').reduce((sum,line)=>sum+line.value,0)));
const grant=w.seatSkillById(seat,'firebolt');assert(grant);
check('cold lookup sums worn grants and takes the first host',grant.level===level&&grant.grantedHostUid===helm.uid&&grant.grantedBy===helm.name,w,grant);
check('cold lookup restores bounded item investment',grant.sockets.length===GRANT_CFG.sockets&&grant.sockets[0]?.def.id==='splitting'
 &&grant.sockets[0]?.level===2&&grant.sockets[0]?.locked===true&&!grant.treeNodes?.length,w,grant);
check('cold lookup leaves the saved residence unnormalized',JSON.stringify(helm.grantState)===JSON.stringify(savedResidence),w,grant);
check('cold lookup leaves other grants and the bar untouched',seat.grantedInsts?.size===1&&p.skills.every(s=>s===null)&&!m.knownSkills.size,w,grant);
check('repeated lookup retains the owned instance',w.seatSkillById(seat,'firebolt')===grant,w,grant);
p.skills[2]=w.seatSkillById(seat,'firebolt');
const learned=makeSkillInstance(SKILLS.firebolt,5,1);learned.sockets[0]={def:SUPPORTS.splitting,level:3};m.knownSkills.set('firebolt',learned);
check('learned ownership wins without replacing the granted copy',w.seatSkillById(seat,'firebolt')===learned&&seat.grantedInsts?.get('firebolt')===grant,w,learned);
m.knownSkills.delete('firebolt');m.equipped={};
check('existing grant ownership wins until a rebuild retires it',w.seatSkillById(seat,'firebolt')===grant,w,grant);
m.equipped={helmet:helm,ring1:ring};w.recalcSeat(seat);
check('first rebuild retains the restored bar instance',seat.grantedInsts?.get('firebolt')===grant&&p.skills[2]===grant,w,grant);
check('rebuild writes the normalized investment to its item',helm.grantState?.firebolt.sockets.length===GRANT_CFG.sockets
 &&helm.grantState.firebolt.sockets[0]?.supportId==='splitting'&&!helm.grantState.firebolt.treeNodes,w,grant);
const saved=json(serializeCharacter(w));
check('save carries item residence and a bar id without a learned grant',!saved.knownSkills.some(s=>s.skillId==='firebolt')
 &&saved.bar[2]==='firebolt'&&saved.equipped!.helmet?.grantState?.firebolt?.sockets[0]?.level===2,w,grant,saveView(saved));
const resumed=makeSimWorld('warrior',0x6e72);assert(applySavedCharacter(resumed,saved));
const returned=resumed.localSeat.grantedInsts?.get('firebolt');
check('real character resume resolves the grant before its first rebuild',returned&&resumed.player.skills[2]===returned&&returned.level===level
 &&returned.sockets[0]?.def.id==='splitting'&&returned.sockets[0]?.level===2,resumed,returned);
const again=json(serializeCharacter(resumed));
check('resumed save retains the same grant residence and binding',again.bar[2]==='firebolt'
 &&JSON.stringify(again.equipped!.helmet?.grantState)===JSON.stringify(saved.equipped!.helmet?.grantState),resumed,returned,saveView(again));
m.knownSkills.set('firebolt',learned);w.recalcSeat(seat);
check('learning takes over the bar while keeping separate item investment',p.skills[2]===learned&&seat.grantedInsts?.get('firebolt')===grant
 &&learned.sockets[0]?.level===3&&helm.grantState.firebolt.sockets[0]?.level===2,w,learned);
const both=json(serializeCharacter(w)),resumedKnown=makeSimWorld('warrior',0x6e73);assert(applySavedCharacter(resumedKnown,both));
const knownAgain=resumedKnown.meta.knownSkills.get('firebolt'),grantAgain=resumedKnown.localSeat.grantedInsts?.get('firebolt');
check('resume keeps learned and granted investment distinct',knownAgain&&grantAgain&&resumedKnown.player.skills[2]===knownAgain
 &&knownAgain.sockets[0]?.level===3&&grantAgain.sockets[0]?.level===2,resumedKnown,knownAgain,saveView(serializeCharacter(resumedKnown)));
p.skills[1]=grant;m.equipped={};w.recalcSeat(seat);
check('rebuild retires only removed grant identities and retains learned ownership',w.seatSkillById(seat,'firebolt')===learned&&!seat.grantedInsts&&p.skills[1]===null&&p.skills[2]===learned,w,learned);
m.knownSkills.clear();p.skills=Array(BAR_SLOTS).fill(null);m.items=[helm];m.equipped={retiredSlot:ring};p.sheet.setSource('lookup-probe',[{stat:skillGrantStat('firebolt'),kind:'flat',value:100}]);
check('bag items unknown slots and sheet-only bonuses cannot mint a cold grant',w.seatSkillById(seat,'firebolt')===null&&!seat.grantedInsts,w);
writeFileSync(process.argv[2],JSON.stringify({schemaVersion:1,scope:'Original cold equipment lookup, item investment and real character save/resume',rows})+'\n',{flag:'wx'});
