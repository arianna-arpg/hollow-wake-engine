import {vocationUnlockKey} from './vocation-keys.js';
export {vocationUnlockKey};

/** Character and account state are borrowed for the duration of a grant. */
export interface VocationGrantCharacter {
  readonly vocations: {readonly length: number; includes(id: string): boolean; push(id: string): unknown};
  readonly allocated: {add(id: string): unknown};
}
export interface VocationGrantPorts<Seat, Definition> {
  definition(id: string): Definition | null | undefined;
  character(seat: Seat): VocationGrantCharacter;
  maxPerCharacter(): number;
  runLedger(): Record<string, number | undefined>;
  accountWritesAllowed(): boolean;
  accountLedger(): Record<string, number | undefined>;
  markAccountDirty(): void;
  recalculate(seat: Seat): void;
  markCharacterDirty(seat: Seat): void;
  announceGrant(seat: Seat, definition: Definition): void;
  announceTree(seat: Seat): void;
}

import {takeVocation} from './character-vocation.js';
export {vocationRootId,takeVocation} from './character-vocation.js';

/** A repeated grant is refused after the first character write, even during
 * a synchronous callback. Earlier grants remain visible if a later port fails. */
export function grantVocation<Seat, Definition>(
  id: string, seat: Seat, ports: VocationGrantPorts<Seat, Definition>,
): boolean {
  const definition = ports.definition(id);
  if (definition == null) return false;
  const character = ports.character(seat);
  if (!takeVocation(id,character,()=>ports.maxPerCharacter())) return false;
  const key = vocationUnlockKey(id), run = ports.runLedger();
  run[key] = (run[key] ?? 0) + 1;
  if (ports.accountWritesAllowed()) {
    ports.accountLedger()[key] = 1;
    ports.markAccountDirty();
  }
  ports.recalculate(seat);
  ports.markCharacterDirty(seat);
  ports.announceGrant(seat, definition);
  ports.announceTree(seat);
  return true;
}
