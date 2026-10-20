import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {gunzipSync} from 'node:zlib';
import {PassivePolicy} from '../dist/passive-policy.js';
const fixture=JSON.parse(gunzipSync(fs.readFileSync(new URL('../baseline/milestone-eight/passives.json.gz',import.meta.url))));
const authored=new PassivePolicy(fixture.authored),copy=x=>JSON.parse(JSON.stringify(x));
const live=s=>({...copy(s),allocated:new Set(s.allocated)});
const state=s=>({...s,allocated:[...s.allocated]});
test('host-owned sessions reproduce every original command and observe replaced save containers',()=>{
 let count=0;
 for(const scenario of fixture.scenarios){
  const p=scenario.policy?new PassivePolicy(scenario.policy):authored,m=live(scenario.initial),b=p.attach(m);
  for(const row of scenario.steps){const c=row.command,access={ledger:c.ledger??{},openAllRealms:c.openAllRealms};
   if(c.type==='allocate')assert.equal(b.allocate(c.id,access,c.option).accepted,row.result);
   else if(c.type==='refund')assert.equal(b.refund(c.id,c.serviceRefusal??null).refusal,row.result.refusal);
   else if(c.type==='quote')assert.deepEqual(b.quoteRefund(c.id),row.result);
   else if(c.type==='choice')assert.equal(b.choiceLock(c.id,c.option),row.result);
   else if(c.type==='roots')assert.deepEqual(b.ensureOpenRoots(access),row.rootsAdded);
   else if(c.type==='grant')b.grantRealmPoints(c.currency,c.amount);
   else if(c.type==='bind')assert.equal(b.bindGraft(c.key,c.skillId,new Set(c.knownSkills)),row.result);
   else assert.fail(c.type);
   assert.deepEqual(state(m),row.expected,scenario.name);
   if(++count%13===0)Object.assign(m,live(row.expected));
  }
 }
 assert.equal(count,9699);
});
function setup(){
 const pack={schemaVersion:1,capability:'passive-policy/v1',contentId:'live-test',defaultPick:1,pickCost:1,requireVocationGate:false,
  nodes:[{id:'root',name:'Root'},{id:'leaf',name:'Leaf',graft:{support:'s'}},{id:'realmRoot',name:'Other',realm:'other'},{id:'realmLeaf',name:'Other leaf',realm:'other'}],
  adjacency:{root:['leaf'],leaf:['root'],realmRoot:['realmLeaf'],realmLeaf:['realmRoot']},groups:[],realms:[{id:'tree'},{id:'other',roots:['realmRoot'],currency:'favor',unlockLedger:'open'}],classes:[{id:'hero',startNode:'root'}],vocations:[]};
 const initial={classId:'hero',allocated:['root'],choices:{},grafts:{},vocations:[],passivePoints:3,vocationPoints:0,realmPoints:{}};
 return {pack,initial};
}
test('host ownership is explicit; read-only queries preserve containers and snapshots stay detached',()=>{
 const {pack,initial}=setup(),p=new PassivePolicy(pack),m=live(initial),b=p.attach(m),other=p.attach(live(initial));
 const allocated=m.allocated,choices=m.choices,grafts=m.grafts;
 assert(b.allocate('leaf',{ledger:{}}).accepted);assert.equal(m.passivePoints,2);assert.equal(m.allocated,allocated);
 assert(b.bindGraft('leaf','skill',new Set(['skill'])));assert.equal(m.grafts,grafts);assert.equal(m.grafts.leaf,'skill');
 for(let i=0;i<100;i++){assert.equal(b.quoteRefund('leaf').refusal,null);assert.notEqual(other.quoteRefund('leaf').refusal,null);}
 assert.equal(m.choices,choices);const saved=b.snapshot();saved.grafts.leaf='edited';saved.allocated.length=0;assert(m.allocated.has('leaf'));assert.equal(m.grafts.leaf,'skill');
 m.allocated=new Set(['root']);m.grafts={};assert.notEqual(b.quoteRefund('leaf').refusal,null);
 assert.deepEqual(b.ensureRealmRoots('other'),['realmRoot']);assert.deepEqual(b.ensureRealmRoots('other'),[]);
 assert.equal(m.realmPoints.favor,undefined);assert.equal(b.allocate('realmLeaf',{ledger:{open:1}}).accepted,false);
});
test('retired live selections are retained and refunds report the original refusal priority',()=>{
 const {pack,initial}=setup(),p=new PassivePolicy(pack),m=live(initial);m.allocated.add('leaf');m.allocated.add('retired');m.choices.retired=['lost'];m.grafts['retired:lost']='skill';m.vocations.push('retired-vocation');
 const b=p.attach(m);assert.equal(b.quoteRefund('root').refusal,'This starting node was granted freely.');assert.equal(b.quoteRefund('retired').refusal,'This node is not allocated.');
 assert.equal(b.refund('leaf').refusal,'An allocated node is no longer available.');assert.deepEqual(m.choices.retired,['lost']);assert.equal(m.grafts['retired:lost'],'skill');
 assert.equal(b.bindGraft('leaf','skill',new Set(['skill'])),true);assert.throws(()=>p.create(state(m)),/Unknown allocated/);
});
test('live reference mode is explicit and does not fabricate deleted roots or missing choice power',()=>{
 const {pack,initial}=setup();pack.nodes=pack.nodes.filter(n=>n.id!=='root'&&n.id!=='realmRoot');pack.nodes[0].choice={group:'retired'};
 pack.nodes.push({id:'plain',name:'Plain'});pack.adjacency.plain=['root'];
 assert.throws(()=>new PassivePolicy(pack),/Unknown passive/);
 const p=new PassivePolicy(pack,{references:'live'}),m=live(initial),b=p.attach(m);
 assert.deepEqual(b.ensureRealmRoots('other'),[]);assert.equal(b.allocate('leaf',{ledger:{}},'lost').accepted,false);
 assert.equal(b.allocate('leaf',{ledger:{}}).accepted,false);assert.equal(b.choiceLock('leaf','lost'),'not a choice node');
 assert.deepEqual([...m.allocated],['root']);assert.equal(m.passivePoints,3);
 assert.equal(b.allocate('plain',{ledger:{}}).accepted,true);assert.equal(b.quoteRefund('plain').refusal,'An allocated node is no longer available.');
});
