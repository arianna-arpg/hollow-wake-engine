// Unaccepted original observations. This helper never imports the SDK.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { bootSimEngine, makeSimWorld } from '../src/sim/arena';
import { seedGlobalRandom } from '../src/sim/rng';
import { makeSkillInstance, effectiveSkillLevel, registerConvertRule } from '../src/engine/skills';
import { castMatches, castSealShuts, castSealIssues, registerCastLaw, castLawKnown, castLawIds, type CastSealSpec } from '../src/engine/castseal';
import { SKILLS } from '../src/data/skills';
import { SUPPORTS } from '../src/data/supports';
import { ATTRIBUTE_IDS, mod } from '../src/engine/stats';

bootSimEngine();
const wire = (value: any): any => JSON.parse(JSON.stringify(value));
type Setup = (w: any, a: any, inst: any) => void;
type Course = { name: string; skill: string; setup?: Setup; rounds?: Setup[]; seatless?: boolean };
let calls: any[] = [];
let liveLaw = false;
registerCastLaw('intent:no', () => { calls.push('law:no'); return false; });
registerCastLaw('intent:yes', () => { calls.push('law:yes'); return true; });
registerCastLaw('intent:live', ctx => { calls.push({ law: 'live', seated: ctx.seated }); return liveLaw; });
registerConvertRule('intent:yes', () => { calls.push('convert:yes'); return true; });
registerConvertRule('intent:no', () => { calls.push('convert:no'); return false; });

const courses: Course[] = [
  { name: 'plain-unaffordable-hud', skill: 'ruin', setup: (_w, a) => { a.mana = 0; a.es = 0; } },
  { name: 'plain-busy-hud', skill: 'ruin', setup: (_w, a) => { a.useLock = 1; } },
  { name: 'sealed-seat', skill: 'ruin', setup: w => { w.zone = { ...w.zone, castSeal: {} }; } },
  { name: 'sealed-seatless-all', skill: 'ruin', seatless: true, setup: w => { w.zone = { ...w.zone, castSeal: {} }; } },
  { name: 'unsealed-seatless', skill: 'ruin', seatless: true, setup: w => { w.zone = { ...w.zone, castSeal: { binds: 'seats' } }; } },
  { name: 'live-law', skill: 'ruin', setup: w => { liveLaw = false; w.zone = { ...w.zone, castSeal: { open: { laws: ['intent:live'] } } }; }, rounds: [() => { liveLaw = true; }, () => { liveLaw = false; }] },
  { name: 'known-low-attributes', skill: 'firebolt', setup: w => { for (const id of ATTRIBUTE_IDS) w.localSeat.meta.attrs[id] = 0; } },
  { name: 'unknown-exempts-attributes', skill: 'firebolt', setup: w => { for (const id of ATTRIBUTE_IDS) w.localSeat.meta.attrs[id] = 0; w.localSeat.meta.knownSkills.clear(); } },
  { name: 'dev-gift-exempts-attributes', skill: 'firebolt', setup: (w, _a, inst) => { for (const id of ATTRIBUTE_IDS) w.localSeat.meta.attrs[id] = 0; inst.devGift = true; } },
  { name: 'active-aura-exempts-attributes', skill: 'firebolt', setup: (w, a, inst) => { for (const id of ATTRIBUTE_IDS) w.localSeat.meta.attrs[id] = 0; a.activeAuras.set(inst.def.id, {}); } },
  { name: 'active-strobe-exempts-attributes', skill: 'firebolt', setup: (w, a, inst) => { for (const id of ATTRIBUTE_IDS) w.localSeat.meta.attrs[id] = 0; a.strobes.set(inst.def.id, {}); } },
  { name: 'local-dev-attribute-exemption', skill: 'firebolt', setup: w => { for (const id of ATTRIBUTE_IDS) w.localSeat.meta.attrs[id] = 0; w.devIgnoreSkillAttributes = true; } },
  { name: 'client-hook-restores-attribute-gate', skill: 'firebolt', setup: w => { for (const id of ATTRIBUTE_IDS) w.localSeat.meta.attrs[id] = 0; w.devIgnoreSkillAttributes = true; w.clientActionHook = () => {}; } },
  { name: 'trigger-armed-and-disarmed', skill: 'firebolt', setup: (_w, _a, inst) => { inst.sockets[0] = { def: SUPPORTS.cast_on_crit, level: 1 }; }, rounds: [(_w, _a, inst) => { inst.state = { triggerOff: true }; }] },
  { name: 'empty-gun-query-creates-bank-and-reload', skill: 'scattergun' },
  { name: 'loaded-gun-and-later-empty', skill: 'scattergun', setup: (_w, a, inst) => { a.skillChargeBank(inst).count = 2; }, rounds: [(_w, a, inst) => { a.skillChargeBank(inst).count = 0; }] },
  { name: 'unknown-conversion-target', skill: 'ruin', setup: (_w, _a, inst) => { inst.def = { ...inst.def, convert: { when: 'intent:yes', skillId: 'intent:missing' } }; } },
  { name: 'false-conversion-rule', skill: 'ruin', setup: (_w, _a, inst) => { inst.def = { ...inst.def, convert: { when: 'intent:no', skillId: 'firebolt' } }; } },
  { name: 'conversion-reuses-mint-and-shares-new-sockets', skill: 'ruin', setup: (_w, _a, inst) => { inst.def = { ...inst.def, convert: { when: 'intent:yes', skillId: 'firebolt' } }; }, rounds: [(_w, _a, inst) => { inst.sockets = [{ def: SUPPORTS.swift_hands, level: 1 }]; }] },
  { name: 'mimic-empty', skill: 'mimicry' },
  { name: 'mimic-unknown-art', skill: 'mimicry', setup: (_w, a) => { a.mimicBank = [{ sid: 'intent:missing', src: 'zombie', at: 0 }]; } },
  { name: 'mimic-selects-newest-and-reuses-mint', skill: 'mimicry', setup: (_w, a) => { a.mimicBank = [{ sid: 'firebolt', src: 'zombie', at: 0 }, { sid: 'ruin', src: 'zombie', at: 0 }]; }, rounds: [(_w, a) => { a.mimicSel = 'firebolt'; }] },
  { name: 'mimic-before-conversion-in-queries', skill: 'mimicry', setup: (_w, a, inst) => { a.mimicBank = [{ sid: 'ruin', src: 'zombie', at: 0 }]; inst.def = { ...inst.def, convert: { when: 'intent:yes', skillId: 'firebolt' } }; } },
  { name: 'combo-query-lazily-creates-cursor', skill: 'trisect' },
  { name: 'combo-fresh-at-window-and-expired', skill: 'trisect', setup: (w, _a, inst) => { inst.state = { comboIdx: 1, comboAt: w.time }; }, rounds: [w => { w.time += 2; }, w => { w.time += 0.0001; }] },
  { name: 'combo-repeated-step-and-finisher', skill: 'one_two', setup: (w, _a, inst) => { inst.state = { comboIdx: 1, comboAt: w.time }; }, rounds: [(w, _a, inst) => { inst.state = { comboIdx: 2, comboAt: w.time }; }] },
  { name: 'combo-invalid-index', skill: 'trisect', setup: (w, _a, inst) => { inst.state = { comboIdx: 99, comboAt: w.time }; } },
  { name: 'combo-level-and-shared-payload', skill: 'trisect', setup: (w, _a, inst) => { inst.state = { comboIdx: 1, comboAt: w.time }; inst.bonusLevels = 1.9; }, rounds: [(_w, _a, inst) => { inst.bonusLevels = 2.1; inst.sockets = [{ def: SUPPORTS.swift_hands, level: 1 }]; }] },
  { name: 'borrowed-construct-combo-cursor', skill: 'trisect', setup: (w, a, inst) => { a.construct = {}; a.skills = []; inst.state = { comboIdx: 2, comboAt: w.time }; Object.assign(w.comboCursorOf(a, inst), { comboIdx: 1, comboAt: w.time }); } },
];

