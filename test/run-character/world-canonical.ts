import {liveRunWorld} from 'candidate/live-run-world';
import {forgeItem} from '../src/engine/itemgen';
import {mulberry32} from '../src/sim/rng';
import {bankRelic} from '../src/engine/accountReliquary';
import {RELIQUARY} from '../src/data/containers';
import type {SkillInstance} from '../src/engine/skills';
const copy=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
const need=(v:unknown,message:string):void=>{if(!v)throw Error(message);};
const skill=(s:SkillInstance)=>copy({id:s.def.id,level:s.level,bonus:s.bonusLevels,sockets:s.sockets.map(r=>r?{id:r.def.id,level:r.level}:null),
 tree:s.treeNodes,grafts:s.grafts?.map(r=>({id:r.def.id,level:r.level})),host:s.grantedHostUid,source:s.grantedBy});
export function relicRunWorld(){
 const f=liveRunWorld(),{w,s,m,p}=f,rng=mulberry32(0x177156),native=w as any;
 m.modeId='immortal';m.charId='relic-xp-hero';m.relicScope='relic-xp-hero';
 for(const rung of RELIQUARY.ladder)w.account.features.add(rung.feature);
 const mint=(uniqueId:string,uid:number)=>{const item=forgeItem({uniqueId,ilvl:40,quality:1,rng});need(item,'Missing relic XP item');item!.uid=uid;return item!;};
 const helmet=mint('cindervigil',7100),ring=mint('emberbrand',7101);m.equipped={helmet,ring1:ring};
 const bead=mint('hermits_bead',7200),idol=mint('unquarried_idol',7201);
 for(const[item,x]of [[bead,0],[idol,1]] as const){need(bankRelic(w.account,item,'relic-xp-hero')===item,'Canonical relic admission failed');item.x=x;item.y=0;}
 w.account.reliquary.seated=[idol.relicKey!,bead.relicKey!];w.restoreAccountRelics(s);w.recalcSeat(s);need(w.bindSkill(2,'firebolt'),'Missing worn grant');
 native.updateCompanionGrants(0);const grant=()=>native.companionGrants.owners.get(p)?.get('summon_stone_golem'),first=grant();need(first?.body,'Missing real companion');
 const firstBody=first.body,firstInst=first.inst;firstBody.life*=.4;
 const projection=()=>copy({attrs:m.attrs,grants:[...(s.grantedInsts??[])].map(([id,inst])=>[id,skill(inst)]),
  companions:[...(native.companionGrants.owners.get(p)??[])].map(([id,row]:[string,{inst:SkillInstance}])=>[id,skill(row.inst)]),
  sources:p.sheet.sourceNames().map(id=>[id,p.sheet.getSourceMods(id)]),equipped:m.equipped});
 const snapshot=()=>copy({...f.snapshot(),canonical:w.account.reliquary,board:(m.containers.reliquary??[]).map(it=>({key:it.relicKey,canonical:w.account.reliquary.items.includes(it)})),
  projection:projection(),companion:grant()?{level:grant().body?.level,life:grant().body?.life,maxLife:grant().body?.maxLife(),remaining:grant().remaining,sameBody:grant().body===firstBody,sameInst:grant().inst===firstInst}:null});
 const relicEvents:unknown[]=[];
 for(const name of ['recalcSeat','markMetaDirty','text','resyncMercenary','relevelActor','bakeMinionOwnerStats'] as const){
  const original=native[name];native[name]=function(...args:any[]){relicEvents.push({name,phase:'before',state:snapshot()});const result=original.apply(this,args);relicEvents.push({name,phase:'after',state:snapshot()});return result;};
 }
 const input=(contentId:string)=>{const value=f.input(contentId);value.nextUid=1000000;value.state.equipped=copy(m.equipped);return value;};
 f.events.length=0;w.metaDirty.clear();
 return{...f,input,projection,snapshot,relicEvents,relicState:()=>copy(w.account.reliquary)};
}
