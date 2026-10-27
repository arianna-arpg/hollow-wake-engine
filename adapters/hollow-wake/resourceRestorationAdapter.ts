import type {ResourceRestorationPorts} from '@hollow-wake/engine/combat/restoration';
import type {Actor} from './actor';
import type {FeedingCueSpec} from '../data/feedingCues';
import {noteRestoreGain} from './feedingCues';

/** One shared callback table. Actors retain every pool, flag and event queue. */
export const resourceRestorationPorts = Object.freeze<ResourceRestorationPorts<Actor, FeedingCueSpec>>({
  maximumShield(actor) { return actor.maxEs(); },
  maximumPoise(actor) { return actor.maxPoise(); },
  maximumMana(actor) { return actor.maxMana(); },
  poiseOvercharge(actor) { return actor.sheet.get('poiseOvercharge'); },
  availableMana(actor) { return actor.availableMaxMana(); },
  // Keep method selection before the amount getter, including custom receivers.
  restoreLife(actor, effect) { return actor.healBy(effect.amount); },
  restoreShield(actor, effect) { return actor.gainEs(effect.amount); },
  restorePoise(actor, effect) { return actor.gainPoise(effect.amount); },
  // Proc amount queries have already completed before these methods are selected.
  gainShield(actor, amount) { return actor.gainEs(amount); },
  gainPoise(actor, amount) { return actor.gainPoise(amount); },
  noteGain(actor, resource, amount, cue) { noteRestoreGain(actor, resource, amount, cue); return undefined; },
});