function capture(course: Course, index: number) {
  const restore = seedGlobalRandom(311000 + index);
  try {
    const w = makeSimWorld('warrior', 311000 + index), a = course.seatless ? w.createMonster('zombie', 1, 'enemy') : w.player;
    const aw: any = w;
    for (const id of ATTRIBUTE_IDS) w.localSeat.meta.baseAttrs[id] = 40;
    w.recalcSeat(w.localSeat);
    aw.walk = null;
    w.actors = [w.player];
    if (course.seatless) w.actors.push(a);
    a.sheet.setSource('intent-investigation', [mod('life', 'override', 1000), mod('mana', 'override', 1000), mod('energyShield', 'override', 0)]);
    a.fillResources(); a.useLock = 0; a.cooldowns.clear(); a.casting = null;
    assert(SKILLS[course.skill], course.skill);
    const inst = makeSkillInstance(SKILLS[course.skill], 1, 3);
    a.skills = [inst];
    w.localSeat.meta.knownSkills.set(inst.def.id, inst);
    const identities = new WeakMap<object, number>(); let next = 1;
    const ident = (o: any) => { if (!o || typeof o !== 'object') return null; if (!identities.has(o)) identities.set(o, next++); return identities.get(o); };
    const record = (i: any) => ({ ref: ident(i), id: i.def.id, level: i.level, effectiveLevel: effectiveSkillLevel(i), hostSkillId: i.hostSkillId, chainOf: i.chainOf,
      sockets: ident(i.sockets), grafts: ident(i.grafts), stateRef: ident(i.state), state: i.state, extraMods: i.extraMods, comboTreeMods: i.comboTreeMods });
    const state = () => wire({ inst: record(inst), meta: [...a.metaInsts].map(([key, i]) => ({ key, ...record(i) })), banks: [...a.skillChargeState],
      mana: a.mana, life: a.life, useLock: a.useLock, mimicSel: a.mimicSel, mimicBank: a.mimicBank, time: w.time });
    for (const name of ['castSealed', 'castReqRefusal', 'reqShortfall', 'resolveTargeting', 'mintMetaInstance', 'comboCursorOf', 'comboStepOf']) {
      const original = aw[name].bind(w);
      aw[name] = (...args: any[]) => { calls.push({ method: name, skill: args[1]?.def?.id, value: typeof args[0] === 'string' ? args[0] : undefined }); return original(...args); };
    }
    const actorStack: string[] = [];
    for (const name of ['canUse', 'gatesMet', 'skillChargeBank'] as const) {
      const actor: any = a, original = actor[name].bind(a);
      actor[name] = (...args: any[]) => {
        // M30 moved this internal forwarder into the policy. Keep direct HUD gates visible.
        if (!(name === 'gatesMet' && actorStack.includes('canUse'))) calls.push({ method: name, skill: args[0]?.def?.id });
        actorStack.push(name); try { return original(...args); } finally { actorStack.pop(); }
      };
    }
    course.setup?.(w, a, inst);
    const initial = state(), steps: any[] = [];
    for (const [round, change] of [undefined, ...(course.rounds ?? [])].entries()) {
      change?.(w, a, inst);
      for (const method of ['castSealed', 'castReqRefusal', 'skillUsable', 'slotFaceOf', 'pressUsable']) {
        calls = [];
        const before = state(); const result = aw[method](a, inst);
        const value = method === 'castSealed' ? { sealed: result !== null, originalSealIdentity: result !== null && result === w.zone.castSeal }
          : method === 'slotFaceOf' ? { id: result.id, originalDefIdentity: result === SKILLS[result.id] || result === inst.def } : result ?? null;
        steps.push(wire({ round, method, before, result: value, after: state(), calls }));
      }
    }
    if (course.name === 'plain-unaffordable-hud') {
      assert.equal(steps.find(s => s.method === 'skillUsable').result, true);
      assert.equal(steps.find(s => s.method === 'pressUsable').result, false);
    }
    if (course.name === 'known-low-attributes') assert.match(steps.find(s => s.method === 'castReqRefusal').result, /^needs /);
    if (course.name === 'mimic-before-conversion-in-queries') assert.equal(steps.find(s => s.method === 'slotFaceOf').result.id, 'ruin');
    return { name: course.name, skill: course.skill, seatless: !!course.seatless, initial, steps };
  } finally { restore(); }
}

