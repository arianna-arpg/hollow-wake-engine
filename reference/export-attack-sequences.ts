import { makeSimWorld } from '../src/sim/arena';
import { seedGlobalRandom } from '../src/sim/rng';
import { SKILLS } from '../src/data/skills';
import { SUPPORTS } from '../src/data/supports';
import { mod } from '../src/engine/stats';
import { SIM_TAP } from '../src/engine/tap';
import { instanceTrigger, instanceTriggerArmed, skillContextTags, skillCooldownSeconds, makeSkillInstance, supportFitsInst } from '../src/engine/skills';
import { attackSequenceOf, attackSequenceErrors, attackSequenceSweepInstances } from '../src/engine/attackSequenceSpec';
import { supportCompatibilityHtml } from '../src/ui/supportCompatibility';
import { makeSupportGemItem } from '../src/engine/gemitems';
import { instanceDelivery } from '../src/engine/skills';
import { skillDamageBands } from '../src/engine/damage';
import { previewSkill } from '../src/engine/skillPreview';
import { serializeCharacter, rebuildSkill } from '../src/meta/character';
import { serializeSeatMeta, applySeatMeta } from '../src/net/snapshot';
// Test-only observer embedded into the pinned Cleave probe before capture.
// It never imports SDK code or supplies expected outcomes.
import captureFs from 'node:fs';
import captureAssert from 'node:assert/strict';
import {Actor as CaptureActor} from '../src/engine/actor';
import type {World as CaptureWorld} from '../src/engine/world';
import type {SkillInstance as CaptureSkill} from '../src/engine/skills';

let captureGroup=0,captureSerial=0,captureCallSerial=0;
const captureIds=new WeakMap<object,number>();
const captureId=(value:object)=>{let id=captureIds.get(value);if(id===undefined){id=++captureSerial;captureIds.set(value,id);}return id;};
let captureWorlds:{world:CaptureWorld;owner:CaptureActor;host:CaptureSkill;target:CaptureActor}[]=[];
const captureRows:unknown[]=[],captureEvents:unknown[]=[],captureRandom:number[]=[];
const captureActorRef=(actor:CaptureActor)=>({actor:captureId(actor),id:actor.id});
function capturePack(input:unknown):unknown {
  const seen=new WeakMap<object,string>();
  const visit=(value:unknown,at:string):unknown=>{
    if(value===undefined)return {$undefined:true};
    if(typeof value==='number'&&(!Number.isFinite(value)||Object.is(value,-0)))return {$number:Object.is(value,-0)?'-0':String(value)};
    if(typeof value==='function')return {$callable:value.name};
    if(value===null||typeof value!=='object')return value;
    if(value instanceof CaptureActor)return captureActorRef(value);
    const prior=seen.get(value);if(prior!==undefined)return {$ref:prior};seen.set(value,at);
    if(value instanceof Set)return {$set:[...value].map((v,i)=>visit(v,at+'/'+i))};
    if(value instanceof Map)return {$map:[...value].map(([k,v],i)=>[visit(k,at+'/'+i+'/key'),visit(v,at+'/'+i+'/value')])};
    if(Array.isArray(value))return value.map((v,i)=>visit(v,at+'/'+i));
    const object=value as Record<string,unknown>;
    if(object.def&&typeof object.def==='object'&&Array.isArray(object.sockets)&&typeof object.level==='number'){
      const inst=value as CaptureSkill,d=inst.def;
      return {skill:captureId(inst),definition:visit({id:d.id,name:d.name,tags:d.tags,delivery:d.delivery,attackSequence:d.attackSequence,
        trigger:d.trigger,innateMods:d.innateMods,leveling:d.leveling,thresholds:d.thresholds,cooldown:d.cooldown,manaCost:d.manaCost,
        useTime:d.useTime,effects:d.effects,followUp:d.followUp,castCycle:d.castCycle,baseDamage:d.baseDamage},at+'/definition'),
        level:inst.level,bonusLevels:inst.bonusLevels,treeNodes:visit(inst.treeNodes,at+'/treeNodes'),sockets:visit(inst.sockets.map(s=>s&&{id:s.def.id,level:s.level,rolled:s.rolled}),at+'/sockets'),
        grafts:visit(inst.grafts?.map(s=>({id:s.def.id,level:s.level,rolled:s.rolled})),at+'/grafts'),extraMods:visit(inst.extraMods,at+'/extraMods'),
        sequenceRole:inst.sequenceRole,sequenceHost:inst.sequenceHost?captureId(inst.sequenceHost):null,procChainDepth:inst.procChainDepth,
        stateIdentity:inst.state?captureId(inst.state):null,state:visit(inst.state,at+'/state')};
    }
    return Object.fromEntries(Object.entries(object).map(([key,v])=>[key,visit(v,at+'/'+key)]));
  };
  return visit(input,'$');
}
function captureActor(actor:CaptureActor){
  return {identity:captureActorRef(actor),owner:actor.owner&&captureActorRef(actor.owner),pos:actor.pos,tier:actor.tier,radius:actor.radius,
    life:actor.life,mana:actor.mana,es:actor.es,poise:actor.poise,dead:actor.dead,facing:actor.facing,useLock:actor.useLock,
    look:actor.look,lifespan:actor.lifespan,untargetable:actor.untargetable,skills:actor.skills,casting:actor.casting,
    buffs:actor.buffs,statuses:actor.statuses,charges:actor.charges,cooldowns:actor.cooldowns,totals:actor.cooldownTotals,locks:actor.skillRecoveryLocks};
}
function captureWorld(rig:typeof captureWorlds[number]){
  const w=rig.world;
  return {time:w.time,owner:captureActorRef(rig.owner),target:captureActorRef(rig.target),host:rig.host,
    actors:w.actors.map(captureActor),projectiles:w.projectiles.map(p=>({caster:p.caster,inst:p.inst,pos:p.pos,dir:p.dir,speed:p.speed,radius:p.radius,
      tier:p.tier,traveled:p.traveled,range:p.range,pierce:p.pierce,chains:p.chains,hits:p.hits,age:p.age,mult:p.mult,depth:p.depth,
      homing:p.homing,erratic:p.erratic,spiral:p.spiral,orbit:p.orbit,spin:p.spin,weave:p.weave,amp:p.amp,orbitR0:p.orbitR0})),
    pending:{salvos:w.pendingSalvos,repeats:w.pendingRepeats,steps:w.pendingSteps,followUps:w.pendingFollowUps,fuses:w.pendingFuses},
    zones:w.zones,flashes:w.flashes};
}
function captureBeginGroup(group:number){captureGroup=group;captureWorlds=[];}
function captureCheck(name:string,ok:boolean){captureRows.push({group:captureGroup,name,ok,randomDraws:captureRandom.length,eventCount:captureEvents.length,worlds:capturePack(captureWorlds.map(captureWorld))});}
function captureCall(name:string,owner:unknown,args:unknown[],run:()=>unknown):unknown {
  const call=++captureCallSerial;captureEvents.push({group:captureGroup,call,phase:'before',name,owner:capturePack(owner),args:capturePack(args),randomDraws:captureRandom.length});
  try{const result=run();captureEvents.push({group:captureGroup,call,phase:'after',name,result:capturePack(result),randomDraws:captureRandom.length});return result;}
  catch(error){captureEvents.push({group:captureGroup,call,phase:'throw',name,error:error instanceof Error?error.message:String(error),randomDraws:captureRandom.length});throw error;}
}
function captureRig(world:CaptureWorld,owner:CaptureActor,host:CaptureSkill,target:CaptureActor){
  const index=captureWorlds.length;captureWorlds.push({world,owner,host,target});
  const controller=world.attackSequences as unknown as Record<string,(...args:unknown[])=>unknown>;
  for(const name of ['stacks','prepare','forTarget','landed','opening','beforeContact','contact','flight','update','clear','clearAll']){
    const original=controller[name];captureAssert.equal(typeof original,'function');
    controller[name]=function(this:unknown,...args:unknown[]){return captureCall('sequence.'+name,index,args,()=>Reflect.apply(original,this,args));};
  }
}
const captureOriginalActorMethods=new Map<string,(...args:unknown[])=>unknown>();
const captureActorPrototype=CaptureActor.prototype as unknown as Record<string,(...args:unknown[])=>unknown>;
for(const name of ['applyStatus','addBuff','removeBuff','gainCharge']){
  const original=captureActorPrototype[name];captureAssert.equal(typeof original,'function');captureOriginalActorMethods.set(name,original);
  captureActorPrototype[name]=function(this:CaptureActor,...args:unknown[]){return captureCall('actor.'+name,this,args,()=>Reflect.apply(original,this,args));};
}
function captureSeed(){const original=Math.random;Math.random=()=>{const value=original();captureRandom.push(value);return value;};}
function captureFinish(failures:number){
  for(const[name,original]of captureOriginalActorMethods)captureActorPrototype[name]=original;
  captureAssert.equal(failures,0);captureAssert.equal(captureRows.length,114);
  captureFs.writeFileSync(process.argv[2],JSON.stringify({schemaVersion:1,checks:captureRows.length,groups:captureGroup,events:captureEvents.length,randomDraws:captureRandom.length,rows:captureRows,trace:captureEvents,random:captureRandom},null,2)+'\n');
  console.log(`Attack sequences: ${captureRows.length} observed checks, ${captureEvents.length} events, ${captureRandom.length} random draws`);
}


