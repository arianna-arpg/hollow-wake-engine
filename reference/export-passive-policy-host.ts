// Real original World transitions, including intermediate rebuilds and live summons.
// SDK mode only supplies the explicit authoring refresh hook in the adapted game.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {PASSIVE_NODES,PASSIVE_ADJACENCY,classStartNode,type PassiveNode} from '../src/data/passives';
import {CHOICE_GROUPS,registerChoiceGroup} from '../src/data/passiveChoices';
import {registerPassiveRealm} from '../src/data/passiveRealms';
import {passiveRefund} from '../src/engine/passiveRefund';
import {mod} from '../src/engine/stats';
import {makeSkillInstance,hostSockets} from '../src/engine/skills';
import {SKILLS} from '../src/data/skills';
import {NullInput} from '../src/net/intent';
import {serializeCharacter,applySavedCharacter} from '../src/meta/character';
bootSimEngine();
const refresh:()=>void=process.argv.includes('--sdk')
 ? (await import(new URL('../src/engine/passivePolicyAdapter.ts',import.meta.url).href)).refreshSdkPassivePolicy : ()=>{};
const start=classStartNode('warrior'),prefix='sdk_host_';
const plant=(name:string,links:string[],extra:Partial<PassiveNode>={})=>{
 const id=prefix+name;if(PASSIVE_NODES[id])throw Error('Fixture identity collision');
 PASSIVE_NODES[id]={id,name,description:name,kind:'small',x:9000,y:9000,links,...extra};PASSIVE_ADJACENCY[id]=[...links];
 for(const to of links)(PASSIVE_ADJACENCY[to]??=[]).push(id);return id;
};
const bridge=plant('bridge',[start]),leaf=plant('leaf',[bridge],{mods:[mod('life','flat',20)]});
const choiceGroup=prefix+'deal';registerChoiceGroup({id:choiceGroup,name:'Host deal',pick:2,options:[
 {id:'life',name:'Life',description:'Life',mods:[mod('life','flat',17)]},
 {id:'mana',name:'Mana',description:'Mana',mods:[mod('mana','flat',19)]}]});
const choice=plant('choice',[start],{choice:{group:choiceGroup}});
const firstGroup=prefix+'first';registerChoiceGroup({id:firstGroup,name:'Host first',deal:'first',options:[{id:'first',name:'First',description:'First',attributes:{strength:2}}]});
const first=plant('claimant',[start],{choice:{group:firstGroup}}),shortcut=plant('shortcut',[start],{choice:{group:firstGroup}});
const realm=prefix+'realm',root=plant('root',[],{realm,attributes:{strength:2}}),realmLeaf=plant('realm_leaf',[root],{realm,attributes:{strength:3}});
registerPassiveRealm({id:realm,label:'Host realm',roots:[root],currency:'host_favor',unlockLedger:'host_open'});
const minionNode=plant('minion',[start],{mods:[mod('minionLife','increased',1),mod('minionDamage','increased',1)]});
const graft=plant('graft',[start],{graft:{support:'efficiency',level:2}});
const spare=plant('spare',[start],{attributes:{vitality:3}});
refresh();
const w=makeSimWorld('warrior',74119),m=w.meta,p=w.player;w.loadZone('lastlight');
const font=w.fonts[0];p.pos={...font.pos};p.tier=font.tier??0;m.passivePoints=100;
const cleave=makeSkillInstance(SKILLS.cleave,5);m.knownSkills.set('cleave',cleave);w.recalcPlayer();
let body:ReturnType<typeof w.createMonster>|undefined;let guest:ReturnType<typeof w.addSeat>|undefined;
const clone=<T>(x:T):T=>JSON.parse(JSON.stringify(x));
function snapshot(){return clone({allocated:[...m.allocated],choices:m.choices,grafts:m.grafts,passivePoints:m.passivePoints,realmPoints:m.realmPoints,
 attributes:m.attrs,life:p.maxLife(),mana:p.maxMana(),passiveMods:p.sheet.getSourceMods('passives'),supports:hostSockets(cleave).map(s=>({id:s.def.id,level:s.level})),
 minion:body?{life:body.life,maxLife:body.maxLife(),damage:body.sheet.get('damage'),radius:body.radius,spawnScale:body.spawnScale}:null,
 guest:guest?{allocated:[...guest.meta.allocated],choices:guest.meta.choices,points:guest.meta.passivePoints,life:guest.actor.maxLife()}:null});}