function seals() {
  const restore = seedGlobalRandom(311999);
  try {
    const world = makeSimWorld('warrior', 311999), caster = world.player, inst = makeSkillInstance(SKILLS.ruin, 1);
    inst.hostSkillId = 'life_flask';
    const specs: CastSealSpec[] = [{}, { mode: 'open' }, { binds: 'seats' }, { open: { ids: ['ruin'] } }, { open: { ids: ['life_flask'] } },
      { open: { ids: ['missing'] } }, { open: { tags: ['spell'] } }, { open: { tags: ['attack'] } }, { open: { laws: ['reflex'] } },
      { open: { laws: ['missing', 'intent:no', 'intent:yes', 'intent:no'] } }, { open: { ids: ['ruin'], laws: ['intent:no'] } },
      { open: { tags: ['spell'], laws: ['intent:no'] } }, { open: { laws: ['intent:yes'] }, shut: { ids: ['ruin'] } },
      { mode: 'open', shut: { laws: ['intent:yes'] } }, { open: {}, shut: {} }, { open: { ids: ['missing', 'missing'], laws: ['missing', 'missing'] } }];
    const rows: any[] = [];
    for (const seated of [false, true]) for (const spec of specs) {
      const ctx = { world, caster, inst, seated }; calls = [];
      const shut = castSealShuts(spec, ctx); const foldCalls = wire(calls); calls = [];
      const matches = castMatches(spec.open, ctx); const matchCalls = wire(calls);
      rows.push({ seated, spec, shut, matches, foldCalls, matchCalls, issues: castSealIssues(spec, id => !!SKILLS[id]) });
    }
    const orderBefore = castLawIds();
    registerCastLaw('intent:no', () => true);
    const replacement = { known: castLawKnown('intent:no'), unknown: castLawKnown('intent:missing'), orderRetained: JSON.stringify(castLawIds()) === JSON.stringify(orderBefore),
      replaced: castMatches({ laws: ['intent:no'] }, { world, caster, inst, seated: true }) };
    assert.equal(rows.length, 32); assert(replacement.replaced && replacement.orderRetained);
    return { rows, replacement };
  } finally { restore(); }
}

const result = { status: 'Investigation only; not an accepted baseline.',
  scope: 'Original World readiness/face/attribute methods and cast-seal fold. Explicit synthetic definition combinations test precedence; real cached instances and original call ordering retained. Query observations do not establish actual useSkill authority, delivery, UI or device behavior.',
  courses: courses.map(capture), seals: seals() };
fs.writeFileSync(process.argv[2], JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ courses: result.courses.length, transitions: result.courses.reduce((n, c) => n + c.steps.length, 0), sealRows: result.seals.rows.length }));
