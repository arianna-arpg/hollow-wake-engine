import inspector from 'node:inspector';
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

const observations: any[]=[];let expected='';
for(const key of keys){for(let warm=0;warm<20;warm++)run(key,true);
 const session=new inspector.Session();session.connect();
 const post=(method:string,args:any={})=>new Promise<any>((resolve,reject)=>session.post(method as any,args,(error,result)=>error?reject(error):resolve(result)));
 await post('Profiler.enable');await post('Profiler.setSamplingInterval',{interval:250});await post('Profiler.start');
 for(let trial=0;trial<128;trial++){const actual=JSON.stringify(run(key,true));if(!expected)expected=actual;else assert.equal(actual,expected,key);}
 const {profile}=await post('Profiler.stop');session.disconnect();fs.writeFileSync(path.join(output,key+'.cpuprofile'),JSON.stringify(profile));observations.push({key,iterations:128,requests:131072,receiptSha256:createHash('sha256').update(expected).digest('hex'),samples:profile.samples.length});console.log(key+': '+profile.samples.length+' samples');
}
fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify({scope:'Inspector CPU sampling of complete native query/cast-start workload after 20 warmups; 128 receipt-checked iterations per implementation. Profiling overhead precludes timing comparisons. Local diagnostic profiles include paths and are not publication artifacts.',samplingIntervalMicroseconds:250,observations},null,2)+'\n');
