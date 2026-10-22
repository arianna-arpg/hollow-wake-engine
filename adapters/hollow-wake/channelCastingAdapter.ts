import {ChannelCasting, type ChannelCastingPorts} from '@hollow-wake/engine/casting/channel';
import {instanceChannel, instanceMods, skillContextTags, TRIGGER_CFG} from './skills';
import type {Actor, CastingState} from './actor';

type Context = {tags: ReturnType<typeof skillContextTags>; extra: ReturnType<typeof instanceMods>};
type Ports<T> = ChannelCastingPorts<Actor, CastingState, T, Context>;
type Effects<T> = Pick<Ports<T>, 'trigger' | 'tapFinish' | 'rune' | 'aim' | 'releaseEffects'
  | 'release' | 'persist' | 'supports' | 'target' | 'pay' | 'pulse' | 'cue'>;

/** One World binding. Scratch context is reused only inside a non-reentrant
 * update; the original modifier list is captured before payment and its stat
 * values remain live afterward. It is never retained by an effect sink. */
export function createChannelCasting<T>(effects: Effects<T>): ChannelCasting<Actor, CastingState, T, Context> {
  const context: Context = {tags: new Set(), extra: []};
  return new ChannelCasting<Actor, CastingState, T, Context>({
    ...effects,
    spec: state => state.gather ?? instanceChannel(state.inst)!,
    dead: actor => actor.dead,
    stat: (actor, state, key) => actor.sheet.get(key, skillContextTags(state.inst.def), instanceMods(state.inst)),
    speed: (actor, state) => actor.speedFactor(state.inst),
    brim: (actor, state, spec) => {
      const map = actor.brims ??= new Map();
      let bank = map.get(state.inst.def.id);
      if (!bank) { bank = {fill: 0, inst: state.inst, spec}; map.set(state.inst.def.id, bank); }
      bank.inst = state.inst; bank.spec = spec;
      return bank;
    },
    releaseBrim: (actor, state) => actor.brims?.get(state.inst.def.id),
    end: (actor, _state, recovery) => { actor.casting = null; actor.useLock = recovery; },
    cooldown: state => state.inst.def.cooldown,
    stampCooldown: (actor, state, duration) => { actor.cooldowns.set(state.inst.def.id, duration); },
    context: state => { context.tags = skillContextTags(state.inst.def); context.extra = instanceMods(state.inst); return context; },
    cost: (actor, state) => actor.skillCost(state.inst),
    canAfford: (actor, cost) => actor.canAfford(cost),
    random: () => Math.random(),
    pulseStat: (actor, terms, key) => actor.sheet.get(key, terms.tags, terms.extra),
    construct: actor => !!actor.construct,
  }, TRIGGER_CFG.channelInterval);
}
