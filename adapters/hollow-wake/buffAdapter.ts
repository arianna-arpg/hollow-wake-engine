import type {BuffPorts} from '@hollow-wake/engine/combat/buffs';
import type {Actor} from './actor';
import type {BuffEffect} from './skills';
import type {Modifier} from './stats';
import {buffProcCue, noteProcCue} from './procCues';

/** Only callbacks are shared. Each Actor lazily owns the runtime and all state.
 * Preserve native cue delivery and observable consumeBuffStacks overrides. */
export const buffPorts = Object.freeze<BuffPorts<Modifier, BuffEffect, Actor>>({
  publish(actor, source, mods) { actor.sheet.setSource(source, mods); return undefined; },
  removeSource(actor, source) { actor.sheet.removeSource(source); return undefined; },
  release(actor, definition, id, count) {
    noteProcCue(actor, buffProcCue(definition), 'release', id, count);
    return undefined;
  },
  consume(actor, id, count) { actor.consumeBuffStacks(id, count); return undefined; },
});
