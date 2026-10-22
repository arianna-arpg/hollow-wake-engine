import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import * as arena from '../src/sim/arena';
import * as skills from '../src/engine/skills';
import { SKILLS } from '../src/data/skills';
import { SUPPORTS } from '../src/data/supports';
import { seedGlobalRandom } from '../src/sim/rng';

const [previous, current, output] = process.argv.slice(2);
const validationOnly = process.argv.includes('--validate-only');
const load = async (game: string) => {
  const get = (file: string) => import(pathToFileURL(path.join(game, file)).href);
  return { arena: await get('src/sim/arena.ts'), skills: await get('src/engine/skills.ts'),
    ...await get('src/data/skills.ts'), ...await get('src/data/supports.ts'), ...await get('src/sim/rng.ts') };
};
const apis: any = { original: { arena, skills, SKILLS, SUPPORTS, seedGlobalRandom }, previous: await load(previous), current: await load(current) };
const keys = Object.keys(apis), configs: any = {}, results: any[] = [];
for (const key of keys) {
  const api = apis[key]; api.arena.bootSimEngine();
  const restore = api.seedGlobalRandom(311500); let world: any;
  try { world = api.arena.makeSimWorld('warrior', 311500); } finally { restore(); }
  for (const id of Object.keys(world.meta.baseAttrs)) world.meta.baseAttrs[id] = 50;
  world.recalcPlayer(); world.walk = null; world.actors = [world.player];
  const p = world.player;
  for (const [id, value] of Object.entries({ life: 1000, mana: 10000, energyShield: 0, castSpeed: 1, attackSpeed: 1 })) p.sheet.setBase(id, value);
  p.fillResources();
  const queries = ['ruin', 'scattergun', 'trisect', 'one_two', 'mimicry', 'firebolt'].map(id => api.skills.makeSkillInstance(api.SKILLS[id], 1, 3));
  queries[2].state = { comboIdx: 1, comboAt: world.time };
  queries[3].state = { comboIdx: 2, comboAt: world.time };
  queries[5].sockets[0] = { def: api.SUPPORTS.cast_on_crit, level: 1 };
  p.mimicBank = [{ sid: 'ruin', src: 'zombie', at: world.time }];
  const native = ['ruin', 'firebolt', 'scattergun', 'trisect'].map(id => api.skills.makeSkillInstance(api.SKILLS[id], 1, 0));
  p.skills = queries;
  for (const inst of queries) world.meta.knownSkills.set(inst.def.id, inst);
  configs[key] = { world, queries, native };
}
function run(key: string, native: boolean) {
  const { world: w, queries, native: definitions } = configs[key], a = w.player;
  let hud = 0, press = 0, admitted = 0, refused = 0, faces = 0;
  if (!native) {
    a.casting = null; a.useLock = 0; a.reflexLock = 0; a.cooldowns.clear(); a.mana = 10000;
    for (let frame = 0; frame < 512; frame++) {
      // Include exact combo endpoints, expiry, empty/funded guns and empty/selected mimic.
      w.time = frame % 4; a.skillChargeBank(queries[1]).count = frame % 2 ? 0 : 3;
      a.mimicBank = frame % 2 ? [] : [{ sid: 'ruin', src: 'zombie', at: w.time }];
      for (const inst of queries) {
        if (w.skillUsable(a, inst)) hud++;
        if (w.pressUsable(a, inst)) press++;
        faces += w.slotFaceOf(a, inst).id.length;
      }
    }
  } else {
    w.time = 0; const aim = { x: a.pos.x + 120, y: a.pos.y };
    for (let index = 0; index < 1024; index++) {
      const inst = definitions[index % definitions.length];
      a.casting = null; a.useLock = 0; a.reflexLock = 0; a.cooldowns.clear(); a.mana = index % 8 === 0 ? 0 : 10000;
      if (inst.def.id === 'scattergun') a.skillChargeBank(inst).count = 3;
      if (inst.def.id === 'trisect') inst.state = { comboIdx: index % 3, comboAt: w.time };
      if (w.skillUsable(a, inst)) hud++;
      if (w.pressUsable(a, inst)) press++;
      if (w.useSkill(a, inst, aim, true)) admitted++; else refused++;
    }
  }
  return { hud, press, faces, admitted, refused, mana: a.mana, life: a.life,
    banks: [...a.skillChargeState], meta: [...a.metaInsts].map(([id, i]: any) => [id, i.def.id, i.level, i.hostSkillId, i.chainOf]),
    cast: a.casting ? { id: a.casting.inst.def.id, mode: a.casting.mode } : null };
}

