import {CharacterWorldAdapter, type CharacterWorldAdapterOptions} from '../../src/character-world-adapter.js';
import type {DurableCharacterOwner} from '../../src/durable-character-located-owner.js';
declare const options: CharacterWorldAdapterOptions<number, {key: string}, {token: number}>;
declare const adapter: CharacterWorldAdapter<number, {key: string}, {token: number}>;
declare const owner: DurableCharacterOwner<{token: number}>;
const opened: Promise<CharacterWorldAdapter<number, {key: string}, {token: number}>> = CharacterWorldAdapter.open(options);
adapter.update(offer => {offer(0, {key: 'hero'});});
// @ts-expect-error Async eligibility can outlive its permission frame.
adapter.update(async offer => {offer(0, {key: 'hero'});});
// @ts-expect-error Handles belong to this host representation.
adapter.update(offer => {offer({}, {key: 'hero'});});
// @ts-expect-error Seats retain their own host type.
adapter.update(offer => {offer(0, 'hero');});
// @ts-expect-error A lifetime observation cannot await another frame.
CharacterWorldAdapter.open({...options, isCurrent: async () => true});
// @ts-expect-error Restoration must finish before the binding becomes usable.
CharacterWorldAdapter.open({...options, restore: async () => {}});
// @ts-expect-error Public opening requires the owned lifecycle, not a borrowed object.
CharacterWorldAdapter.open({...options, createOwner: () => owner});
// @ts-expect-error Construction must pass through complete asynchronous opening.
new CharacterWorldAdapter(options);
void opened;
