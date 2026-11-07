// Runs against the game's Actor, data registration, stat sheet and gain gates.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Actor} from '../src/engine/actor';
import {makeSkillInstance, instanceConduits, type ConduitPool, type ConduitSpec} from '../src/engine/skills';
import {mod} from '../src/engine/stats';
import {SKILLS} from '../src/data/skills';
import {SUPPORTS} from '../src/data/supports';
import {PASSIVE_NODES} from '../src/data/passives';
import {CHOICE_GROUPS} from '../src/data/passiveChoices';
import {bootSimEngine} from '../src/sim/arena';

bootSimEngine();
const pools: ConduitPool[] = ['life', 'mana', 'es', 'poise', 'ward', 'guard', 'insight'];
const modes = ['cast', 'perfect', 'timed', 'plant', 'guard', 'channel', 'charge', 'overcharge'];
const wall = SKILLS.stone_communion;
const actor = () => {
  const a = new Actor('observer', 'player', {x: 0, y: 0});
  a.sheet.setSource('observer', [
    ...['life', 'mana', 'energyShield', 'poise', 'insight'].map(id => mod(id, 'override', 100)),
    mod('conduitRate', 'override', 1), mod('conduitEfficiency', 'override', 1),
    mod('wardGain', 'override', 1.5), mod('poiseOvercharge', 'override', .25),
  ]);
  a.skills.fill(null);
  a.life = 68; a.mana = 63; a.es = 42; a.poise = 55; a.ward = 36; a.insight = 57;
  a.reservedMana = 20; a.reservedLife = 10; a.esDelay = 3;
  return a;
};
type Skill = ReturnType<typeof makeSkillInstance>;
function casting(a: Actor, mode: string, held: boolean, inst: Skill) {
  // Only the live fields read by the actor's pump and its resource gates are supplied.
  a.casting = {mode, held, inst, shield: 49, maxShield: 90} as Actor['casting'];
}
function tick(a: Actor, dt: number) {
  (a as unknown as {updateConduits(seconds: number): void}).updateConduits(dt);
}
function state(a: Actor) {
  return {life:a.life, mana:a.mana, es:a.es, poise:a.poise, ward:a.ward, insight:a.insight,
    shield:a.casting?.shield, filled:a.esJustFilled, esDelay:a.esDelay, broken:a.poiseBroken,
    justBroke:a.poiseJustBroke, brackets:[...a.poiseBracketHits], poiseDelay:a.poiseDelay,
    statuses:a.statuses.map(s=>({id:s.id,stacks:s.stacks,remaining:s.remaining}))};
}
type Course = {id:string; frames:ReturnType<typeof state>[]; events:unknown[]};
const courses:Course[] = [];
function sample(id:string, a:Actor, steps:number[], beforeTick?:(i:number)=>void) {
  const events:unknown[] = [];
  a.onLifeSpent = amount => events.push(['spent', amount, a.life, a.mana]);
  const frames = [state(a)];
  for (const [i, dt] of steps.entries()) {beforeTick?.(i); tick(a,dt); frames.push(state(a));}
  courses.push({id,frames,events});
}
for (const from of pools) for (const to of pools) {
  for (const scenario of ['ordinary','absent','restricted','near-cap','break','zero-rate','zero-efficiency']) {
    const a=actor();
    if (scenario !== 'absent') casting(a,'guard',true,makeSkillInstance(wall));
    if (scenario === 'absent') {
      a.reservedMana = a.maxMana();
      a.sheet.setSource('absent',['energyShield','poise','insight'].map(id=>mod(id,'override',0)));
    } else if (scenario === 'restricted') {
      a.poiseBroken = true; a.life = 11; a.reservedLife = 86; a.reservedMana = 70; a.mana = 29;
      a.sheet.setSource('recovery',[mod('healTaken','override',0)]);
    } else if (scenario === 'near-cap') {
      a.life = a.lifeCeiling()-.49; a.mana=a.availableMaxMana()-.5;
      a.es=a.maxEs()-.5; a.poise=124.51; a.insight=99.51; a.casting!.shield=89.5;
    } else if (scenario==='break') {
      a.poise=1; a.life=10.4; a.ward=.1; a.insight=.2; a.casting!.shield=.3;
    } else if (scenario.startsWith('zero-')) {
      a.sheet.setSource('disable',[mod(scenario==='zero-rate'?'conduitRate':'conduitEfficiency','override',0)]);
    }
    a.wornConduits=[{from,to,drainPct:.23,drainFlat:3.5,ratio:1.75,...(scenario==='ordinary'?{}:{floor:0})}];
    sample([from,to,scenario].join('/'),a,[0,.25,1,10]);
  }
}
const hosts = [];
for (const mode of modes) for (const held of [true,false]) for (const toggle of ['none','foreign','aura','summon']) {
  const a=actor(), inst=makeSkillInstance(wall,4,2);
  inst.sockets[0]={def:SUPPORTS.stoneblood_conduit,level:3};
  inst.grafts=[{def:SUPPORTS.stoneblood_conduit,level:2}];
  a.skills[1]=inst;
  casting(a,mode,held,makeSkillInstance(toggle==='foreign'?SKILLS.fireball:wall));
  if(toggle==='aura')a.activeAuras.set(inst.def.id,{} as never);
  if(toggle==='summon')a.summonToggles.set(inst.def.id,{inst,reserved:0});
  a.wornConduits=[{from:'mana',to:'poise',drainFlat:4,ratio:2}];
  sample('host/'+[mode,held,toggle].join('/'),a,[.1,.7],i=>{if(i===1)inst.sockets[0]=null;});
}
// Exercise every actual innate, accepted support, invested node and passive conduit.
for (const def of Object.values(SKILLS)) {
  const inst=makeSkillInstance(def,4,2);
  const tree=def.tree;
  const nodes=[...(tree?.nodes??[]),...(tree?.branches??[]).flatMap(b=>b.rungs),...(tree?.neutral?[tree.neutral]:[])];
  for (const n of nodes) if(n.conduits?.length) (inst.treeNodes??=[]).push(n.id);
  const specs=instanceConduits(inst);
  if(!specs.length)continue;
  const a=actor();a.skills[0]=inst;casting(a,'guard',true,inst);
  hosts.push({id:def.id,nodes:inst.treeNodes,specs});
  sample('authored/skill/'+def.id,a,[.5,1.5]);
}
const submit=(id:string,spec:ConduitSpec)=>{
  const a=actor();casting(a,'guard',true,makeSkillInstance(wall));a.wornConduits=[spec];
  sample(id,a,[.5,1.5]);
};
for(const s of Object.values(SUPPORTS))if(s.conduit)submit('authored/support/'+s.id,s.conduit);
for(const node of Object.values(PASSIVE_NODES)){
  if(node.conduit)submit('authored/passive/'+node.id,node.conduit);
}
for(const group of Object.values(CHOICE_GROUPS))for(const opt of group.options)
  if(opt.conduit)submit('authored/choice/'+group.id+'/'+opt.id,opt.conduit);
assert(hosts.length && courses.some(c=>c.events.length));
assert.equal(new Set(courses.map(c=>c.id)).size,courses.length);
fs.writeFileSync(process.argv[2],JSON.stringify({hosts,courses}));
