// Game-owned bridge: ambient defaults and mutable authoring registries stay here.
import {ItemContent, type ItemRulePack} from '@hollow-wake/engine/items';
import {createItemHost, type ItemHost} from '@hollow-wake/engine/items/host';
import {ITEM_BASES} from '../data/itembases';
import {ITEM_AFFIXES} from '../data/itemaffixes';
import {UNIQUES} from '../data/uniques';
import {VESTIGES, EPITAPH_LIST} from '../data/vestiges';
import {RELIQUARY_CFG, RELIC_SCALABLE} from '../data/reliquary';
import {DEFENSE_KINDS, ITEM_CFG, isCarriableCategory, type ItemInstance} from './items';
import type {RollItemOpts, ForgeItemOpts} from './itemgen';
import type {Modifier} from './stats';

let revision=0;
let cached: {allocate:()=>number;host:ItemHost}|undefined;

/** Call after a deliberate item-content edit, before recalculating affected equipment.
 * The next command validates a fresh immutable snapshot; RNG and identity stay with the game.
 */
export function refreshSdkItemContent(): void { revision++; cached=undefined; }

function host(allocate:()=>number): ItemHost {
  if(cached?.allocate===allocate) return cached.host;
  const pack:ItemRulePack={
    schemaVersion:1, capability:'item-rules/v1', id:`hollow-wake:live-items:${revision}`,
    bases:ITEM_BASES,affixes:ITEM_AFFIXES,uniques:UNIQUES,vestiges:VESTIGES,epitaphs:EPITAPH_LIST,
    defenseKinds:DEFENSE_KINDS,config:ITEM_CFG,
    carriableCategories:[...new Set(Object.values(ITEM_BASES).filter(b=>isCarriableCategory(b.category)).map(b=>b.category))],
    relic:{baseline:RELIQUARY_CFG.baseline,scalable:Object.fromEntries(Object.entries(RELIC_SCALABLE).map(([id,cap])=>[id,cap===Infinity?null:cap]))},
  };
  const value=createItemHost(new ItemContent(pack),allocate);
  cached={allocate,host:value};return value;
}

export function rollThroughSdk(options:RollItemOpts,allocate:()=>number):ItemInstance|null {
  const {rng,...data}=options;
  return host(allocate).roll(data,rng??Math.random) as ItemInstance|null;
}
export function forgeThroughSdk(options:ForgeItemOpts,allocate:()=>number):ItemInstance|null {
  const {rng,...data}=options;
  return host(allocate).forge(data,rng??Math.random) as ItemInstance|null;
}
export function compileThroughSdk(item:ItemInstance,allocate:()=>number):Modifier[] {
  return host(allocate).compile(item) as Modifier[];
}
