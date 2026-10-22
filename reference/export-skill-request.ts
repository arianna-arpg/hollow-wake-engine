// Original request-preflight observations. No SDK imports or replaced decisions.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { bootSimEngine, makeSimWorld } from '../src/sim/arena';
import { seedGlobalRandom } from '../src/sim/rng';
import { makeSkillInstance, registerConvertRule } from '../src/engine/skills';
import { SKILLS } from '../src/data/skills';
import { SUPPORTS } from '../src/data/supports';
import { hivecallState } from '../src/engine/hivecall';
import { throngTravelProtected } from '../src/engine/throngEvolution';
import { ATTRIBUTE_IDS, mod } from '../src/engine/stats';
bootSimEngine();
type Setup = (w: any, a: any, inst: any, foe: any) => void;
type Course = { name: string; skill: string; setup?: Setup; seatPress?: boolean; twice?: boolean; seatless?: boolean; expected?: boolean; preDwell?: boolean; note?: string; noPayment?: boolean; noActorAdmission?: boolean; select?: (w:any,a:any,i:any,f:any)=>{actor?:any,inst?:any} };
const trigger: Setup = (_w, _a, inst) => { inst.sockets[0] = { def: SUPPORTS.cast_on_crit, level: 1 }; };
registerConvertRule('request:yes', () => true);
const courses: Course[] = [
  { name: 'silent-seal-precedes-dwell', skill: 'ruin', setup: w => { w.zone = { ...w.zone, castSeal: {} }; } },
  { name: 'seat-seal-note-is-rate-limited', skill: 'ruin', setup: w => { w.zone = { ...w.zone, castSeal: { line: 'sealed request' } }; }, twice: true },
  { name: 'ai-seal-is-silent', skill: 'ruin', setup: w => { w.zone = { ...w.zone, castSeal: { line: 'sealed request' } }; }, seatPress: false },
  { name: 'seal-precedes-trigger', skill: 'firebolt', setup: (w, a, i, f) => { trigger(w, a, i, f); w.zone = { ...w.zone, castSeal: {} }; } },
  { name: 'throng-driven-precedes-dwell', skill: 'ruin', setup: (_w, a) => { a.throngDriven = true; } },
  { name: 'throng-carried-precedes-dwell', skill: 'ruin', setup: (_w, a) => { a.throngCarried = true; } },
  { name: 'held-press-struggles-without-paying', skill: 'ruin', setup: (_w, a, _i, foe) => { a.heldBy = foe.id; foe.gripping = { id: a.id, struggle: 0 }; } },
  { name: 'mounted-movement-refuses', skill: 'quickstep', setup: (_w, a, _i, foe) => { a.mountId = foe.id; } },
  { name: 'trigger-seat-arms-and-disarms', skill: 'firebolt', setup: trigger, twice: true },
  { name: 'trigger-ai-refuses-after-dwell', skill: 'firebolt', setup: trigger, seatPress: false },
  { name: 'trigger-toggle-precedes-attributes', skill: 'firebolt', setup: (w, a, i, f) => { trigger(w, a, i, f); for (const id of ATTRIBUTE_IDS) w.localSeat.meta.attrs[id] = 0; } },
  { name: 'ordinary-attributes-refuse-before-payment', skill: 'firebolt', setup: w => { for (const id of ATTRIBUTE_IDS) w.localSeat.meta.attrs[id] = 0; } },
  { name: 'stale-trigger-depth-clears-before-attribute-refusal', skill: 'firebolt', setup: (w, _a, i) => { i.state = { trigDepth: 3 }; for (const id of ATTRIBUTE_IDS) w.localSeat.meta.attrs[id] = 0; } },
  { name: 'missing-mimic-art-note', skill: 'mimicry' },
  { name: 'mimic-redirect-uses-selected-art', skill: 'mimicry', setup: (_w, a) => { a.mimicBank = [{ sid: 'ruin', src: 'zombie', at: 0 }]; } },
  { name: 'actual-press-converts-before-mimic', skill: 'mimicry', setup: (_w, a, i) => { a.mimicBank = [{ sid: 'ruin', src: 'zombie', at: 0 }]; i.def = { ...i.def, convert: { when: 'request:yes', skillId: 'firebolt' } }; } },
  { name: 'conversion-rechecks-payload-seal', skill: 'scattergun', setup: (w, a, i) => { a.skillChargeBank(i).count = 0; w.zone = { ...w.zone, castSeal: { mode: 'open', shut: { ids: ['reload_shells'] } } }; } },
  { name: 'host-id-opens-converted-payload', skill: 'scattergun', setup: (w, a, i) => { a.skillChargeBank(i).count = 0; w.zone = { ...w.zone, castSeal: { open: { ids: ['scattergun'] } } }; } },
  { name: 'combo-redirect-clears-seat-press', skill: 'trisect', setup: (w, _a, i) => { i.state = { comboIdx: 1, comboAt: w.time }; } },
  { name: 'repeat-combo-beat-keeps-original-instance', skill: 'one_two', setup: (w, _a, i) => { i.state = { comboIdx: 1, comboAt: w.time }; } },
];
const replenish: Setup = (w, _a, i) => { i.level=20; w.pickTreeNode(i.def.id,'wandering_dead'); assert(i.treeNodes?.includes('wandering_dead')); };
const activeAura: Setup = (w,a,i) => { assert(w.useSkill(a,i,{...a.pos},true)); assert(a.activeAuras.has(i.def.id)); a.useLock=0; a.cooldowns.clear(); };
registerConvertRule('request:no', () => false);
courses.push(
 {name:'replenish-owned-seat-toggles-before-dwell',skill:'shambler_horde',setup:replenish,twice:true,expected:true,preDwell:true,noPayment:true},
 {name:'replenish-ai-refuses-before-dwell',skill:'shambler_horde',setup:replenish,seatPress:false,expected:false,preDwell:true,noPayment:true},
 {name:'replenish-dead-seat-refuses-before-dwell',skill:'shambler_horde',setup:(w,a,i,f)=>{replenish(w,a,i,f);a.dead=true;},expected:false,preDwell:true,note:'replenishes while on your bar',noPayment:true},
 {name:'replenish-downed-seat-refuses-before-dwell',skill:'shambler_horde',setup:(w,a,i,f)=>{replenish(w,a,i,f);a.downed=true;},expected:false,preDwell:true,noPayment:true},
 {name:'replenish-unseated-instance-refuses',skill:'shambler_horde',setup:(w,a,i,f)=>{replenish(w,a,i,f);a.skills=[];},expected:false,preDwell:true,noPayment:true},
 {name:'seal-precedes-replenish-toggle',skill:'shambler_horde',setup:(w,a,i,f)=>{replenish(w,a,i,f);w.zone={...w.zone,castSeal:{}};},expected:false,preDwell:true,noPayment:true},
 {name:'hivecall-dead-form-refuses-before-throng-and-dwell',skill:'summon_swarmlings',setup:(_w,a,i)=>{a.hiveForm={hero:a,host:i,remaining:2,automatic:false,factor:1};a.dead=true;a.throngDriven=true;},expected:false,preDwell:true,noPayment:true},
 {name:'hivecall-seatless-form-refuses-before-dwell',skill:'summon_swarmlings',seatless:true,setup:(w,a,i)=>{a.hiveForm={hero:w.player,host:i,remaining:2,automatic:false,factor:1};},expected:false,preDwell:true,noPayment:true},
 {name:'gnaw-seatless-refuses-after-dwell',skill:'ruin',seatless:true,setup:(_w,a,_i,f)=>{a.clingTo=f.id;a.cling={gnaw:{}};},expected:false,noPayment:true},
 {name:'gnaw-seated-body-is-exempt',skill:'ruin',setup:(_w,a,_i,f)=>{a.clingTo=f.id;a.cling={gnaw:{}};},expected:true},
 {name:'cling-without-gnaw-keeps-cast-kit',skill:'ruin',seatless:true,setup:(_w,a,_i,f)=>{a.clingTo=f.id;a.cling={};},expected:true},
 {name:'held-reflex-flask-passes-without-struggle',skill:'life_flask',setup:(_w,a,_i,f)=>{a.heldBy=f.id;f.gripping={id:a.id,struggle:0};a.life=500;a.charges.set('flask_life',1);},expected:true},
 {name:'mounted-nonmovement-remains-castable',skill:'ruin',setup:(_w,a,_i,f)=>{a.mountId=f.id;},expected:true},
 {name:'mana-debt-keeps-toggle-active',skill:'overclock',setup:(w,a,i,f)=>{activeAura(w,a,i,f);a.overdrive.mana.debt=10;},expected:false,note:'debt outstanding',noPayment:true},
 {name:'life-debt-keeps-toggle-active',skill:'blood_mortgage',setup:(w,a,i,f)=>{activeAura(w,a,i,f);a.overdrive.life.debt=10;},expected:false,note:'debt outstanding',noPayment:true},
 {name:'cleared-debt-allows-toggle-release',skill:'overclock',setup:activeAura,expected:true,noPayment:true},
 {name:'berserk-above-half-life-keeps-toggle',skill:'berserk',setup:(w,a,i,f)=>{activeAura(w,a,i,f);a.life=a.maxLife()*0.501;},expected:false,note:'it will not let go',noPayment:true},
 {name:'berserk-exact-half-life-allows-release',skill:'berserk',setup:(w,a,i,f)=>{activeAura(w,a,i,f);a.life=a.maxLife()*0.5;},expected:true,noPayment:true},
 {name:'trigger-toggle-dead-body-precedes-actor-eligibility',skill:'firebolt',setup:(w,a,i,f)=>{trigger(w,a,i,f);a.dead=true;},expected:true,noPayment:true},
 {name:'conversion-false-rule-keeps-original-skill',skill:'ruin',setup:(_w,_a,i)=>{i.def={...i.def,convert:{when:'request:no',skillId:'firebolt'}};},expected:true},
 {name:'conversion-missing-id-keeps-original-skill',skill:'ruin',setup:(_w,_a,i)=>{i.def={...i.def,convert:{when:'request:yes',skillId:'missing-request-skill'}};},expected:true},
 {name:'missing-captured-definition-refuses',skill:'mimicry',setup:(_w,a)=>{a.mimicBank=[{sid:'missing-request-skill',src:'zombie',at:0}];},expected:false,note:'no art captured',noPayment:true},
 {name:'brimming-flask-prerequisite-refuses-before-payment',skill:'life_flask',setup:(_w,a)=>{a.charges.set('flask_life',1);},expected:false,note:'brimming',noPayment:true},
 {name:'missing-relocation-target-refuses-before-payment',skill:'relocate_workshop',expected:false,note:'no device from this skill in reach',noPayment:true},
 {name:'actor-affordability-refuses-after-request-gates',skill:'ruin',setup:(_w,a)=>{a.mana=0;},expected:false,noPayment:true}
);

