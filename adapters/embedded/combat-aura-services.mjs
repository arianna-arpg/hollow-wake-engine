import {AuraActivation} from '@hollow-wake/engine/auras/activation';
import {AuraRetirement} from '@hollow-wake/engine/auras/retirement';
import {AuraLedgers} from '@hollow-wake/engine/auras/ledgers';
import {AuraTick} from '@hollow-wake/engine/auras/ticking';

/** One aura graph for casts, crew births, resource ledgers and retirement. */
export function installCombatAuras(w, content, shared) {
  const p = shared.ports, q = content.hitQueries;
  const activation = new AuraActivation(p.auraActivation);
  const retirement = new AuraRetirement(p.auraRetirement);
  const ledgers = new AuraLedgers(p.auraLedgers, 'lightning');
  const clock = new AuraTick({...p.auraTick,
    convert: (actor, amount, definition, modifiers, type) => w.damage.applyConversion(actor, amount, q.skillContextTags(definition, [type]), modifiers),
    resistance: (actor, type) => w.damage.resistValue(actor, type),
  });
  w.activateAura = (...args) => activation.activate(...args);
  w.deactivateAura = (...args) => retirement.retire(...args);
  w.updateActorLedgers = (...args) => ledgers.update(...args);
  w.settleLedger = (...args) => ledgers.settle(...args);
  w.updateAuras = dt => clock.update(dt);
  return Object.freeze({activation, retirement, ledgers, clock});
}
