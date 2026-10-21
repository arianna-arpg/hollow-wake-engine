import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {root, sha256} from '../../scripts/reference-utils.mjs';

export const ammunitionFiles = ['src/engine/actor.ts', 'src/engine/world.ts'];
const lf = source => source.replaceAll('\r\n', '\n');
const parse = (file, source) => ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);

export function renderAmmunition(file, source, reference) {
  assert(ammunitionFiles.includes(file), 'Unknown ammunition adapter file');
  const actor = file === ammunitionFiles[0];
  const current = lf(source), original = lf(reference);
  const ast = parse(file, current), baseline = parse(file, original), edits = [];
  const className = actor ? 'Actor' : 'World';
  const findClass = tree => tree.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === className);
  const cls = findClass(ast), old = findClass(baseline);
  assert(cls && old, 'Missing ammunition host class');
  assert(!/\b(?:sdkAmmo|sdkAmmunition|advanceAmmunition|sdkAmmunitionPress|commitAmmunitionPress|requiresUseCharge)\b/.test(current), 'Ammunition integration or binding collision');
  const method = (tree, owner, name) => {
    const found = owner.members.filter(node => ts.isMethodDeclaration(node) && node.name.getText(tree) === name);
    assert.equal(found.length, 1, name);
    return found[0];
  };
  const replaceMethod = (name, body) => {
    const node = method(ast, cls, name);
    assert.equal(node.getText(ast), method(baseline, old, name).getText(baseline), `Unreviewed ammunition method ${name}`);
    edits.push({start: node.body.pos, end: node.body.end, text: ` { ${body} }`});
  };
  const replaceText = (before, after) => {
    assert.equal(current.split(before).length, 2, 'Changed ammunition expression');
    assert.equal(original.split(before).length, 2, 'Missing original ammunition expression');
    const start = current.indexOf(before);
    edits.push({start, end: start + before.length, text: after});
  };
  const replaceRegion = (startMarker, endMarker, text) => {
    assert.equal(current.split(startMarker).length, 2, 'Changed ammunition phase start');
    assert.equal(original.split(startMarker).length, 2, 'Missing original ammunition phase start');
    const start = current.indexOf(startMarker), end = current.indexOf(endMarker, start);
    const oldStart = original.indexOf(startMarker), oldEnd = original.indexOf(endMarker, oldStart);
    assert(end > start && oldEnd > oldStart, 'Missing ammunition phase end');
    assert.equal(current.slice(start, end), original.slice(oldStart, oldEnd), 'Unreviewed ammunition phase');
    edits.push({start, end, text});
  };
  if (actor) {
    replaceMethod('skillChargeBank', 'return this.sdkAmmunition().bank(inst);');
    replaceMethod('skillChargeCap', 'return this.sdkAmmunition().capacity(inst);');
    replaceMethod('spendSkillCharge', 'this.sdkAmmunition().spendOne(inst);');
    replaceRegion('    // USE-CHARGE recovery (SkillDef.useCharges)', '    // EQUIP MODS (SkillDef.equipMods)', '    this.advanceAmmunition(dt);\n\n');
    replaceText('uc && uc.empower === undefined && !uc.ventAll && this.skillChargeBank(inst).count <= 0', 'requiresUseCharge(uc) && this.skillChargeBank(inst).count <= 0');
    const at = cls.members.at(-1).end;
    edits.push({start: at, end: at, text: `
  private sdkAmmo?: Ammunition<SkillInstance>;
  sdkAmmunition(): Ammunition<SkillInstance> {
    return this.sdkAmmo ??= new Ammunition(this.skillChargeState, {
      spec: instanceUseCharges, skills: () => this.skills,
      capacityBonus: inst => this.sheet.get('skillCharges', skillContextTags(inst), instanceMods(inst)),
      chargeRate: inst => this.sheet.get('skillChargeRate', skillContextTags(inst.def), instanceMods(inst)),
      cooldownRecovery: inst => this.sheet.get('cooldownRecovery', skillContextTags(inst.def), instanceMods(inst)),
      still: () => this.skillBankStill(), cooling: inst => this.cooldowns.has(inst.def.id),
    });
  }
  private advanceAmmunition(dt: number): void {
    if (this.sdkAmmo) { this.sdkAmmo.advance(dt); return; }
    // Most actors have no ammunition. Preserve the original discovery scan
    // without constructing a binding until an equipped bank actually needs it.
    for (const inst of this.skills) {
      if (inst && instanceUseCharges(inst)) { this.sdkAmmunition().advance(dt); return; }
    }
  }
`});
  } else {
    replaceText('!!uc && uc.empower === undefined && !uc.ventAll && caster.skillChargeBank(inst).count <= 0', 'requiresUseCharge(uc) && caster.skillChargeBank(inst).count <= 0');
    replaceRegion('    // USE-CHARGES: the press spends one round off the bank', "    // A committed BASE press arms the combo chain's first step", `    const useCharges = instanceUseCharges(inst);
    const {bankSteps, roundMult, ventRounds} = commitAmmunitionPress(caster, inst, useCharges, this.sdkAmmunitionPress);

`);
    replaceText(`          const bank = caster.skillChargeBank(b);
          const cap = caster.skillChargeCap(b);
          const add = Math.min(cap - bank.count, fx.amount ?? cap);
          if (add <= 0) continue;
          bank.count += add;
          bank.reloading = false; // the hands beat the clock`, '          const add = caster.sdkAmmunition().restore(b, fx.amount);\n          if (add <= 0) continue;');
    const at = cls.members.at(-1).end;
    edits.push({start: at, end: at, text: `
  private readonly sdkAmmunitionPress: AmmunitionPressPorts<Actor,SkillInstance> = {
    bank: (actor, inst) => actor.skillChargeBank(inst), spend: (actor, inst) => actor.spendSkillCharge(inst),
    finalRoundDamage: (actor, inst) => actor.sheet.get('finalRoundDamage', skillContextTags(inst.def), instanceMods(inst)),
    stampCooldown: (actor, inst, time) => this.stampSkillCooldown(actor, inst, time),
  };
`});
  }
  const last = ast.statements.filter(ts.isImportDeclaration).at(-1).end;
  const line = current.indexOf('\n', last), at = line < 0 ? current.length : line;
  const names = actor ? 'Ammunition, requiresUseCharge' : 'commitAmmunitionPress, requiresUseCharge, type AmmunitionPressPorts';
  edits.push({start: at, end: at, text: `\nimport {${names}} from '@hollow-wake/engine/resources/ammunition';`});
  let output = current;
  for (const edit of edits.sort((a, b) => b.start - a.start)) output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  return output;
}

export function integrateAmmunition(game, write = true) {
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'baseline/source-lock.json')));
  const outputs = ammunitionFiles.map(file => {
    const original = fs.readFileSync(path.join(root, '.reference', file));
    assert.equal(sha256(original), lock.files[file]);
    const source = fs.readFileSync(path.join(game, file), 'utf8');
    return {file, source, after: renderAmmunition(file, source, original.toString())};
  });
  if (write) for (const {file, source, after} of outputs) {
    fs.writeFileSync(path.join(game, file), source.includes('\r\n') ? after.replaceAll('\n', '\r\n') : after);
  }
  return {files: [...ammunitionFiles]};
}