const form=(w:any,a:any,i:any)=>{i.treeNodes=['royal_guard'];assert(w.executeSkill(a,i,a.pos));hivecallState(i).meter=100;assert(w.useMetaSkill(a,i,a.pos));assert(w.player!==a&&w.localSeat.home===a);return {actor:w.player};};
const transit:Setup=(w,a)=>{const host=makeSkillInstance(SKILLS.raise_gnatveil,20,3);w.player.skills=[host];w.localSeat.meta.knownSkills.set(host.def.id,host);for(const id of ['battle_hatching','rich_hatch','burst_hatch'])w.pickTreeNode(host.def.id,id);assert(host.treeNodes?.includes('burst_hatch'));a.owner=w.player;a.summonInst=host;assert(throngTravelProtected(a));};
const device=(w:any,a:any)=>{const host=makeSkillInstance(SKILLS.flame_totem,1,3);host.sockets[0]={def:SUPPORTS.packed_workshop,level:1};a.skills=[host];w.localSeat.meta.knownSkills.set(host.def.id,host);assert(w.useSkill(a,host,{x:a.pos.x+70,y:a.pos.y},true));for(let n=0;n<180&&a.casting;n++)w.update(1/60);assert(!a.casting);assert(w.actors.some((x:any)=>x.construct&&x.summonInst===host));a.useLock=0;a.cooldowns.clear();const minted=w.mintMetaInstance(a,host,'relocate_workshop');assert(w.relocationTarget(a,minted,600));return {inst:minted};};
courses.push(
 {name:'native-hive-form-press-ejects-before-dwell',skill:'summon_swarmlings',select:form,expected:true,preDwell:true,noPayment:true},
 {name:'seal-blocks-native-hive-form-ejection',skill:'summon_swarmlings',select:(w,a,i)=>{const selected=form(w,a,i);w.zone={...w.zone,castSeal:{}};return selected;},expected:false,preDwell:true,noPayment:true},
 {name:'authored-throng-transit-refuses-before-dwell',skill:'ruin',seatless:true,setup:transit,expected:false,preDwell:true,noPayment:true},
 {name:'throng-attached-body-keeps-cast-kit',skill:'ruin',seatless:true,setup:(w,a,i,f)=>{transit(w,a,i,f);a.clingTo=f.id;assert(!throngTravelProtected(a));},expected:true},
 {name:'throng-unseated-host-loses-transit-protection',skill:'ruin',seatless:true,setup:(w,a,i,f)=>{transit(w,a,i,f);w.player.skills=[];assert(!throngTravelProtected(a));},expected:true},
 {name:'native-deployed-workshop-relocates',skill:'relocate_workshop',select:device,expected:true},
 {name:'native-dead-workshop-refuses',skill:'relocate_workshop',select:(w,a)=>{const selected=device(w,a);for(const x of w.actors.filter((x:any)=>x.construct))w.kill(x);return selected;},expected:false,note:'no device from this skill in reach',noPayment:true}
);

