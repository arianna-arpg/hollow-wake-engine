import {HollowWakeSpillPlacement, type HollowWakePlacementHost} from '../../src/character-spill-placement.js';
import type {CharacterDeliveryPort} from '../../src/durable-character-located-owner.js';
declare const host: HollowWakePlacementHost;
const placement = new HollowWakeSpillPlacement(host);
const delivery: CharacterDeliveryPort = placement;
delivery.prepare({groupKey: 'account', state: placement.seed(17), rows: []});
// @ts-expect-error observation must finish during the current world frame
host.observe = async () => ({worldKey: 'world', pos: {x: 0, y: 0}, tier: 0});
// @ts-expect-error collision clamping is synchronous
host.clamp = async (_world, pos) => pos;
// @ts-expect-error pickup authorization is a synchronous boolean
host.canPickup = async () => true;
// @ts-expect-error a position has two explicit numeric coordinates
host.clamp = () => ({x: 0});
// @ts-expect-error the world instance identity is required
host.observe = () => ({pos: {x: 0, y: 0}, tier: 0});
