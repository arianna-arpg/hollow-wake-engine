import { StatRules, StatSheet } from '@hollow-wake/engine';
import { BuffRuntime } from '@hollow-wake/engine/combat/buffs';
import { compileBuffDefinition } from '@hollow-wake/engine/combat/buff-content';

/** No game objects: the caller owns time, actor state and presentation. */
export function buffEncounter() {
  const rules = new StatRules({ life: { base: 100 } });
  const owner = { buffs: new Map(), gainEvents: [], sheet: new StatSheet(rules) };
  const cues = [], stages = [];
  const buffs = new BuffRuntime({
    publish(actor, id, mods) { actor.sheet.setSource(id, mods); },
    removeSource(actor, id) { actor.sheet.removeSource(id); },
    release(_actor, _definition, id, count) { cues.push({ id, count }); },
  });
  const definition = compileBuffDefinition({
    type: 'buff', id: 'endurance', duration: 4, maxStacks: 4,
    stackTimers: 'independent', stacksOnApply: 2,
    consumeOn: { on: 'hit', tags: ['melee'] },
    mods: [{ stat: 'life', kind: 'flat', value: 10 }],
  }, rules);
  const take = () => stages.push({ life: owner.sheet.get('life'), stacks: owner.buffs.get('endurance')?.stacks ?? 0,
    clocks: [...(owner.buffs.get('endurance')?.expiries ?? [])] });
  buffs.grant(owner, definition); take();
  buffs.advance(owner, 1);
  buffs.grant(owner, definition, 2); take();
  buffs.spend(owner, 'hit', ['melee']); take();
  buffs.advance(owner, 3); take();
  buffs.advance(owner, 5); take();
  return { stages, gains: owner.gainEvents.length, cues };
}
