import {ResourcePayment} from '@hollow-wake/engine/resources/payment';
import type {Actor, OverdriveState} from './actor';
import {skillContextTags, instanceMods} from './skills';

type Context = {tags: ReturnType<typeof skillContextTags>; mods: ReturnType<typeof instanceMods>};
// Immutable policy only: no shared actor state, context cache or scratch record.
export const resourcePayment = new ResourcePayment<Actor, OverdriveState, Context>({
  maxMana: actor => actor.maxMana(),
  maxLife: actor => actor.maxLife(),
  esToMana: actor => actor.sheet.get('esToMana'),
  spec: loan => loan.inst.def.delivery.type === 'aura' ? loan.inst.def.delivery.overdrive : undefined,
  context: loan => ({tags: skillContextTags(loan.inst.def), mods: instanceMods(loan.inst)}),
  stat: (actor, context, stat, base) => actor.sheet.get(stat, context.tags, context.mods, base),
  attackSpeed: actor => actor.sheet.get('attackSpeed'),
  lifeSpent: (actor, amount) => actor.onLifeSpent?.(amount),
});
