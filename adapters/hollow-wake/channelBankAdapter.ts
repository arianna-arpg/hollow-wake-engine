import {ChannelBanks} from '@hollow-wake/engine/casting/banks';
import {instanceMods,skillContextTags,type SkillInstance,type BrimSpec} from './skills';
import type {Actor} from './actor';

/** Stateless binding; every map and record remains actor-owned. No clock,
 * mutable scratch context or actor cache is shared by this service. */
export const channelBanks=new ChannelBanks<Actor,SkillInstance,BrimSpec>({
  key:inst=>inst.def.id,
  decayMultiplier:(actor,bank)=>actor.sheet.get('brimDecay',skillContextTags(bank.inst.def),instanceMods(bank.inst)),
});
