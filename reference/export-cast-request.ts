// Unaccepted original preflight/redirect observations. No SDK imports or replaced decisions.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { bootSimEngine, makeSimWorld } from '../src/sim/arena';
import { seedGlobalRandom } from '../src/sim/rng';
import { makeSkillInstance, registerConvertRule } from '../src/engine/skills';
import { SKILLS } from '../src/data/skills';
import { SUPPORTS } from '../src/data/supports';
import { ATTRIBUTE_IDS, mod } from '../src/engine/stats';
bootSimEngine();
type Setup = (w: any, a: any, inst: any, foe: any) => void;
type Course = { name: string; skill: string; setup?: Setup; seatPress?: boolean; twice?: boolean };
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
const wire = (value: any) => JSON.parse(JSON.stringify(value));
function run(course: Course, index: number) {
  const restore = seedGlobalRandom(313000 + index);
  try {
    const w = makeSimWorld('warrior', 313000 + index), a = w.player, aw: any = w;
    for (const id of ATTRIBUTE_IDS) w.localSeat.meta.baseAttrs[id] = 40;
    w.recalcSeat(w.localSeat); aw.walk = null; w.time = 10;
    const foe = w.createMonster('zombie', 1, 'enemy'); foe.brain = undefined;
    w.actors = [a, foe]; a.pos = { x: 500, y: 500 }; foe.pos = { x: 540, y: 500 }; a.aimPos = { ...foe.pos };
    a.sheet.setSource('request-investigation', [mod('life', 'override', 1000), mod('mana', 'override', 1000), mod('energyShield', 'override', 0), mod('critChance', 'override', 0)]);
    a.fillResources(); a.casting = null; a.useLock = 0; a.cooldowns.clear();
    assert(SKILLS[course.skill], course.skill); const inst = makeSkillInstance(SKILLS[course.skill], 1, 3);
    a.skills = [inst]; w.localSeat.meta.knownSkills.set(inst.def.id, inst);
    course.setup?.(w, a, inst, foe);
    let calls: any[] = [];
    for (const name of ['useSkill', 'castSealed', 'castReqRefusal', 'markSeatActed', 'failNote', 'markMetaDirty', 'mintMetaInstance', 'comboStepOf', 'paySkillCost', 'executeSkill']) {
      const original = aw[name].bind(w);
      aw[name] = (...args: any[]) => {
        calls.push(wire({ method: name, skill: args[1]?.def?.id, seatPress: name === 'useSkill' ? (args[3] ?? false) : undefined,
          note: name === 'failNote' ? { key: args[1], text: args[2] } : undefined }));
        return original(...args);
      };
    }
    const state = () => wire({ mana: a.mana, life: a.life, useLock: a.useLock, lastActedAt: w.localSeat.lastActedAt,
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
    return { name: course.name, skill: course.skill, seatPress: course.seatPress ?? true, steps };
  } finally { restore(); }
}
const result = { status: 'Investigation only; not an accepted baseline.',
  scope: 'Original useSkill calls through preflight and real redirect/cast-start paths. Explicit body/resource/attribute state and one synthetic mimic+conversion definition establish precedence. No completed delivery, input device or rendering claim.', courses: courses.map(run) };
fs.writeFileSync(process.argv[2], JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ courses: result.courses.length, transitions: result.courses.reduce((n, c) => n + c.steps.length, 0) }));