let events:any[]=[];const rows:any[]=[];
for(const name of ['recalcSeat','refreshPassiveCompany','markMetaDirty','resyncMinionSupports','bakeMinionOwnerStats','failNote']){
 const host=w as any,original=host[name];host[name]=function(...args:any[]){const result=original.apply(this,args);events.push({name,refusal:name==='failNote'?args[2]:undefined,state:snapshot()});return result;};
}
function step(name:string,action:()=>unknown){events=[];const result=action();rows.push(clone({name,result,events,state:snapshot()}));}
step('bridge',()=>w.allocateNode(bridge));step('leaf',()=>w.allocateNode(leaf));step('dependent-refusal',()=>w.refundPassiveNode(bridge));
step('service-refusal',()=>{p.pos.x+=1000;const ok=w.refundPassiveNode(leaf);p.pos={...font.pos};return ok;});
step('leaf-refund',()=>w.refundPassiveNode(leaf));step('bridge-refund',()=>w.refundPassiveNode(bridge));
step('choice-first',()=>w.allocateNode(choice,undefined,'life'));step('choice-second',()=>w.allocateNode(choice,undefined,'mana'));
step('choice-duplicate',()=>w.allocateNode(choice,undefined,'mana'));step('choice-refund',()=>w.refundPassiveNode(choice));
step('first-claim',()=>w.allocateNode(first,undefined,'first'));step('shared-shortcut',()=>w.allocateNode(shortcut));
step('claim-refusal',()=>w.refundPassiveNode(first));step('shortcut-refund',()=>w.refundPassiveNode(shortcut));step('claim-refund',()=>w.refundPassiveNode(first));
step('closed-realm',()=>w.allocateNode(realmLeaf));
step('root-only-before-refused-purchase',()=>{w.ledger.host_open=1;return w.allocateNode(realmLeaf);});
step('realm-credit',()=>w.grantRealmPoints('host_favor',3.6));step('realm-purchase',()=>w.allocateNode(realmLeaf));
step('realm-refund',()=>w.refundPassiveNode(realmLeaf));step('roots-idempotent',()=>w.ensureOpenRealmRoots());
step('graft-purchase',()=>w.allocateNode(graft));step('graft-bind',()=>w.bindGraft(graft,'cleave'));step('graft-noop',()=>w.bindGraft(graft,'cleave'));
step('graft-invalid-host',()=>w.bindGraft(graft,'missing'));step('graft-unbind',()=>w.bindGraft(graft,null));step('graft-refund',()=>w.refundPassiveNode(graft));
step('guest-allocate',()=>{guest=w.addSeat('sdk_host_guest',m.classDef,new NullInput());guest.meta.passivePoints=3;return w.allocateNode(bridge,guest);});
step('guest-refusal',()=>{guest!.actor.pos={x:font.pos.x+1000,y:font.pos.y};w.applyAction(guest!,{t:'refundPassive',nodeId:bridge});});
step('guest-refund',()=>{guest!.actor.pos={...font.pos};guest!.actor.tier=font.tier??0;w.applyAction(guest!,{t:'refundPassive',nodeId:bridge});});
step('minion-investment',()=>w.allocateNode(minionNode));
step('spawn-invested-body',()=>{const inst=makeSkillInstance(SKILLS.summon_skeleton,1);m.knownSkills.set(inst.def.id,inst);body=w.createMonster('skeleton_warrior',1,'player',p);body.summonInst=inst;w.actors.push(body);w.bakeMinionOwnerStats(body,p,inst);body.life=body.maxLife();});
step('live-minion-refund',()=>w.refundPassiveNode(minionNode));
step('retired-state-retained',()=>{m.allocated.add('retired_node');m.choices.retired_node=['retired_option'];m.grafts['retired_node:retired_option']='missing_skill';return passiveRefund(m,root);});
step('allocate-with-retired-state',()=>w.allocateNode(bridge));step('retired-blocks-refund',()=>w.refundPassiveNode(bridge));
step('replace-save-containers',()=>{m.allocated=new Set([...m.allocated].filter(id=>id!=='retired_node'));m.choices={};m.grafts={};return w.refundPassiveNode(bridge);});
const savedRoot=PASSIVE_NODES[start];delete PASSIVE_NODES[start];refresh();
step('deleted-class-root',()=>w.allocateNode(spare));step('deleted-root-refund-refusal',()=>w.refundPassiveNode(spare));
PASSIVE_NODES[start]=savedRoot;refresh();step('restored-content-refund',()=>w.refundPassiveNode(spare));
const savedGroup=CHOICE_GROUPS[choiceGroup];delete CHOICE_GROUPS[choiceGroup];refresh();step('missing-choice-group',()=>w.allocateNode(choice,undefined,'life'));
CHOICE_GROUPS[choiceGroup]=savedGroup;refresh();step('restored-choice-group',()=>w.allocateNode(choice,undefined,'life'));
const saved=JSON.parse(JSON.stringify(serializeCharacter(w))),restored=makeSimWorld('warrior',74119);
if(!applySavedCharacter(restored,saved))throw Error('Original save restore refused');
const restoredState=clone({allocated:[...restored.meta.allocated],choices:restored.meta.choices,grafts:restored.meta.grafts,passivePoints:restored.meta.passivePoints,realmPoints:restored.meta.realmPoints,attributes:restored.meta.attrs});
assert.equal(rows.find(r=>r.name==='graft-bind').result,true);
assert.deepEqual(rows.find(r=>r.name==='graft-bind').state.supports,[{id:'efficiency',level:2}]);
const before=rows.find(r=>r.name==='spawn-invested-body').state.minion,after=rows.find(r=>r.name==='live-minion-refund').state.minion;
assert.ok(after.maxLife<before.maxLife&&after.damage<before.damage);assert.equal(after.radius,before.radius);assert.equal(after.spawnScale,before.spawnScale);
fs.mkdirSync(process.argv[2],{recursive:true});fs.writeFileSync(path.join(process.argv[2],'passive-policy-host.json'),JSON.stringify({schemaVersion:1,rows,restoredState})+'\n');
console.log(`Observed ${rows.length} full host transitions, intermediate rebuilds, co-op, saves and live summons.`);
