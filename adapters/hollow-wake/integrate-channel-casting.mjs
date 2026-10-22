import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {root, sha256} from '../../scripts/reference-utils.mjs';
export const channelCastFile = 'src/engine/world.ts', channelCastBridge = 'src/engine/channelCastingAdapter.ts';
const lf = s => s.replaceAll('\r\n', '\n');
const parse = s => ts.createSourceFile(channelCastFile, s, ts.ScriptTarget.Latest, true);
function method(ast, name) {
  const cls = ast.statements.find(n => ts.isClassDeclaration(n) && n.name?.text === 'World'); assert(cls);
  const nodes = cls.members.filter(n => ts.isMethodDeclaration(n) && n.name.getText(ast) === name);
  assert.equal(nodes.length, 1, name); return nodes[0];
}
function channel(ast) {
  return method(ast, 'updateCasting').body.statements.find(ts.isSwitchStatement).caseBlock.clauses
    .find(n => ts.isCaseClause(n) && n.expression.text === 'channel');
}
function between(text, start, end) {
  assert.equal(text.split(start).length, 2, start); assert.equal(text.split(end).length, 2, end);
  const from = text.indexOf(start), to = text.indexOf(end); assert(from < to);
  return text.slice(from, to);
}
export function renderChannelCasting(source, reference) {
  const current = lf(source), original = lf(reference), ast = parse(current), base = parse(original), edits = [];
  assert(!current.includes('sdkChannelCasting'), 'Channel casting already integrated');
  const clause = channel(ast), old = channel(base); assert(clause && old);
  const text = clause.getText(ast); assert.equal(text, old.getText(base), 'Unreviewed channel case');
  const aim = between(text, '        const track =', '        if (!cs.held || a.dead)');
  const releaseEffects = between(text, '          // MINE-CHANNEL', '          // RELEASE payload');
  edits.push({start: clause.getStart(ast), end: clause.end,
    text: "case 'channel': { this.sdkChannelCasting().advance(a, cs, dt, targetInfo); break; }"});
  const persist = method(ast, 'updatePendingPersists'), originalPersist = method(base, 'updatePendingPersists');
  assert.equal(persist.getText(ast), originalPersist.getText(base), 'Unreviewed persistent channel phase');
  const persistenceBefore = between(persist.getText(ast), '      pp.remaining -= dt;', '      this.executeSkill(pp.caster');
  const offset = persist.getStart(ast) + persist.getText(ast).indexOf(persistenceBefore);
  edits.push({start: offset, end: offset + persistenceBefore.length, text: `      const power = advanceChannelPersistence(pp, dt, pp.caster.dead);
      if (power === null) { this.pendingPersists.splice(i, 1); continue; }
      if (power === undefined) continue;
`});
  const power = 'dmgMult: pp.powerMult * decay'; assert.equal(persist.getText(ast).split(power).length, 2);
  const powerAt = persist.getStart(ast) + persist.getText(ast).indexOf(power);
  edits.push({start: powerAt, end: powerAt + power.length, text: 'dmgMult: power'});
  const use = method(ast, 'useSkill'), useText = use.getText(ast);
  for (const [before, after] of [
    ['Math.max(0.1, chSpec.interval / caster.speedFactor(inst))', 'channelInterval(chSpec.interval, caster.speedFactor(inst))'],
    ['Math.max(0, chSpec.windup / caster.speedFactor(inst))', 'channelWindup(chSpec.windup, caster.speedFactor(inst))'],
  ]) {
    assert.equal(useText.split(before).length, 2, 'Changed channel duration expression'); assert(method(base, 'useSkill').getText(base).includes(before));
    const start = use.getStart(ast) + useText.indexOf(before); edits.push({start, end: start + before.length, text: after});
  }
  const update = method(ast, 'updateCasting');
  edits.push({start: update.end, end: update.end, text: `

  private sdkChannelCastingRuntime?: ReturnType<typeof createChannelCasting<ResolvedTarget>>;
  private sdkChannelCasting(): ReturnType<typeof createChannelCasting<ResolvedTarget>> {
    return this.sdkChannelCastingRuntime ??= createChannelCasting<ResolvedTarget>({
      trigger: (a, cs, event) => this.rollTriggers(a, event,
        {aim: vec(cs.aim.x, cs.aim.y), sourceInst: cs.inst}),
      tapFinish: a => this.tapCharges(a, 'channelFinish'),
      rune: (a, cs) => this.bankRune(a, cs.inst.def),
      aim: (a, cs, ch, dt) => {
        const def = cs.inst.def;
${aim}        return track;
      },
      releaseEffects: (a, cs, ch) => {
        const def = cs.inst.def;
${releaseEffects}      },
      release: (a, cs, track, payload, initialTarget) => this.executeSkill(a, cs.inst,
        track ? cs.aim : (cs.lockedAim ?? cs.aim), {
          dmgMult: payload.dmgMult, aoeMult: payload.aoeMult, keepFacing: true,
          targetInfo: initialTarget, noCooldown: payload.noCooldown,
        }),
      persist: (a, cs, plan) => this.pendingPersists.push({caster: a, inst: cs.inst, ...plan}),
      supports: (a, cs, dt) => this.tickChannelSupports(a, cs, dt),
      target: (a, cs) => instanceTargeting(cs.inst) ? this.resolveTargeting(a, cs.inst, cs.aim) ?? null : undefined,
      pay: (a, cs, cost) => this.paySkillCost(a, cs.inst, cost),
      pulse: (a, cs, track, target, payload) => this.executeSkill(a, cs.inst,
        track ? cs.aim : (cs.lockedAim ?? cs.aim), {
          dmgMult: payload.dmgMult, aoeMult: payload.aoeMult, arcMult: payload.arcMult,
          noCooldown: true, keepFacing: true, bonusProjectiles: payload.bonusProjectiles,
          targetInfo: target, paidCost: payload.paidCost,
        }),
      cue: (a, cs, kind) => {
        if (kind === 'gather') {
          this.flashes.push({pos: vec(a.pos.x, a.pos.y),
            radius: 16 + 30 * Math.min(1, (cs.channelTime ?? 0) / 4), color: cs.inst.def.color,
            life: .15, maxLife: .15});
        } else {
          const cue = castingEventFlash(a, cs, kind);
          if (cue) this.flashes.push(cue);
        }
      },
    });
  }`});
  const last = ast.statements.filter(ts.isImportDeclaration).at(-1).end, line = current.indexOf('\n', last), at = line < 0 ? current.length : line;
  edits.push({start: at, end: at, text: "\nimport {createChannelCasting} from './channelCastingAdapter';\nimport {channelInterval, channelWindup, advanceChannelPersistence} from '@hollow-wake/engine/casting/channel';"});
  let output = current;
  for (const e of edits.sort((a, b) => b.start - a.start)) output = output.slice(0, e.start) + e.text + output.slice(e.end);
  return output;
}

export function integrateChannelCasting(game, write = true) {
  assert(!fs.existsSync(path.join(game, channelCastBridge)), 'Refusing to overwrite channel casting bridge');
  const reference = fs.readFileSync(path.join(root, '.reference', channelCastFile));
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'baseline/source-lock.json'))); assert.equal(sha256(reference), lock.files[channelCastFile]);
  const source = fs.readFileSync(path.join(game, channelCastFile), 'utf8'), after = renderChannelCasting(source, reference.toString());
  if (write) {
    fs.writeFileSync(path.join(game, channelCastFile), after.replaceAll('\n', source.includes('\r\n') ? '\r\n' : '\n'));
    fs.copyFileSync(path.join(root, 'adapters/hollow-wake/channelCastingAdapter.ts'), path.join(game, channelCastBridge));
  }
  return {files: [channelCastFile, channelCastBridge]};
}
