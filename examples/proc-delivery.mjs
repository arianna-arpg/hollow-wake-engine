import {StatSheet} from '@hollow-wake/engine';
import {ProcRuntime} from '@hollow-wake/engine/combat/procs';
import {createProcDelivery} from '@hollow-wake/engine/combat/proc-delivery';
import {applyWardEffect, gainWard} from '@hollow-wake/engine/combat/effects';

/** A host with one equipped talent, Desperate Ward. Share the loaded
 * ProcContent and StatRules across actors. The host receives cues as they occur.
 * Simulation time, randomness and the actor are private to each session. */
export function createWardExample(content, rules, {random, onCue}) {
  const definition = content.definition('desperate_ward');
  if (definition?.effect.type !== 'ward' || definition.trigger !== 'condition')
    throw new Error('The content pack must contain the Desperate Ward condition proc');

  const sheet = new StatSheet(rules);
  sheet.setBase('proc_' + definition.id, 1);
  const actor = {
    dead: false, ward: 0, maxLife: 100, buffs: new Map(), statuses: [],
    procReadyAt: new Map(), procAttemptAt: new Map(), procFiredAt: new Map(),
  };
  let time = 0;
  const gain = {rate: () => 1};
  const ward = {maximumLife: a => a.maxLife, gain: (a, amount) => gainWard(a, amount, gain)};
  const delivery = createProcDelivery({
    stat: (_actor, id) => sheet.get(id),
    ward: (a, effect) => applyWardEffect(a, effect, ward),
    cue: (a, style, phase, id) => onCue({time, phase, id, color: style.color, ward: a.ward}),
    riders: (...args) => runtime.riders(...args),
  });
  const unsupported = () => { throw new Error('Unexpected service in the Desperate Ward example'); };
  const runtime = new ProcRuntime(content, {
    time: () => time, random, stat: (_actor, id, tags, extra) => sheet.get(id, tags, extra),
    armed: (_actor, ids, extra) => sheet.armedFamily('proc_', ids, extra),
    condition: (_actor, id) => sheet.hasCondition(id),
    execute: delivery.execute,
    tags: unsupported, extra: unsupported, carryTags: unsupported, carryCourt: unsupported,
    victim: unsupported, castRider: unsupported, bankStatus: unsupported, lastGasp: unsupported,
  });
  return {
    get time() { return time; },
    lowLife(at) {
      if (!Number.isFinite(at) || at < time) throw new RangeError('Simulation time must advance monotonically');
      time = at;
      runtime.own(actor, 'condition', {condition: 'lowLife'});
      return actor.ward;
    },
  };
}