let failures = 0;
const check = (name: string, ok: boolean) => { captureCheck(name, ok);  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failures++; };
const near = (a: number, b: number) => Math.abs(a - b) < 0.00001;
function rig(nodes = ['readied_cleave', 'deep_notches', 'barbed_edge']) {
  const w = makeSimWorld('warrior', 812), p = w.player;
  for (const attr of ['strength', 'dexterity', 'intelligence', 'willpower'] as const) w.meta.baseAttrs[attr] = 100;
  w.recalcPlayer();
  const cleave = makeSkillInstance(SKILLS.cleave, 20, 3);
  w.meta.knownSkills.set('cleave', cleave); p.skills.fill(null); p.skills[0] = cleave;
  for (const node of nodes) w.pickTreeNode('cleave', node);
  p.sheet.setSource('cleave-rig', [mod('mana', 'flat', 10000), mod('accuracy', 'flat', 100000), mod('critChance', 'override', 0), mod('lifeRegen', 'override', 0)]);
  p.fillResources();
  const target = w.createMonster('zombie', 1, 'enemy'); target.skills = [];
  target.pos = { x: p.pos.x + 35, y: p.pos.y }; target.tier = p.tier;
  target.sheet.setSource('cleave-rig', [mod('life', 'flat', 100000), mod('evasion', 'override', 0), mod('blockChance', 'override', 0), mod('moveSpeed', 'override', 0)]);
  target.fillResources(); w.actors.push(target);
  const strike = makeSkillInstance({ ...SKILLS.backstab, id: 'cleave_probe_strike', useTime: 0, cooldown: 0, manaCost: 0,
    tree: undefined, tags: ['attack', 'melee', 'physical'], baseDamage: { physical: [10, 10] }, effects: [{ type: 'damage' }] });
  let releases = 0;
  const execute = w.executeSkill.bind(w);
  w.executeSkill = (...args: Parameters<typeof w.executeSkill>) => { if (args[1] === cleave) releases++; return execute(...args); };
  const hit = () => w.executeSkill(p, strike, target.pos);
  const toggle = () => w.useSkill(p, cleave, target.pos, true);
  const ready = () => { w.time += 3; p.cooldowns.delete('cleave'); };
  captureRig(w, p, cleave, target);
  return { w, p, cleave, target, strike, hit, toggle, ready, count: () => releases };
}
const restore = seedGlobalRandom(812);
captureSeed();
try {
  {
    captureBeginGroup(1);
    const r = rig(), { w, p, cleave, strike, target } = r;
    check('native tree resolves a deterministic melee trigger starting off', instanceTrigger(cleave)?.on === 'meleeHit' && !instanceTriggerArmed(cleave));
    r.hit(); check('unarmed attacks do not release Cleave', r.count() === 0);
    const mana = p.mana, cost = p.skillCost(cleave).mana;
    check('press arms without casting, paying, or starting a cooldown', r.toggle() && instanceTriggerArmed(cleave) && p.mana === mana && !p.cooldowns.has('cleave') && r.count() === 0);
    const cast = p.casting; r.hit();
    check('landed strike releases once, pays its own price, preserves the carrier cast', r.count() === 1 && near(mana - p.mana, cost) && p.casting === cast);
    check('release remains armed and stamps the ordinary recovery clock', instanceTriggerArmed(cleave) && near(p.cooldowns.get('cleave')!, skillCooldownSeconds(p, cleave)));
    r.hit(); check('cooldown prevents additional releases', r.count() === 1);
    check('disarm works during cooldown without resetting it', r.toggle() && !instanceTriggerArmed(cleave) && p.cooldowns.has('cleave'));
    r.toggle(); r.hit(); check('off/on cannot bypass cooldown', r.count() === 1);
    r.ready(); p.mana = 0; r.hit(); check('unaffordable release stays armed without spending its ready state', r.count() === 1 && !p.cooldowns.has('cleave') && instanceTriggerArmed(cleave));
    p.fillResources(); r.hit(); check('funded next strike releases without rearming', r.count() === 2);
    r.ready();
    w.executeSkill(p, makeSkillInstance({ ...strike.def, tags: ['spell', 'physical'] }), target.pos);
    check('non-melee spell hits cannot release Cleave', r.count() === 2);
    strike.procChainDepth = 1; r.hit(); strike.procChainDepth = undefined;
    check('proc descendants cannot release Cleave', r.count() === 2);
    (strike.state ??= {}).trigDepth = 1; r.hit(); strike.state.trigDepth = 0;
    check('trigger descendants cannot release Cleave', r.count() === 2);
    const original = { ...target.pos }; target.pos.x += 1000; r.hit(); target.pos = original;
    check('a whiff leaves Cleave ready', r.count() === 2 && !p.cooldowns.has('cleave'));
    r.hit(); check('recovery followed by a new strike produces another release', r.count() === 3);
    const preview = previewSkill(p, cleave).rows;
    check('preview shows release and imposed cooldown, with no manual attack time', preview.some(x => x.key === 'trigger') && preview.some(x => x.key === 'cooldown') && !preview.some(x => x.key === 'castTime'));
    const saved = serializeCharacter(w).knownSkills.find(x => x.skillId === 'cleave')!;
    const rebuilt = rebuildSkill(saved)!;
    check('save restores the tree but requires deliberately rearming', instanceTrigger(rebuilt)?.on === 'meleeHit' && !instanceTriggerArmed(rebuilt));
    const other = rig(); applySeatMeta(other.w, other.w.localSeat, serializeSeatMeta(w.localSeat));
    check('co-op rebuild preserves armed state and tree', instanceTriggerArmed(other.w.meta.knownSkills.get('cleave')!));
    r.toggle(); applySeatMeta(other.w, other.w.localSeat, serializeSeatMeta(w.localSeat));
    check('co-op rebuild preserves disarmed state', !instanceTriggerArmed(other.w.meta.knownSkills.get('cleave')!));
    w.fonts.push({ pos: { ...p.pos } }); w.meta.abilityEssences.ability4 = 999;
    check('respec removes the trigger and transient armed state', w.fontResetTree('cleave') && !instanceTrigger(cleave) && cleave.state?.triggerOff === undefined);
    p.cooldowns.clear(); p.useLock = 0;
    check('respec restores ordinary manual Cleave', w.useSkill(p, cleave, target.pos, true) && !!p.casting);
  }
  {
    captureBeginGroup(2);
    const base = rig([]), armed = rig();
    check('Barbed Edge owns four seconds of recovery without increasing mana', near(skillCooldownSeconds(armed.p, armed.cleave), 4) && armed.p.skillCost(armed.cleave).mana === base.p.skillCost(base.cleave).mana);
    const recovery = Object.values(SUPPORTS).find(s => s.requiresMechanisms?.includes('cooldown'));
    if (recovery) check('tree-imposed cooldown admits a cooldown support', supportFitsInst(recovery, armed.cleave));
    const wound = rig(['readied_cleave', 'steady_cuts']);
    wound.w.executeSkill(wound.p, wound.cleave, wound.target.pos);
    check('Ready Rhythm first landed hit applies its owned bleed', wound.target.statuses.some(s => s.id === 'bleed' && !!s.sourceKey));
  }
  {
    captureBeginGroup(3);
    const r = rig(); r.toggle();
    for (let i = 0; i < 40; i++) { r.ready(); r.hit(); }
    check('every affordable eligible strike releases, without the random trigger cap', r.count() === 40);
    const borrowed = makeSkillInstance({ ...SKILLS.cleave, id: 'other_native_trigger', tree: undefined, trigger: { on: 'meleeHit', guaranteed: true, maxUseTime: 0.7 } });
    r.p.skills[1] = borrowed; r.ready(); r.hit();
    check('second native trigger uses shared round-robin arbitration', r.count() === 40 && r.p.triggerRR.get('meleeHit') === 1);
    r.ready(); r.hit(); check('trigger descendants cannot chain into the other melee trigger', r.count() === 41 && r.p.triggerRR.get('meleeHit') === 0);
  }
  {
    captureBeginGroup(4);
    const sample = (supported: boolean) => {
      const r = rig();
      if (supported) r.cleave.sockets[0] = { def: SUPPORTS.brutality, level: 1 };
      const hits: { name: string; damage: number }[] = [];
      const previous = SIM_TAP.current, rng = seedGlobalRandom(912);
      SIM_TAP.current = { onHit: (a, _b, result, packet) => {
        if (a === r.p) hits.push({ name: packet.sourceName, damage: result.total });
      } };
      try { r.toggle(); r.hit(); } finally { SIM_TAP.current = previous; rng(); }
      return hits;
    };
    const plain = sample(false), supported = sample(true);
    check('damage records distinguish carrier and Cleave in resolution order', plain.length === 2 && plain[0].name === 'Backstab' && plain[1].name === 'Cleave');
    check('Cleave supports scale its release without scaling the carrier', near(plain[0].damage, supported[0].damage) && supported[1].damage > plain[1].damage);
  }
  {
    captureBeginGroup(5);
    const r = rig();
    const second = r.w.createMonster('zombie', 1, 'enemy');
    second.skills = []; second.pos = { x: r.target.pos.x, y: r.target.pos.y + 5 }; second.tier = r.p.tier;
    second.sheet.setSource('rig', [mod('life', 'flat', 100000), mod('blockChance', 'override', 0), mod('evasion', 'override', 0)]);
    second.fillResources(); r.w.actors.push(second);
    r.toggle(); const mana = r.p.mana; r.hit();
    check('multi-target carrier pays for one Cleave release', r.count() === 1 && near(mana - r.p.mana, r.p.skillCost(r.cleave).mana) && second.life < second.maxLife());
  }
  {
    captureBeginGroup(6);
    const r = rig(); r.toggle(); r.target.invulnerable = true; r.hit();
    check('immune contact does not spend a readied release', r.count() === 0 && !r.p.cooldowns.has('cleave'));
    r.target.invulnerable = false;
    r.p.skills[0] = null; r.hit();
    check('an unseated trigger cannot release', r.count() === 0);
    r.p.skills[0] = r.cleave; r.p.dead = true; r.hit();
    check('dead owners cannot release a readied skill', r.count() === 0);
  }
  {
    captureBeginGroup(7);
    const r = rig();
    const input = (edge: boolean) => r.w.applyInputs(new Map([[r.w.localSeat.id,
      { dx: 0, dy: 0, aim: r.target.pos, held: [true], edge: [edge] }]]), 1 / 60);
    input(true);
    for (let i = 0; i < 60; i++) input(false);
    check('holding the slot arms once instead of toggling each frame', instanceTriggerArmed(r.cleave));
    r.p.useLock = 0.9; input(true);
    check('a second press disarms without shortening existing action recovery', !instanceTriggerArmed(r.cleave) && r.p.useLock === 0.9);
  }

  const step = (r: ReturnType<typeof rig>, seconds: number) => { for (let t = 0; t < seconds - 1e-8; t += 0.02) r.w.update(0.02); };
  const thrown = (nodes = ['unbound_cleave']) => {
    const r = rig(nodes); r.target.pos = { x: r.p.pos.x + 180, y: r.p.pos.y }; r.target.brain = undefined; return r;
  };
  const markers = (r: ReturnType<typeof rig>) => r.w.actors.filter(a => !a.dead && a.construct?.kind === 'embed' && a.owner === r.p);
  const walkTo = (r: ReturnType<typeof rig>, at: { x: number; y: number }, seconds: number) => {
    for (let t = 0; t < seconds; t += 1 / 60) {
      const dx = at.x - r.p.pos.x, dy = at.y - r.p.pos.y;
      r.w.applyInputs(new Map([[r.w.localSeat.id, { dx, dy, aim: r.target.pos, held: [], edge: [] }]]), 1 / 60);
      r.w.update(1 / 60);
    }
  };
  {
    captureBeginGroup(8);
    const r = thrown(['unbound_cleave', 'long_edge', 'wide_front']);
    r.w.executeSkill(r.p, r.cleave, r.target.pos); step(r, 0.5);
    const marker = markers(r)[0];
    if (marker) walkTo(r, { ...marker.pos }, 1);
    check('normal movement enters the airborne glyph and catches the axe', !!marker && marker.dead && [...r.p.buffs.values()].some(b => b.def.label === 'Caught Rhythm'));
    check('walking catch releases the held Cleave cooldown', !r.p.skillRecoveryLocks.has('cleave') && !r.p.cooldowns.has('cleave'));
    const fallen = thrown(['unbound_cleave', 'long_edge']);
    fallen.w.executeSkill(fallen.p, fallen.cleave, fallen.target.pos); step(fallen, 2.8);
    const pickup = markers(fallen)[0];
    if (pickup) walkTo(fallen, { ...pickup.pos }, 1);
    check('normal movement retrieves a fallen axe and releases recovery', !!pickup && pickup.dead && !fallen.p.skillRecoveryLocks.has('cleave') && !fallen.p.cooldowns.has('cleave'));
  }
  {
    captureBeginGroup(9);
    const bare = thrown();
    check('projectile-only Unbound Cleave still refuses Multistrike', !supportFitsInst(SUPPORTS.multistrike, bare.cleave));
    for (const leaf of ['tempered_wave', 'razor_horizon']) {
      const r = thrown(['unbound_cleave', 'heavy_wave', leaf]);
      check(`${leaf}: melee component admits Multistrike`, supportFitsInst(SUPPORTS.multistrike, r.cleave));
      const gem = makeSupportGemItem({ def: SUPPORTS.multistrike, level: 1 });
      r.w.meta.items.push(gem);
      check(`${leaf}: actual bag-to-skill socketing accepts Multistrike`, r.w.socketSupport(gem.uid, 'cleave') && r.cleave.sockets.some(s => s?.def.id === 'multistrike'));
    }
  }
  {
    captureBeginGroup(10);
    const r = thrown(['unbound_cleave', 'heavy_wave', 'tempered_wave', 'razor_horizon']);
    r.target.pos = { x: r.p.pos.x + 45, y: r.p.pos.y }; r.target.anchored = true;
    const throwDamage = skillDamageBands(r.p, r.cleave).total.lo;
    const sweepDamage = skillDamageBands(r.p, attackSequenceSweepInstances(r.cleave)[0]).total.lo;
    r.cleave.sockets[0] = { def: SUPPORTS.multistrike, level: 1 };
    check('Multistrike tooltip recognizes the invested melee components', supportCompatibilityHtml(r.cleave.sockets[0], [r.cleave], () => null).includes('data-support-fit="true"'));
    check('Multistrike damage penalty stays on the sweeps, not the thrown axe', near(skillDamageBands(r.p, r.cleave).total.lo, throwDamage)
      && near(skillDamageBands(r.p, attackSequenceSweepInstances(r.cleave)[0]).total.lo, sweepDamage * 0.75));
    const execute = r.w.executeSkill.bind(r.w), sweeps = new Map<string, number>(); let throws = 0;
    r.w.executeSkill = (...args: Parameters<typeof r.w.executeSkill>) => {
      const [caster, inst] = args, d = instanceDelivery(inst);
      if (caster === r.p && inst.sequenceRole === 'payload' && d.type === 'melee') sweeps.set(d.fx ?? '', (sweeps.get(d.fx ?? '') ?? 0) + 1);
      if (caster === r.p && inst === r.cleave) throws++;
      return execute(...args);
    };
    const mana = r.p.mana, cost = r.p.skillCost(r.cleave).mana;
    r.p.sheet.setSource('no-regen', [mod('manaRegen', 'override', 0)]);
    r.w.useSkill(r.p, r.cleave, r.target.pos, true); step(r, 1.3);
    check('Multistrike repeats both opposed sweeps through the normal repeat queue', sweeps.get('serratedSweep') === 3 && sweeps.get('serratedBackswing') === 3 && !r.w.pendingRepeats.length);
    check('melee repeats preserve a single axe throw and a single payment', throws === 1 && near(mana - r.p.mana, cost));
    check('Multistrike does not retag the primary throw as melee', !skillContextTags(r.cleave).has('melee') && skillContextTags(r.cleave).has('projectile'));
    r.cleave.treeNodes = ['unbound_cleave', 'heavy_wave'];
    check('removing the melee leaves closes component admission again', !supportFitsInst(SUPPORTS.multistrike, r.cleave));
  }
  {
    captureBeginGroup(11);
    const r = thrown(['unbound_cleave', 'heavy_wave', 'tempered_wave', 'razor_horizon']);
    const cost = r.p.skillCost(r.cleave).mana;
    r.cleave.sockets[0] = { def: { ...SUPPORTS.multistrike, id: 'priced_melee_probe', mods: [mod('manaCost', 'more', 0.5)] }, level: 1 };
    check('component-only support costs are charged once despite two sweeps', near(r.p.skillCost(r.cleave).mana, cost * 1.5));
    r.cleave.sockets[0] = { def: SUPPORTS.multistrike, level: 1 };
    r.w.useSkill(r.p, r.cleave, r.target.pos, true);
    check('melee component creates a real repeat train', r.w.pendingRepeats.length > 0);
    r.w.attackSequences.clear(r.p, r.cleave);
    check('retiring the skill cancels its component repeat train', !r.w.pendingRepeats.some(p => p.inst.sequenceHost === r.cleave));
  }
  {
    captureBeginGroup(12);
    const clean = thrown(['unbound_cleave', 'heavy_wave', 'tempered_wave']);
    const slow = thrown(['unbound_cleave', 'heavy_wave', 'tempered_wave']);
    clean.cleave.sockets[0] = { def: SUPPORTS.multistrike, level: 1, rolled: { strikes: 'three', tempo: 'clean' } };
    slow.cleave.sockets[0] = { def: SUPPORTS.multistrike, level: 1, rolled: { strikes: 'three', tempo: 'heavy' } };
    clean.w.useSkill(clean.p, clean.cleave, clean.target.pos, true);
    slow.w.useSkill(slow.p, slow.cleave, slow.target.pos, true);
    const a = clean.w.pendingRepeats[0], b = slow.w.pendingRepeats[0];
    check('rolled Multistrike count and tempo reach the melee repeat train', !!a && !!b && a.n === 3 && b.n === 3 && b.interval > a.interval);
    check('melee tempo price does not slow the axe windup', near(clean.p.speedFactor(clean.cleave), slow.p.speedFactor(slow.cleave)));
  }
  {
    captureBeginGroup(13);
    const r = rig(['readied_cleave']), values: number[] = [];
    r.cleave.def = { ...r.cleave.def, baseDamage: { physical: [100, 100] } };
    const tap = SIM_TAP.current;
    SIM_TAP.current = { onHit: (a, b, _result, packet) => { if (a === r.p && b === r.target) values.push(packet.amounts.physical ?? 0); } };
    try { for (let i = 0; i < 5; i++) r.w.executeSkill(r.p, r.cleave, r.target.pos); } finally { SIM_TAP.current = tap; }
    check('four-hit ramp increases and resets on hit five', values.length === 5 && values[0] < values[1] && values[1] < values[2] && values[2] < values[3] && near(values[0], values[4]));
    check('Readied Cleave is a manual melee attack', !instanceTrigger(r.cleave) && instanceDelivery(r.cleave).type === 'melee');
    const before = r.w.attackSequences.stacks(r.p, r.cleave, r.target);
    r.target.invulnerable = true; r.w.executeSkill(r.p, r.cleave, r.target.pos); r.target.invulnerable = false;
    check('immune hits cannot advance the cycle', r.w.attackSequences.stacks(r.p, r.cleave, r.target) === before);
    const other = r.w.createMonster('zombie', 1, 'enemy'); other.skills = []; other.pos = { x: r.target.pos.x, y: r.target.pos.y + 10 };
    other.sheet.setSource('rig', [mod('life', 'flat', 100000), mod('evasion', 'override', 0), mod('blockChance', 'override', 0)]);
    other.fillResources(); r.w.actors.push(other); r.w.executeSkill(r.p, r.cleave, r.target.pos);
    check('one arc keeps independent victim cycles', r.w.attackSequences.stacks(r.p, r.cleave, r.target) === 2 && r.w.attackSequences.stacks(r.p, r.cleave, other) === 1);
    const passive = rig(['practiced_edge']), plain = rig([]);
    check('Practiced Edge is multiplicative more damage', near(skillDamageBands(passive.p, passive.cleave).total.lo / skillDamageBands(plain.p, plain.cleave).total.lo, 1.15));
  }
  {
    captureBeginGroup(14);
    const r = rig(['readied_cleave', 'deep_notches']);
    for (let i = 0; i < 3; i++) r.w.executeSkill(r.p, r.cleave, r.target.pos);
    check('Berserk waits for maximum stacks', ![...r.p.buffs.values()].some(b => b.def.label === 'Berserk'));
    r.w.executeSkill(r.p, r.cleave, r.target.pos);
    check('maximum grants actual Berserk modifiers', [...r.p.buffs.values()].some(b => b.def.label === 'Berserk') && r.p.sheet.get('lifeLeech') >= 0.03);
  }
  {
    captureBeginGroup(15);
    const r = rig(['readied_cleave', 'deep_notches', 'splitting_armor']), base = r.target.sheet.get('damageTaken');
    r.w.executeSkill(r.p, r.cleave, r.target.pos);
    check('Split Armor increases damage taken from all sources', r.target.sheet.get('damageTaken') > base);
    for (let i = 0; i < 3; i++) r.w.executeSkill(r.p, r.cleave, r.target.pos);
    check('maximum clears owned vulnerability', near(r.target.sheet.get('damageTaken'), base));
  }
  {
    captureBeginGroup(16);
    const r = rig(['readied_cleave', 'steady_cuts', 'finishing_cut']);
    r.target.applyStatus('bleed', 5, 1, 'other bleed', { casterId: 999, sourceKey: 'unrelated' });
    for (let i = 0; i < 4; i++) r.w.executeSkill(r.p, r.cleave, r.target.pos);
    const wounds = r.target.statuses.filter(s => s.sourceKey?.includes(':rhythm'));
    check('fourth hit holds both wound banks for the fifth', r.w.attackSequences.stacks(r.p, r.cleave, r.target) === 4 && wounds.some(s => s.id === 'bleed') && wounds.some(s => s.id === 'impaled' && s.holdDischarge && (s.rupture ?? 0) > 0));
    const life = r.target.life; r.w.executeSkill(r.p, r.cleave, r.target.pos);
    check('fifth hit consumes only owned wounds and resets', r.w.attackSequences.stacks(r.p, r.cleave, r.target) === 0 && !r.target.statuses.some(s => s.sourceKey?.includes(':rhythm')) && r.target.statuses.some(s => s.sourceKey === 'unrelated') && life - r.target.life > 100);
  }
  {
    captureBeginGroup(17);
    const r = rig(['readied_cleave', 'steady_cuts', 'close_quarters']), radii: number[] = [], arcs: number[] = [];
    for (let i = 0; i < 5; i++) {
      r.w.flashes = []; r.w.executeSkill(r.p, r.cleave, r.target.pos);
      const f = r.w.flashes.find(f => f.arc)!; radii.push(f.radius); arcs.push(f.arc!.arcRad);
    }
    check('Close Quarters geometry grows to maximum then resets', radii[3] > radii[0] * 1.4 && arcs[3] > arcs[0] * 1.4 && near(radii[4], radii[0]) && near(arcs[4], arcs[0]));
  }
  {
    captureBeginGroup(18);
    const r = thrown();
    check('Unbound resolves projectile tags and delivery', instanceDelivery(r.cleave).type === 'projectile' && skillContextTags(r.cleave).has('projectile') && !skillContextTags(r.cleave).has('melee'));
    r.w.executeSkill(r.p, r.cleave, r.target.pos); step(r, 0.5);
    check('landed axe locks recovery and waits to bleed', r.p.skillRecoveryLocks.has('cleave') && !r.target.statuses.some(s => s.id === 'bleed') && r.target.life < r.target.maxLife());
    r.p.cooldowns.clear(); r.p.useLock = 0;
    check('cooldown reset cannot bypass outstanding weapon', !r.w.useSkill(r.p, r.cleave, r.target.pos, true));
    r.p.pos = { x: r.target.pos.x - 45, y: r.target.pos.y }; step(r, 0.04);
    check('retrieval applies attributed bleed and releases recovery', !r.p.skillRecoveryLocks.has('cleave') && r.target.statuses.some(s => s.id === 'bleed' && s.casterId === r.p.id));
  }
  {
    captureBeginGroup(19);
    const r = thrown(); r.w.executeSkill(r.p, r.cleave, r.target.pos); step(r, 0.5);
    r.target.dead = true; step(r, 0.04); check('dead target returns lodged weapon', !r.p.skillRecoveryLocks.has('cleave'));
    const miss = thrown(); miss.target.dead = true;
    miss.w.executeSkill(miss.p, miss.cleave, { x: miss.p.pos.x + 480, y: miss.p.pos.y }); step(miss, 1.1);
    check('miss releases hard lock with short recovery', !miss.p.skillRecoveryLocks.has('cleave') && (miss.p.cooldowns.get('cleave') ?? 0) <= 1);
    step(miss, 1.1); check('miss recovers completely', !miss.p.cooldowns.has('cleave'));
  }
  {
    captureBeginGroup(20);
    const r = thrown(['unbound_cleave', 'long_edge', 'wide_front']);
    r.w.executeSkill(r.p, r.cleave, r.target.pos); step(r, 0.5);
    check('bounce bleeds, grants Gyre and marks its landing', r.target.statuses.some(s => s.id === 'bleed') && (r.p.charges.get('gyre') ?? 0) >= 1 && markers(r).length === 1);
    if (markers(r)[0]) r.p.pos = { ...markers(r)[0].pos }; step(r, 0.02);
    check('airborne catch fires nova and builds catch buff', r.w.projectiles.some(p => p.inst.sequenceRole === 'payload') && [...r.p.buffs.values()].some(b => b.def.label === 'Caught Rhythm' && b.stacks === 1));
    step(r, 0.1); r.w.projectiles = []; r.p.pos = { x: r.target.pos.x - 180, y: r.target.pos.y };
    r.w.executeSkill(r.p, r.cleave, r.target.pos); step(r, 0.65);
    check('one caught stack repeats next throw once', markers(r).length === 2);
    step(r, 2.1);
    check('missed catches clear buff but retain fallen axes and recovery', ![...r.p.buffs.values()].some(b => b.def.label === 'Caught Rhythm') && markers(r).length === 2 && r.p.skillRecoveryLocks.has('cleave'));
    for (const marker of [...markers(r)]) { r.p.pos = { ...marker.pos }; step(r, 0.04); }
    check('all fallen pickups return skill without catch rewards', !r.p.skillRecoveryLocks.has('cleave') && markers(r).length === 0 && ![...r.p.buffs.values()].some(b => b.def.label === 'Caught Rhythm'));
  }
  {
    captureBeginGroup(21);
    const r = thrown(['unbound_cleave', 'long_edge', 'driving_front']);
    r.w.executeSkill(r.p, r.cleave, r.target.pos); step(r, 0.1);
    check('Driving Front emits on outbound flight', r.w.projectiles.some(p => p.inst.sequenceRole === 'payload'));
    step(r, 0.5); r.w.projectiles = []; step(r, 0.3);
    check('Driving Front emits during bounce', r.w.projectiles.some(p => p.inst.sequenceRole === 'payload'));
  }
  {
    captureBeginGroup(22);
    const r = thrown(['unbound_cleave', 'heavy_wave', 'tempered_wave', 'razor_horizon']); r.target.pos = { x: r.p.pos.x + 45, y: r.p.pos.y };
    const life = r.target.life;
    check('Serrated Wave press starts cast bar', r.w.useSkill(r.p, r.cleave, r.target.pos, true) && !!r.p.casting);
    const after = r.target.life;
    check('opening sweep hits immediately before throw', after < life && !r.w.projectiles.length && r.w.flashes.some(f => f.fx === 'serratedSweep'));
    step(r, 0.3);
    check('backswing repeats from opposite side', r.target.life < after && r.w.flashes.some(f => f.fx === 'serratedBackswing'));
    step(r, 0.6); check('windup completes axe throw and melee retrieval', r.target.statuses.some(s => s.id === 'bleed') && !r.p.skillRecoveryLocks.has('cleave'));
  }
  {
    captureBeginGroup(23);
    const r = thrown(['unbound_cleave', 'heavy_wave', 'tempered_wave']);
    r.target.pos = { x: r.p.pos.x + 45, y: r.p.pos.y };
    const tap = SIM_TAP.current; let hits = 0;
    SIM_TAP.current = { onHit: (a, b) => { if (a === r.p && b === r.target) hits++; } };
    try {
      const before = r.target.life; r.w.useSkill(r.p, r.cleave, r.target.pos, true);
      check('Serrated Wave alone supplies an immediate sweep below Heavy Wave', r.target.life < before && hits === 1 && r.cleave.treeNodes?.includes('tempered_wave') === true);
      step(r, 0.3);
      check('Serrated Wave alone does not invent a return sweep', hits === 1 && !r.w.flashes.some(f => f.fx === 'serratedBackswing'));
    } finally { SIM_TAP.current = tap; }
  }
  {
    captureBeginGroup(24);
    const r = thrown(['unbound_cleave', 'heavy_wave', 'razor_horizon']);
    r.target.pos = { x: r.p.pos.x + 45, y: r.p.pos.y };
    const before = r.target.life; r.w.useSkill(r.p, r.cleave, r.target.pos, true);
    check('Spreading Wounds alone starts its windup without an immediate sweep', !!r.p.casting && r.target.life === before && !r.w.flashes.some(f => f.fx === 'serratedSweep'));
    step(r, 0.1);
    check('independent return sweep waits for its authored beat', r.target.life === before);
    step(r, 0.2);
    check('Spreading Wounds works without Serrated Wave', r.target.life < before && r.w.flashes.some(f => f.fx === 'serratedBackswing') && !r.w.projectiles.length);
    const preview = previewSkill(r.p, r.cleave).rows.find(row => row.key === 'attackSequence_opening');
    check('standalone delayed sweep preview does not promise an immediate strike', !!preview && JSON.stringify(preview).includes('after cast starts') && !JSON.stringify(preview).includes('Immediately'));
    const saved = rebuildSkill(serializeCharacter(r.w).knownSkills.find(s => s.skillId === 'cleave')!)!;
    check('new Heavy Wave route survives save validation', saved.treeNodes?.includes('heavy_wave') === true && saved.treeNodes.includes('razor_horizon'));
  }
  {
    captureBeginGroup(25);
    const r = thrown(['unbound_cleave', 'heavy_wave', 'razor_horizon', 'tempered_wave']);
    r.target.pos = { x: r.p.pos.x + 45, y: r.p.pos.y };
    const before = r.target.life; r.w.useSkill(r.p, r.cleave, r.target.pos, true);
    const first = r.target.life; step(r, 0.3);
    check('taking the two sweep leaves in either order preserves both hits', first < before && r.target.life < first && r.w.flashes.some(f => f.fx === 'serratedBackswing'));
  }
  {
    captureBeginGroup(26);
    const r = thrown(['unbound_cleave', 'long_edge', 'heavy_wave']);
    check('Long Edge and Heavy Wave fit together in three points', r.cleave.treeNodes?.length === 3 && r.cleave.treeNodes.includes('heavy_wave'));
    const before = r.target.life; r.w.useSkill(r.p, r.cleave, r.target.pos, true);
    check('Heavy Wave no longer requires or grants a casting sweep', r.target.life === before && !r.w.flashes.some(f => f.fx === 'serratedSweep' || f.fx === 'serratedBackswing'));
    r.p.casting = null; r.p.useLock = 0;
    const other = r.w.createMonster('zombie', 1, 'enemy'); other.skills = []; other.brain = undefined; other.pos = { x: r.target.pos.x, y: r.target.pos.y + 55 };
    other.sheet.setSource('rig', [mod('life', 'flat', 10000)]); other.fillResources(); r.w.actors.push(other);
    r.w.executeSkill(r.p, r.cleave, r.target.pos); step(r, 0.5);
    check('Heavy Wave damages and bleeds nearby bodies', other.life < other.maxLife() && other.statuses.some(s => s.id === 'bleed' && s.sourceKey?.includes(':impact')));
    check('bleed explosion combines with Long Edge bounce and Gyre', markers(r).length === 1 && (r.p.charges.get('gyre') ?? 0) >= 1);
    r.w.fonts.push({ pos: { ...r.p.pos } }); r.w.meta.abilityEssences.ability4 = 999;
    check('respec removes recovery, wounds and payloads', r.w.fontResetTree('cleave') && !r.p.skillRecoveryLocks.has('cleave') && !other.statuses.some(s => s.sourceKey?.startsWith('sequence:')) && !r.w.projectiles.some(p => p.inst.sequenceHost === r.cleave));
    const saved = rebuildSkill(serializeCharacter(r.w).knownSkills.find(s => s.skillId === 'cleave')!)!;
    check('save round trip carries no transient recovery', !saved.sequenceHost && !attackSequenceOf(saved));
  }
  {
    captureBeginGroup(27);
    const r = thrown(['unbound_cleave', 'long_edge', 'wide_front']);
    r.cleave.extraMods = [mod('projectileCount', 'flat', 2), mod('projectileSpeed', 'more', 0.25)];
    r.w.executeSkill(r.p, r.cleave, r.target.pos);
    check('projectile count and speed modifiers reach the throw', r.w.projectiles.length === 3 && r.w.projectiles.every(p => near(p.speed, 650)));
    // Let the central shot bounce; the spread shots can miss independently.
    step(r, 0.55);
    const caught = markers(r)[0];
    if (caught) r.p.pos = { ...caught.pos }; step(r, 0.04);
    const nova = r.w.projectiles.filter(p => p.inst.sequenceRole === 'payload');
    check('catch nova inherits count and speed without recovery recursion', nova.length === 10 && nova.every(p => near(p.speed, 650) && !attackSequenceOf(p.inst)));
    step(r, 1.1);
    // Clean any other landed catches by walking over them. Only one airborne
    // catch was necessary to preserve the per-cast rhythm.
    step(r, 2.1);
    for (const marker of [...markers(r)]) { r.p.pos = { ...marker.pos }; step(r, 0.04); }
    check('a partial cast catch preserves its buff even when siblings miss', [...r.p.buffs.values()].some(b => b.def.label === 'Caught Rhythm'));
  }
  {
    captureBeginGroup(28);
    const r = thrown(); r.cleave.sockets[0] = { def: SUPPORTS.time_fuse, level: 1 };
    r.w.executeSkill(r.p, r.cleave, r.target.pos); step(r, 0.5);
    check('fused contact holds recovery until its delayed hit resolves', r.p.skillRecoveryLocks.has('cleave') && r.target.life === r.target.maxLife());
    step(r, 2);
    check('delayed hit lodges its original recoverable weapon', r.target.life < r.target.maxLife() && r.p.skillRecoveryLocks.has('cleave'));
    r.p.pos = { x: r.target.pos.x - 40, y: r.target.pos.y }; step(r, 0.04);
    check('delayed lodge retrieves normally', !r.p.skillRecoveryLocks.has('cleave') && r.target.statuses.some(s => s.id === 'bleed'));
  }
  {
    captureBeginGroup(29);
    const r = thrown(); r.cleave.extraMods = [mod('projShrapnel', 'flat', 3)];
    r.w.executeSkill(r.p, r.cleave, r.target.pos); step(r, 0.4);
    check('lodging still releases ordinary impact shards', r.p.skillRecoveryLocks.has('cleave') && r.w.projectiles.some(p => p.depth > 0));
    const late = thrown(['unbound_cleave', 'long_edge', 'wide_front']);
    late.w.executeSkill(late.p, late.cleave, late.target.pos); step(late, 0.5);
    const marker = markers(late)[0];
    if (marker) late.p.pos = { ...marker.pos };
    // A frame crossing the deadline is a grounded pickup, never a late catch.
    late.w.attackSequences.update(2.1);
    check('crossing the landing deadline grants no catch nova or rhythm', ![...late.p.buffs.values()].some(b => b.def.label === 'Caught Rhythm') && !late.w.projectiles.some(p => p.inst.sequenceRole === 'payload'));
  }
  {
    captureBeginGroup(30);
    const r = thrown(['unbound_cleave', 'long_edge']); r.w.executeSkill(r.p, r.cleave, r.target.pos); step(r, 0.5);
    for (const marker of markers(r)) marker.dead = true;
    step(r, 0.04);
    check('externally removed axe cannot leave recovery stuck', !r.p.skillRecoveryLocks.has('cleave'));
    const absent = thrown(['unbound_cleave', 'long_edge']);
    absent.w.spawnConstruct = () => null;
    absent.w.executeSkill(absent.p, absent.cleave, absent.target.pos); step(absent, 0.5);
    check('failed landing marker placement returns the weapon', !absent.p.skillRecoveryLocks.has('cleave'));
    const r2 = thrown(); r2.w.executeSkill(r2.p, r2.cleave, r2.target.pos); step(r2, 0.5); r2.p.skills[0] = null; step(r2, 0.04);
    check('unseating skill retires its outstanding weapon', !r2.p.skillRecoveryLocks.has('cleave'));
  }
  {
    captureBeginGroup(31);
    const r = rig(['readied_cleave', 'steady_cuts']);
    const bleedGem = Object.values(SUPPORTS).find(s => s.requiresMechanisms?.includes('affliction:bleed'));
    check('tree-owned wounds admit bleed-specific support investment', !!bleedGem && supportFitsInst(bleedGem, r.cleave));
    const plain = rig([]);
    check('bare Cleave does not claim the new wound mechanism', !!bleedGem && !supportFitsInst(bleedGem, plain.cleave));
    const p = thrown(['unbound_cleave', 'long_edge', 'driving_front']);
    const childGem = Object.values(SUPPORTS).find(s => s.requiresMechanisms?.includes('flight:children'));
    check('tree-owned flight children admit lineage investment', !!childGem && supportFitsInst(childGem, p.cleave));
    check('invalid reusable sequence clocks are rejected', attackSequenceErrors({ flightRain: { interval: 0, power: 1, radius: 4, range: 10 } }).length > 0);
    check('preview exposes the true recovery and cycle identities', previewSkill(p.p, p.cleave).rows.some(r => r.key === 'attackSequence_recovery') && previewSkill(r.p, r.cleave).rows.some(r => r.key === 'attackSequence_cycle'));
  }
} finally { restore(); }
console.log(`Cleave: ${failures} failures`);
if (failures) process.exitCode = 1;

captureFinish(failures);
