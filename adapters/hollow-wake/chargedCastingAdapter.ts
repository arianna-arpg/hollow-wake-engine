import {ChargedCasting, type ChargedCastState, type ChargedCastingPorts} from '@hollow-wake/engine/casting/charged';
import {instanceMods, instanceOvercharge, instanceStrikeTiming, skillContextTags} from './skills';
import type {Actor, CastingState} from './actor';

type State = CastingState & ChargedCastState;
type Effects = Pick<ChargedCastingPorts<Actor, State>, 'pay' | 'stageBanked' | 'execute' | 'cue'>;

/** One World binding; the native cast record and payment/delivery sinks remain live. */
export function createChargedCasting(effects: Effects): ChargedCasting<Actor, State> {
  return new ChargedCasting<Actor, State>({
    active: actor => {
      const state = actor.casting;
      return state?.mode === 'charge' || state?.mode === 'overcharge' ? state as State : null;
    },
    dead: actor => actor.dead,
    chargeSpec: state => state.inst.def.chargeUp!,
    overchargeSpec: state => instanceOvercharge(state.inst)!,
    stageLimit: (actor, state, spec) => actor.sheet.get('overchargeStages',
      skillContextTags(state.inst.def), instanceMods(state.inst), spec.stages),
    timing: state => instanceStrikeTiming(state.inst),
    sparkBonus: (actor, state, spec) => actor.sheet.get('sparkBonus',
      skillContextTags(state.inst.def), instanceMods(state.inst), spec.windowBonus ?? .35),
    cost: (actor, state) => actor.skillCost(state.inst),
    canAfford: (actor, cost) => actor.canAfford(cost),
    pay: (actor, state, cost) => effects.pay(actor, state, cost),
    random: () => Math.random(),
    stageBanked: (actor, state) => effects.stageBanked(actor, state),
    end: (actor, _state, recovery) => { actor.casting = null; actor.useLock = recovery; },
    execute: (actor, state, release) => effects.execute(actor, state, release),
    cue: (actor, state, kind) => effects.cue(actor, state, kind),
  });
}