const lowAttributes:Setup=w=>{for(const id of ATTRIBUTE_IDS)w.localSeat.meta.attrs[id]=0;};
courses.push(
 {name:'matrix-hive-ejection-precedes-driven-refusal',skill:'summon_swarmlings',select:(w,a,i)=>{const selected=form(w,a,i);selected.actor.throngDriven=true;return selected;},expected:true,preDwell:true,noPayment:true,noActorAdmission:true},
 {name:'matrix-throng-precedes-replenish-toggle',skill:'shambler_horde',setup:(w,a,i,f)=>{replenish(w,a,i,f);a.throngDriven=true;},expected:false,preDwell:true,noPayment:true,noActorAdmission:true},
 {name:'matrix-replenish-precedes-held-body-refusal',skill:'shambler_horde',setup:(w,a,i,f)=>{replenish(w,a,i,f);a.heldBy=f.id;f.gripping={id:a.id,struggle:0};},expected:true,preDwell:true,noPayment:true,noActorAdmission:true},
 {name:'matrix-held-precedes-trigger-toggle',skill:'firebolt',setup:(w,a,i,f)=>{trigger(w,a,i,f);a.heldBy=f.id;f.gripping={id:a.id,struggle:0};},expected:false,note:'held fast — struggle!',noPayment:true,noActorAdmission:true},
 {name:'matrix-held-precedes-mounted-movement',skill:'quickstep',setup:(_w,a,_i,f)=>{a.heldBy=f.id;f.gripping={id:a.id,struggle:0};a.mountId=f.id;},expected:false,note:'held fast — struggle!',noPayment:true,noActorAdmission:true},
 {name:'matrix-mounted-movement-precedes-attribute-refusal',skill:'quickstep',setup:(w,a,i,f)=>{lowAttributes(w,a,i,f);a.mountId=f.id;},expected:false,noPayment:true,noActorAdmission:true},
 {name:'matrix-debt-lock-precedes-attribute-read',skill:'overclock',setup:(w,a,i,f)=>{activeAura(w,a,i,f);a.overdrive.mana.debt=10;lowAttributes(w,a,i,f);},expected:false,note:'debt outstanding',noPayment:true,noActorAdmission:true},
 {name:'matrix-trigger-toggle-precedes-conversion',skill:'firebolt',setup:(w,a,i,f)=>{trigger(w,a,i,f);i.def={...i.def,convert:{when:'request:yes',skillId:'ruin'}};},expected:true,noPayment:true,noActorAdmission:true},
 {name:'matrix-attributes-precede-conversion',skill:'firebolt',setup:(w,a,i,f)=>{lowAttributes(w,a,i,f);i.def={...i.def,convert:{when:'request:yes',skillId:'ruin'}};},expected:false,noPayment:true,noActorAdmission:true},
 {name:'matrix-attributes-precede-mimic',skill:'firebolt',setup:(w,a,i,f)=>{lowAttributes(w,a,i,f);i.def={...i.def,mimic:SKILLS.mimicry.mimic};a.mimicBank=[{sid:'ruin',src:'zombie',at:0}];},expected:false,noPayment:true,noActorAdmission:true},
 {name:'native-mimic-without-attribute-gate-keeps-redirect',skill:'mimicry',setup:(w,a,i,f)=>{lowAttributes(w,a,i,f);a.mimicBank=[{sid:'ruin',src:'zombie',at:0}];},expected:true},
 {name:'matrix-conversion-precedes-host-prerequisite',skill:'firebolt',setup:(_w,_a,i)=>{i.def={...i.def,convert:{when:'request:yes',skillId:'ruin'},gate:SKILLS.life_flask.gate};},expected:true},
 {name:'matrix-mimic-precedes-host-prerequisite',skill:'mimicry',setup:(_w,a,i)=>{a.mimicBank=[{sid:'ruin',src:'zombie',at:0}];i.def={...i.def,gate:SKILLS.life_flask.gate};},expected:true},
 {name:'matrix-prerequisite-precedes-device-availability',skill:'relocate_workshop',setup:(_w,_a,i)=>{i.def={...i.def,gate:SKILLS.life_flask.gate};},expected:false,note:'brimming',noPayment:true,noActorAdmission:true},
 {name:'matrix-device-availability-precedes-affordability',skill:'relocate_workshop',setup:(_w,a)=>{a.mana=0;},expected:false,note:'no device from this skill in reach',noPayment:true,noActorAdmission:true},
 {name:'matrix-ordinary-dead-body-reaches-actor-admission',skill:'ruin',setup:(_w,a)=>{a.dead=true;},expected:false,noPayment:true}
);
assert.equal(new Set(courses.map(c=>c.name)).size,courses.length);
const wire = (value: any) => JSON.parse(JSON.stringify(value));
function run(course: Course, index: number) {
  const restore = seedGlobalRandom(313000 + index);
  try {
    const w = makeSimWorld('warrior', 313000 + index), aw: any = w; let a = course.seatless ? w.createMonster('zombie', 1, 'enemy') : w.player;
    for (const id of ATTRIBUTE_IDS) w.localSeat.meta.baseAttrs[id] = 40;
    w.recalcSeat(w.localSeat); aw.walk = null; w.time = 10;
    const foe = w.createMonster('zombie', 1, 'enemy'); foe.brain = undefined;
    w.actors = [a, foe]; a.pos = { x: 500, y: 500 }; foe.pos = { x: 540, y: 500 }; a.aimPos = { ...foe.pos };
    a.sheet.setSource('request-investigation', [mod('life', 'override', 1000), mod('mana', 'override', 1000), mod('energyShield', 'override', 0), mod('critChance', 'override', 0)]);
    a.fillResources(); a.casting = null; a.useLock = 0; a.cooldowns.clear();
    assert(SKILLS[course.skill], course.skill); let inst = makeSkillInstance(SKILLS[course.skill], 1, 3);
    a.skills = [inst]; w.localSeat.meta.knownSkills.set(inst.def.id, inst);
    course.setup?.(w, a, inst, foe);
    const selected=course.select?.(w,a,inst,foe);if(selected?.actor)a=selected.actor;if(selected?.inst)inst=selected.inst;
    let calls: any[] = [];
    const canUse=a.canUse.bind(a);a.canUse=(input:any)=>{calls.push({method:'actor.canUse',skill:input.def.id});return canUse(input);};
    const forget=aw.replenishment.forget.bind(aw.replenishment);
    aw.replenishment.forget=(...args:any[])=>{calls.push({method:'replenishment.forget',skill:args[1]?.def?.id});return forget(...args);};
    for (const name of ['useSkill', 'castSealed', 'castReqRefusal', 'markSeatActed', 'failNote', 'markMetaDirty', 'mintMetaInstance', 'comboStepOf', 'paySkillCost', 'executeSkill', 'hivecallMeta', 'deactivateAura', 'seatEject', 'relocationTarget']) {
      const original = aw[name].bind(w);
      aw[name] = (...args: any[]) => {
        calls.push(wire({ method: name, skill: args[1]?.def?.id, seatPress: name === 'useSkill' ? (args[3] ?? false) : undefined,
          note: name === 'failNote' ? { key: args[1], text: args[2] } : undefined }));
        return original(...args);
      };
    }
    const state = () => wire({ seatActorIsCaster:w.localSeat.actor===a,seatHomeIsCaster:w.localSeat.home===a,devices:w.actors.filter(x=>x.construct).map(x=>({id:x.id,pos:x.pos,life:x.life,lifespan:x.lifespan})),seated:!!w.seatOf(a), paused:inst.replenishmentPaused, activeAuras:[...a.activeAuras.keys()], dead:a.dead, downed:a.downed, mana: a.mana, life: a.life, useLock: a.useLock, lastActedAt: w.localSeat.lastActedAt,
      state: inst.state, casting: a.casting ? { skill: a.casting.inst.def.id, originalInstance: a.casting.inst === inst, hostSkillId: a.casting.inst.hostSkillId, mode: a.casting.mode, elapsed: a.casting.elapsed } : null,
      banks: [...a.skillChargeState], charges: [...a.charges], cooldowns: [...a.cooldowns], mimicSel: a.mimicSel,
      texts: w.texts.map(t => t.text), struggle: foe.gripping?.struggle,
      meta: [...a.metaInsts].map(([key, i]) => ({ key, id: i.def.id, level: i.level, hostSkillId: i.hostSkillId, sharedSockets: i.sockets === inst.sockets, state: i.state })) });
    const steps: any[] = [];
    for (let n = 0; n < (course.twice ? 2 : 1); n++) {
      calls = []; const before = state(), result = w.useSkill(a, inst, { ...foe.pos }, course.seatPress ?? true);
      steps.push({ before, result, after: state(), calls: wire(calls) });
    }
    if (course.name === 'actual-press-converts-before-mimic') assert.equal(state().casting?.skill, 'firebolt');
    if (course.name === 'silent-seal-precedes-dwell') assert(!steps[0].calls.some((c: any) => c.method === 'markSeatActed'));
    if (course.name === 'held-press-struggles-without-paying') { assert(foe.gripping!.struggle > 0); assert.equal(a.mana, 1000); }
    if (course.name === 'combo-redirect-clears-seat-press') assert(steps[0].calls.some((c: any) => c.method === 'useSkill' && c.skill === 'bisect_cut' && c.seatPress === false));
    if(course.noActorAdmission)for(const step of steps)assert(!step.calls.some((c:any)=>c.method==='actor.canUse'),course.name);
    if(course.name==='matrix-hive-ejection-precedes-driven-refusal')assert(!steps[0].after.seatActorIsCaster);
    if(course.name==='matrix-throng-precedes-replenish-toggle')assert.equal(inst.replenishmentPaused,undefined);
    if(course.name==='matrix-replenish-precedes-held-body-refusal')assert.equal(foe.gripping!.struggle,0);
    if(course.name==='matrix-held-precedes-trigger-toggle'){assert(foe.gripping!.struggle>0);assert.equal(inst.state?.triggerOff,undefined);}
    if(['matrix-mounted-movement-precedes-attribute-refusal','matrix-debt-lock-precedes-attribute-read'].includes(course.name))assert(!steps[0].calls.some((c:any)=>c.method==='castReqRefusal'));
    if(['matrix-trigger-toggle-precedes-conversion','matrix-attributes-precede-conversion','matrix-attributes-precede-mimic'].includes(course.name))assert(!steps[0].calls.some((c:any)=>c.method==='mintMetaInstance'));
    if(['matrix-conversion-precedes-host-prerequisite','matrix-mimic-precedes-host-prerequisite','native-mimic-without-attribute-gate-keeps-redirect'].includes(course.name))assert.equal(state().casting?.skill,'ruin');
    if(course.name==='matrix-prerequisite-precedes-device-availability')assert(!steps[0].calls.some((c:any)=>c.method==='relocationTarget'));
    if(course.name==='matrix-ordinary-dead-body-reaches-actor-admission')assert(steps[0].calls.some((c:any)=>c.method==='actor.canUse'));
    if(course.expected!==undefined) for(const step of steps) assert.equal(step.result,course.expected,course.name);
    if(course.preDwell) for(const step of steps) assert(!step.calls.some((c:any)=>c.method==='markSeatActed'),course.name);
    if(course.noPayment) for(const step of steps) assert(!step.calls.some((c:any)=>c.method==='paySkillCost'),course.name);
    if(course.note) assert(steps[0].calls.some((c:any)=>c.method==='failNote'&&c.note.text===course.note),course.name);
    if(course.name==='native-hive-form-press-ejects-before-dwell'){assert(steps[0].before.seatActorIsCaster);assert(!steps[0].after.seatActorIsCaster);assert(steps[0].calls.some((c:any)=>c.method==='seatEject'));}
    if(course.name==='seal-blocks-native-hive-form-ejection')assert(steps[0].after.seatActorIsCaster);
    if(course.name==='native-deployed-workshop-relocates'){assert.notDeepEqual(steps[0].before.devices[0].pos,steps[0].after.devices[0].pos);assert.equal(steps[0].before.devices[0].id,steps[0].after.devices[0].id);}
    if(course.name==='held-reflex-flask-passes-without-struggle')assert.equal(foe.gripping!.struggle,0);
    if(course.name==='replenish-owned-seat-toggles-before-dwell'){assert.equal(steps[0].after.paused,true);assert.equal(steps[1].after.paused,undefined);assert(steps.every(s=>s.calls.some((c:any)=>c.method==='replenishment.forget')));}
    return { name: course.name, skill: course.skill, seatless:!!course.seatless, seatPress: course.seatPress ?? true, steps };
  } finally { restore(); }
}
const result = { status: 'Original source observations; acceptance is recorded separately.',
  scope: 'Original useSkill observations through ordered preflight and real redirects, including competing refusals and native possession/device paths. Actor flags, banks and loadouts are explicitly seeded; aura activation and replenishing tree selection use actual game operations. Explicit body/resource/attribute state and labelled synthetic definition combinations establish precedence. Native workshop deployment/relocation and hive ejection are observed; no general delivery, input-device or rendering claim.', courses: courses.map(run) };
fs.writeFileSync(process.argv[2], JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ courses: result.courses.length, transitions: result.courses.reduce((n, c) => n + c.steps.length, 0) }));
