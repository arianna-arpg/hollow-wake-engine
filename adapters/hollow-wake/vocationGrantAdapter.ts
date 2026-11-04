import {vec} from '../core/math';
import {VOCATIONS, VOCATION_CFG, type VocationDef} from '../data/vocations';
import type {World, Seat} from './world';
import type {VocationGrantPorts} from '@hollow-wake/engine/progression/vocations';

export function bindVocationGrants(world: World): VocationGrantPorts<Seat,VocationDef> {
  return {
    definition: id => VOCATIONS[id],
    character: seat => seat.meta,
    maxPerCharacter: () => VOCATION_CFG.maxPerCharacter,
    runLedger: () => world.ledger,
    accountWritesAllowed: () => world.metaProgressionActive(),
    accountLedger: () => world.account.ledger,
    markAccountDirty: () => {world.accountDirty = true;},
    recalculate: seat => world['recalcSeat'](seat),
    markCharacterDirty: seat => world.markMetaDirty(seat),
    announceGrant: (seat, def) => {
      world.text(vec(seat.actor.pos.x, seat.actor.pos.y - 40), `VOCATION: ${def.name}!`, def.color, 24);
    },
    announceTree: seat => {
      world.text(vec(seat.actor.pos.x, seat.actor.pos.y - 12), 'Its tree awakens at the heart of the star (P).', '#d8d4c8', 13);
    },
  };
}
