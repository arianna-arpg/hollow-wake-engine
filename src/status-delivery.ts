import type {DeliveryInstance, DeliverySkill, DeliveryStatus, SiphonStatusEffect, RecallImpalesEffect,
  StatusDeliveryActor, StatusDeliveryPorts, StatusDamageType} from './status-delivery-types.js';
export type * from './status-delivery-types.js';

/** One simulation binding over borrowed records. Callbacks are synchronous;
 * failures retain earlier writes. No shared per-operation scratch or actor copies. */
export function createStatusDelivery<
  A extends StatusDeliveryActor<I, P, M, Tag, Status>, I extends DeliveryInstance,
  S extends DeliverySkill, P, Direction, M, Tag extends string, Status extends DeliveryStatus,
>(ports: StatusDeliveryPorts<A, I, S, P, Direction, Status>) {
  const recallSources = new WeakMap<I, I>();

  function siphon(caster: A, effect: SiphonStatusEffect, areaScale: number, def: S,
    tags: Set<Tag>, extra: M[], cosmeticColor: string): void {
    const radius = effect.radius * areaScale;
    let drawn = 0;
    for (const actor of ports.actors()) {
      if (actor === caster || actor.dead || actor.untargetable || actor.construct) continue;
      const ally = actor.team === caster.team;
      if (effect.from === 'allies' && !ally) continue;
      if (effect.from === 'enemies' && ally) continue;
      if (ports.distance(caster.pos, actor.pos) - actor.radius > radius) continue;
      for (let i = actor.statuses.length - 1; i >= 0; i--) {
        const status = actor.statuses[i];
        if (effect.statuses && !effect.statuses.includes(status.id)) continue;
        ports.transplant(caster, status, def.name, {duration: 'remaining'});
        actor.statuses.splice(i, 1);
        actor.sheet.removeSource('status:' + status.id);
        drawn++;
        if (effect.healPer) caster.healBy(effect.healPer * caster.sheet.get('healPower', tags, extra));
      }
    }
    if (drawn > 0) {
      ports.text(caster.pos, drawn + ' drawn', def.color, 13, 22);
      ports.flash(caster.pos, radius, cosmeticColor, 0.3);
    } else ports.failNote(caster, def.id + ':nothing', 'nothing to draw');
  }

  function recall(caster: A, inst: I, effect: RecallImpalesEffect, areaScale: number, def: S): void {
    const radius = effect.radius * areaScale;
    let wrenched = 0;
    for (const target of ports.enemies(caster)) {
      if (target.construct?.breakable) continue;
      if (ports.distance(caster.pos, target.pos) - target.radius > radius) continue;
      for (let i = target.statuses.length - 1; i >= 0; i--) {
        const status = target.statuses[i];
        if (!ports.definition(status.id)?.dischargeOnHit || !status.rupture || status.rupture <= 0) continue;
        target.statuses.splice(i, 1);
        target.sheet.removeSource('status:' + status.id);
        const bank = status.rupture;
        const burst: Partial<Record<StatusDamageType, number>> = {
          [status.ruptureType ?? 'physical']: bank * (effect.damageScale ?? 1),
        };
        const taken = ports.mitigateTyped(target, burst);
        if (taken > 0) {
          target.life -= taken;
          target.hitFlash = 0.12;
          target.hitFlashType = status.ruptureType ?? 'physical';
          ports.text(target.pos, Math.round(taken).toString(), ports.definition(status.id)?.color ?? '#c8ccd8', 12);
          if (target.life <= 0 && !target.dead) ports.kill(target, false, caster);
        }
        if (ports.spearDefinition()) {
          const treeRecall = ports.hasTreeRecall(inst);
          let spear = treeRecall ? undefined : caster.metaInsts.get('__impale_spear');
          if (!spear || spear.level !== ports.effectiveLevel(inst)) {
            spear = ports.makeInstance(ports.spearDefinition()!, ports.effectiveLevel(inst));
            if (treeRecall) recallSources.set(spear, inst);
            else caster.metaInsts.set('__impale_spear', spear);
          }
          ports.spawnProjectile(caster, spear, ports.copyPosition(target.pos),
            ports.direction(target.pos, caster.pos), {flat: {physical: bank * (effect.spearShare ?? 0.5)}});
        }
        wrenched++;
      }
    }
    if (wrenched > 0) ports.text(caster.pos, wrenched + ' wrenched free!', def.color, 13, 22);
    else ports.failNote(caster, def.id + ':nospears', 'nothing lodged');
  }

  /** Exact instance identity, including a spear registered before a failed spawn.
   * The host composes this predicate with its other projectile retirement rules. */
  function isReturnedFrom(spear: I, source: I): boolean {return recallSources.get(spear) === source;}
  return {siphon, recall, isReturnedFrom};
}
