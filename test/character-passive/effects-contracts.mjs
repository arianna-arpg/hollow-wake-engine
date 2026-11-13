import assert from 'node:assert/strict';
import {PassivePolicy} from '../../dist/passive-policy.js';
import {PassiveActions} from '../../dist/passive-actions.js';
import {changeCharacterPassive} from '../../dist/character-passive-commands.js';
import {CharacterPassiveEffects} from '../../dist/character-passive-effects.js';
const copy=value=>JSON.parse(JSON.stringify(value));
const policy=new PassivePolicy({schemaVersion:1,capability:'passive-policy/v1',contentId:'passive-playback-control',defaultPick:1,pickCost:1,requireVocationGate:false,
 nodes:[{id:'root',name:'Root'},{id:'leaf',name:'Leaf'}],adjacency:{root:['leaf'],leaf:['root']},groups:[],realms:[{id:'tree'}],classes:[{id:'hero',startNode:'root'}],vocations:[]});
function state(){return{classId:'hero',allocated:new Set(['root','leaf']),choices:{},grafts:{},vocations:[],passivePoints:1,vocationPoints:0,realmPoints:{}};}
function host(){
 const passives=state(),combat={life:80,cooldown:5,time:1},known=new Map([['same',{id:'same',label:'learned/same'}],['second',{id:'second',label:'learned/second'}]]),grants=new Map([['same',{id:'same',label:'grant/same'}]]);
 const bodies=[{id:1,alive:true},{id:2,alive:true}],events=[];
 const snapshot=()=>copy({passives:{...passives,allocated:[...passives.allocated]},combat,events});
 const record=event=>events.push(event);
 const recalculate=()=>{record('recalculate');bodies[1].alive=false;bodies.push({id:3,alive:true});};
 const supports=skill=>{record(skill.label);if(skill.label==='learned/same'){known.delete('second');known.set('late',{id:'late',label:'learned/late'});}};
 const advance=()=>{combat.life-=13;combat.cooldown-=1.5;combat.time+=1.5;grants.set('late',{id:'late',label:'grant/late'});};
 return{passives,combat,known,grants,bodies,events,snapshot,record,recalculate,supports,advance};
}
function planner(h){
 const rows=new WeakMap(),previous=Object.freeze({});
 const saved={state:{board:{w:1,h:1},items:[],equipped:{},overflow:[],essences:{},skillBook:{known:[],bar:Array(8).fill(null)}},character:{passives:{...copy(h.passives),allocated:[...h.passives.allocated]}},nextUid:1,
  projection:{known:[...h.known].map(([id])=>[id,{}]),grants:[...h.grants].map(([id])=>[id,{}])}};
 rows.set(previous,copy(saved));
 const read=token=>copy(rows.get(token));
 const plan=changeCharacterPassive({policy,previous,read,rebuild:(_before,next)=>{const token=Object.freeze({});rows.set(token,{...copy(next),projection:copy(saved.projection)});return token;}},{op:'refund',nodeId:'leaf'},{refundRefusal:null,openAllRealms:false,runLedger:{}});
 return{plan,read};
}
const actual=host(),control=host(),prepared=planner(actual),before=actual.snapshot();assert.deepEqual(actual.snapshot(),before);
assert.deepEqual(prepared.plan.events.map(e=>e.kind),['capture-summons','recalculate','resync-owned-supports','refresh-captured-summons','refresh-company','meta-dirty','character-dirty']);
actual.advance();control.advance();
const action=new PassiveActions({session:()=>policy.attach(control.passives),access:()=>({ledger:{}}),refundRefusal:()=>null,graft:()=>null,
 knownIds:()=>new Set(control.known.keys()),known:(_seat,id)=>control.known.get(id),skills:()=>[...control.known.values(),...control.grants.values()],
 summons:()=>{control.record('capture');return [...control.bodies];},alive:body=>body.alive,recalculate:()=>{control.recalculate();},
 refreshCompany:()=>{control.record('company');},resyncSupports:skill=>{control.supports(skill);},refreshSummon:(_seat,body)=>{control.record('body/'+body.id);},
 markMetaDirty:()=>{control.record('meta');},markCharacterDirty:()=>{control.record('character');},fail:()=>assert.fail('Unexpected original refusal')});
assert.equal(action.refund(null,'leaf'),true);
let player;const ports={
 rebuild(index){const p=prepared.read(prepared.plan.rebuilds[index].after).character.passives;Object.assign(actual.passives,copy(p),{allocated:new Set(p.allocated)});actual.recalculate();},
 captureSummons(){actual.record('capture');return actual.bodies;},alive:body=>body.alive,learned:()=>actual.known.values(),granted:()=>actual.grants.values(),known:id=>actual.known.get(id),
 refreshSupports:skill=>{actual.supports(skill);},refreshSummon:body=>{actual.record('body/'+body.id);},refreshCompany:()=>{actual.record('company');},
 markMetaDirty:()=>{actual.record('meta');},markCharacterDirty:()=>{actual.record('character');},refusal:()=>assert.fail('Unexpected planned refusal')};
player=new CharacterPassiveEffects(ports);player.play(prepared.plan.events);
assert.deepEqual(actual.snapshot(),control.snapshot(),'acknowledgement playback differs from the qualified borrowed action');
assert.deepEqual(actual.events,['capture','recalculate','learned/same','learned/second','grant/same','grant/late','body/1','company','meta','character']);
assert.deepEqual(actual.combat,{life:67,cooldown:3.5,time:2.5});
// Captured callbacks stay bound even if the port object is changed afterward.
ports.markMetaDirty=()=>assert.fail('Replaced callback used');player.play([{kind:'meta-dirty'}]);assert.equal(actual.events.at(-1),'meta');
let reentrant,entered=0;
reentrant=new CharacterPassiveEffects({...ports,refreshCompany(){entered++;reentrant.play([]);},markMetaDirty(){entered++;}});
assert.throws(()=>reentrant.play([{kind:'refresh-company'}]),/reentrant-passive-effects/);reentrant.play([{kind:'meta-dirty'}]);assert.equal(entered,2);
const asynchronous=new CharacterPassiveEffects({...ports,markMetaDirty:()=>Promise.resolve()});assert.throws(()=>asynchronous.play([{kind:'meta-dirty'}]),/must-be-synchronous/);
console.log({passed:true,cases:5,currentSkillEnumeration:true,snapshotOrder:true,capturedSurvivors:true,combatStatePreserved:true,originalWorldQualified:false});