const requestConfigs: Record<string, any> = {};
for (const key of keys) {
  const api = apis[key], restore = api.seedGlobalRandom(331500);
  try {
    const world = api.arena.makeSimWorld('warrior', 331500), actor = world.player;
    for (const id of Object.keys(world.meta.baseAttrs)) world.meta.baseAttrs[id] = 50;
    const defs = ['ruin', 'firebolt', 'shambler_horde', 'quickstep', 'life_flask'].map(id => api.skills.makeSkillInstance(api.SKILLS[id], 20, 3));
    actor.skills = defs;
    for (const inst of defs) world.meta.knownSkills.set(inst.def.id, inst);
    world.pickTreeNode('shambler_horde', 'wandering_dead');
    assert(defs[2].treeNodes?.includes('wandering_dead'));
    defs[1].sockets[0] = {def: api.SUPPORTS.cast_on_crit, level: 1};
    world.recalcPlayer();
    for (const [id, value] of Object.entries({life: 1000, mana: 10000, energyShield: 0})) actor.sheet.setBase(id, value);
    actor.fillResources(); actor.charges.set('flask_life', 1);
    const holder = world.createMonster('zombie', 1, 'enemy'); holder.gripping = {id: actor.id, struggle: 0};
    world.actors.push(holder); assert.equal(world.actorById(holder.id), holder);
    requestConfigs[key] = {world, actor, holder, defs, open: world.zone, closed: {...world.zone, castSeal: {}}, aim: {...actor.pos}};
  } finally { restore(); }
}
function requestRun(key: string) {
  const c = requestConfigs[key], a = c.actor, w = c.world;
  let handled = 0, refused = 0;
  w.time = 0; w.texts.length = 0; c.holder.gripping.struggle = 0;
  const uses = [c.defs[0], c.defs[0], c.defs[1], c.defs[2], c.defs[3], c.defs[0], c.defs[0], c.defs[4]];
  for (let index = 0; index < 1024; index++) {
    const lane = index % uses.length;
    w.zone = lane === 0 ? c.closed : c.open;
    a.heldBy = lane === 1 ? c.holder.id : undefined; a.mountId = lane === 4 ? c.holder.id : undefined;
    a.dead = lane === 5; a.useLock = 0; a.reflexLock = 0; a.casting = null; a.cooldowns.clear();
    a.mana = lane === 6 ? 0 : 10000;
    const result = w.useSkill(a, uses[lane], c.aim, true);
    assert.equal(result, lane === 2 || lane === 3, 'request benchmark lane ' + lane);
    if (result) handled++; else refused++;
  }
  const receipt = {handled, refused, struggle: c.holder.gripping.struggle, paused: c.defs[2].replenishmentPaused,
    triggerOff: c.defs[1].state?.triggerOff, life: a.life, mana: a.mana, charges: [...a.charges], casting: !!a.casting};
  assert.equal(handled, 256); assert.equal(refused, 768); assert(receipt.struggle > 0); assert(!receipt.casting);
  return receipt;
}

const dispatchConfigs: Record<string, any> = {};
const dispatchCases: {id: string; mode: string | null; supports?: string[]; variant?: any}[] = [
  {id:'firebolt',mode:'cast'},
  {id:'infernal_ray',mode:'channel'},
  {id:'shield_up',mode:'guard'},
  {id:'lightning_blast',mode:'charge'},
  {id:'firebolt',mode:'overcharge',supports:['overcharge','wandering_mark']},
  {id:'firebolt',mode:'perfect',supports:['perfect_draw']},
  {id:'firebolt',mode:'timed',supports:['wandering_mark']},
  {id:'infinite_slashes',mode:'multitude'},
  {id:'firebolt',mode:'concentration',variant:{targeting:{target:'enemy',castRange:400},concentration:{time:1}}},
  {id:'firebolt',mode:null,variant:{useTime:0}},
  {id:'firebolt',mode:'channel',supports:['gathered_casting']},
];
for(const key of keys) {
  const api=apis[key],restore=api.seedGlobalRandom(341500);
  try {
    const world=api.arena.makeSimWorld('warrior',341500),actor=world.player;
    for(const id of Object.keys(world.meta.baseAttrs))world.meta.baseAttrs[id]=50;
    world.recalcPlayer();world.walk=null;actor.pos={x:500,y:500};
    const foe=world.createMonster('zombie',1,'enemy');foe.pos={x:540,y:500};foe.brain=undefined;world.actors=[actor,foe];
    actor.sheet.setSource('dispatch-benchmark',[
      ...['life','mana'].map(id=>({stat:id,kind:'override',value:10000})),
      ...['energyShield','critChance','poise'].map(id=>({stat:id,kind:'override',value:0})),
      ...['castSpeed','attackSpeed','manaCost','manaUseCost','effectDuration'].map(id=>({stat:id,kind:'override',value:1})),
    ]);
    actor.fillResources();
    assert.equal(actor.maxLife(),10000);assert.equal(actor.maxMana(),10000);
    const definitions=dispatchCases.map(course=>{
      assert(api.SKILLS[course.id],course.id);
      const inst=api.skills.makeSkillInstance(course.variant?{...api.SKILLS[course.id],...course.variant}:api.SKILLS[course.id],1,3);
      for(const [slot,id] of (course.supports??[]).entries()){assert(api.SUPPORTS[id],id);inst.sockets[slot]={def:api.SUPPORTS[id],level:1};}
      return inst;
    });
    const fuel={cur:10000,max:10000,lastSpendAt:-Infinity,ventUntil:0};
    actor.reserveSpecs=[{id:'benchmark-fuel',pool:10000,perCast:1}];actor.reserves=new Map([['benchmark-fuel',fuel]]);
    dispatchConfigs[key]={world,actor,foe,definitions,fuel,aim:{x:540,y:500}};
  } finally {restore();}
}
function dispatchRun(key:string) {
  const c=dispatchConfigs[key],w=c.world,a=c.actor,restore=apis[key].seedGlobalRandom(341501);
  const modes:Record<string,number>={};let total=0,multiplier=0,paid=0,quarries=0;
  try {
    c.fuel.cur=10000;w.time=10;w.projectiles.length=0;w.flashes.length=0;w.texts.length=0;
    a.skillChargeState.clear();a.charges.clear();a.skills=c.definitions;
    for(let index=0;index<1024;index++) {
      const lane=index%dispatchCases.length,inst=c.definitions[lane];
      a.casting=null;a.useLock=0;a.reflexLock=0;a.cooldowns.clear();a.cooldownTotals.clear();a.mana=10000;a.life=10000;
      inst.state={};
      assert.equal(w.useSkill(a,inst,c.aim,true),true,'dispatch benchmark refusal '+lane);
      const cast=a.casting;assert.equal(cast?.mode??null,dispatchCases[lane].mode,'dispatch benchmark mode '+lane);
      modes[cast?.mode??'instant']=(modes[cast?.mode??'instant']??0)+1;
      if(cast){total+=cast.total;multiplier+=cast.baseMult;paid+=cast.paidCost?.mana??0;if(cast.targetInfo?.actor===c.foe)quarries++;}
    }
    assert.equal(c.fuel.cur,8976);assert(modes.instant>0&&modes.guard>0&&quarries>0);
    return {modes,total,multiplier,paid,quarries,fuel:c.fuel.cur,projectiles:w.projectiles.length,mana:a.mana,life:a.life};
  } finally {restore();}
}


