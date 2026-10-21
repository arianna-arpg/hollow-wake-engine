import {Ammunition, commitAmmunitionPress, requiresUseCharge} from '@hollow-wake/engine/resources/ammunition';

/** Small synchronous host with illustrative content. The host owns authority,
 * ordinary resource payment, cooldown advancement and delivery. Each actor owns
 * its banks; the SDK supplies ammunition admission, spending and recovery rules. */
export function ammunitionCycle() {
  const rifle = {def: {id: 'sample-rifle', cooldown: 2}, spec: {max: 2, magazine: true}};
  const fuel = {def: {id: 'sample-fuel', cooldown: 0}, spec: {max: 2, recharge: 1, empower: .25}};
  const actor = (skill, mana) => {
    const state = {skill, mana, clocks: new Map(), banks: new Map()};
    state.ammunition = new Ammunition(state.banks, {
      spec: inst => inst.spec, skills: () => [state.skill], capacityBonus: () => 0,
      chargeRate: () => 1, cooldownRecovery: () => 1, still: () => true,
      cooling: inst => state.clocks.has(inst.def.id),
    });
    return state;
  };
  const gunner = actor(rifle, 8), caster = actor(fuel, 4), refused = actor(fuel, 0);
  const deliveries = [], stamps = [];
  const ports = {
    bank: (owner, inst) => owner.ammunition.bank(inst),
    spend: (owner, inst) => owner.ammunition.spendOne(inst),
    finalRoundDamage: () => 2,
    stampCooldown: (owner, inst, duration) => {
      const bank = owner.ammunition.bank(inst);
      stamps.push({count: bank.count, reloading: !!bank.reloading, timer: bank.timer});
      owner.clocks.set(inst.def.id, duration);
    },
  };
  const fire = owner => {
    const inst = owner.skill;
    if (owner.clocks.has(inst.def.id)) return false;
    if (requiresUseCharge(inst.spec) && owner.ammunition.bank(inst).count <= 0) return false;
    if (owner.mana < 1) return false;
    const receipt = commitAmmunitionPress(owner, inst, inst.spec, ports);
    owner.mana -= 1;
    deliveries.push({skill: inst.def.id, multiplier: receipt.roundMult});
    return true;
  };
  const frame = (owner, dt) => {
    for (const [id, time] of owner.clocks) {
      if (time <= dt) owner.clocks.delete(id); else owner.clocks.set(id, time - dt);
    }
    owner.ammunition.advance(dt);
  };
  fire(gunner); fire(gunner);
  const refusedWhileReloading = !fire(gunner);
  frame(gunner, 1);
  const restored = gunner.ammunition.restore(rifle, 1);
  if (restored > 0) gunner.clocks.delete(rifle.def.id);
  fire(gunner); frame(gunner, 2);
  fire(caster); fire(caster); fire(caster); // Dry optional fuel still casts plainly.
  frame(caster, 1); fire(caster);
  const refusedWithoutBank = !fire(refused) && refused.banks.size === 0;
  return {deliveries, stamps, restored, refusedWhileReloading, refusedWithoutBank,
    gunner: {mana: gunner.mana, bank: {...gunner.ammunition.bank(rifle)}, clocks: [...gunner.clocks]},
    caster: {mana: caster.mana, bank: {...caster.ammunition.bank(fuel)}}, independentBanks: gunner.banks !== caster.banks};
}
