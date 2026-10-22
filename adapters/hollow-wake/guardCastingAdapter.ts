import {GuardCasting, type GuardCastingPorts} from '@hollow-wake/engine/casting/guard';
import {BASH_CFG, TRIGGER_CFG, guardBashSpec, grantedTags, instanceMods, skillContextTags, type GuardBashSpec} from './skills';
import type {Actor, CastingState} from './actor';

type Context = {tags: ReturnType<typeof skillContextTags>; extra: ReturnType<typeof instanceMods>};
type Ports = GuardCastingPorts<Actor, CastingState, GuardBashSpec, Context>;
type Effects = Pick<Ports, 'seated' | 'aim' | 'supports' | 'trigger' | 'pulse' | 'time'
  | 'lower' | 'stampCooldown' | 'deliverBash'>;

/** One World binding. The live bash context is captured once per refresh;
 * no effect sink retains this reusable context container. */
export function createGuardCasting(effects: Effects): GuardCasting<Actor, CastingState, GuardBashSpec, Context> {
  const context: Context = {tags: new Set(), extra: []};
  return new GuardCasting<Actor, CastingState, GuardBashSpec, Context>({
    ...effects,
    spec: state => state.inst.def.guard!,
    holdBonus: (actor, state) => actor.sheet.get('guardHoldTime', skillContextTags(state.inst), instanceMods(state.inst)),
    bash: state => guardBashSpec(state.inst),
    context: state => {
      context.tags = skillContextTags(state.inst.def, grantedTags(state.inst));
      context.extra = instanceMods(state.inst);
      return context;
    },
    bashStat: (actor, terms, key) => actor.sheet.get(key, terms.tags, terms.extra),
    dead: actor => actor.dead,
    facing: actor => actor.facing,
    plantUntil: (actor, deadline) => { actor.aiPlantUntil = Math.max(actor.aiPlantUntil, deadline); },
    end: (actor, _state, recovery) => { actor.casting = null; actor.useLock = recovery; },
    cleanup: (actor, state) => { if (actor.shellGuard?.fromAura === state.inst.def.id) actor.shellGuard = undefined; },
    cooldown: state => state.inst.def.cooldown,
  }, {beatInterval: TRIGGER_CFG.guardInterval, releaseFloor: BASH_CFG.releaseFloor, armTime: BASH_CFG.armTime});
}