for (const [name, native] of [['mixed-hud-press-face', false], ['native-hud-press-and-cast-start', true], ['native-refusals-and-toggles', null], ['native-complete-dispatch-modes', 'dispatch']] as const) {
  const execute = (key: string) => native === 'dispatch' ? dispatchRun(key) : native === null ? requestRun(key) : run(key, native);
  const samples: Record<string, number[]> = Object.fromEntries(keys.map(k => [k, []])); let expected = '';
  // Prime caches across all three before comparing retained-state receipts.
  for (const key of keys) execute(key);
  for (let trial = validationOnly ? 0 : -5; trial < (validationOnly ? 1 : 25); trial++) for (let offset = 0; offset < keys.length; offset++) {
    const key = keys[((trial + keys.length * 2) % keys.length + offset) % keys.length];
    const start = performance.now(), result = execute(key), elapsed = performance.now() - start, actual = JSON.stringify(result);
    if (!expected) expected = actual; else assert.equal(actual, expected, name + '/' + key);
    if (trial >= 0) samples[key].push(elapsed);
  }
  const timing = Object.fromEntries(keys.map(k => {
    const sorted = [...samples[k]].sort((a, b) => a - b);
    return [k, { samplesMs: samples[k], medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.floor(sorted.length * .95)] }];
  }));
  const receipt = JSON.parse(expected); if (typeof native === 'boolean') assert(receipt.hud > 0 && receipt.press > 0);
  if (native === true) assert(receipt.admitted > 0 && receipt.refused > 0);
  results.push({ name, operations: native === false ? 9216 : 1024, derivedSha256: createHash('sha256').update(expected).digest('hex'), receipt, ...timing });
  console.log(validationOnly ? name + ': receipts validated (not performance evidence)' : name + ': ' + keys.map(k => k + '=' + timing[k].medianMs.toFixed(4) + 'ms').join(', '));
}
fs.writeFileSync(output, JSON.stringify({
  scope: validationOnly ? 'Validation only: one receipt comparison per workload after priming; timings are not performance evidence.' : 'Rotating original/v0.28.0/candidate, five warmups and 25 samples. 9216 HUD/press/face queries include combo endpoints/expiry, empty/funded ammunition, empty/selected mimic and trigger-equipped skills. Native workload includes 1024 real cast-start requests; no completed effect simulation. The third workload performs 1024 real requests: silent seals, held struggle, trigger/replenishment toggles, mounted movement, dead-body refusal, unaffordability and full-flask prerequisites. It uses an actually purchased replenishment tree node and explicit body/resource flags. Per-batch reset, result construction and lane assertions are inside timing; worlds/content are prepared outside timing. Feedback is rate-limited at fixed world time. The fourth workload performs 1024 full requests spanning ordinary, channel, guard, charge, overcharge, perfect, timed, multitude, concentration, instant delivery and gathered casting. It seeds attributes/reserve fuel, uses real skills and support definitions, labels synthetic concentration/instant variants, checks every mode and recipient identity, and includes resets and assertions inside timing. All derived receipts equal. Desktop Node timings only; not allocation, renderer frame or device acceptance.',
  validationOnly, node: process.version, platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model, results,
}, null, 2) + '\n', { flag: 'wx' });
