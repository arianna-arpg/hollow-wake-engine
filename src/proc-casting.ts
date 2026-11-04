/** A triggered cast is already admitted and paid for by its caller. */
export interface ProcCastSpec {
  readonly skillId: string;
  readonly count: readonly [number, number];
  readonly spread?: 'ring' | number;
  readonly at?: 'target' | 'self';
  readonly mult?: number;
  readonly own?: true;
}

export interface ProcCastSkill {
  readonly id: string;
  readonly delivery: { readonly type: string };
}
export interface ProcCastInstance {
  readonly def: { readonly id: string };
  readonly procChainDepth?: number;
}
export interface ProcCastActor<P> {
  readonly pos: P;
  readonly level: number;
}
export interface ProcHeldSkillPorts<A, I, Seat> {
  instances(actor: A): Iterable<I | null | undefined>;
  seat(actor: A): Seat | null | undefined;
  granted(seat: Seat, id: string): I | null | undefined;
  learned(seat: Seat, id: string): I | null | undefined;
}

/** Bar identity wins, followed by the seated grant and learned book. A host's
 * unseated catalogue does not grant ownership. All lookups remain lazy. */
export function heldProcSkill<I extends ProcCastInstance, A, Seat>(
  actor: A, skillId: string, ports: ProcHeldSkillPorts<A, I, Seat>,
): I | null {
  for (const instance of ports.instances(actor)) if (instance?.def.id === skillId) return instance;
  const seat = ports.seat(actor);
  if (seat == null) return null;
  return ports.granted(seat, skillId) ?? ports.learned(seat, skillId) ?? null;
}

export interface ProcCastExecution<P> {
  targetInfo: { pos: P };
  dmgMult: number;
  noCooldown: true;
  noRepeat: true;
  noFollowUp: true;
  keepFacing: true;
}
export interface ProcCastingPorts<A, I, S, P, Direction> {
  definition(id: string): S | null | undefined;
  heldInstance(actor: A, id: string): I | null;
  effectiveLevel(instance: I): number;
  /** Create a fresh synthetic instance at this captured level and chain depth.
   * The host owns construction and representation; the SDK never spreads it. */
  makeInstance(skill: S, level: number, depth: number): I;
  copyPosition(position: P): P;
  direction(from: P, to: P): Direction;
  facing(actor: A): Direction;
  /** Rotate in the host's projectile plane; radians, not engine-specific Euler units. */
  rotate(bearing: Direction, radians: number): Direction;
  ringDirection(radians: number): Direction;
  random(min: number, max: number): number;
  randomInt(min: number, max: number): number;
  spawnProjectile(actor: A, instance: I, from: P, direction: Direction, options: {depth: number; mult: number}): void;
  /** Runs after spawn returns. Lock the host's last projectile, including a
   * nested spawn's last projectile, against this anchor for its whole lifetime. */
  lockLastProjectile(anchor: A): void;
  executeSkill(actor: A, instance: I, origin: P, options: ProcCastExecution<P>): void;
}

/** Synchronous policy with borrowed records and caller-owned randomness.
 * No per-cast payload closure, shared scratch state, global registry or queue.
 * Exceptions propagate with earlier deliveries intact; a host may re-enter. */
export function createProcCasting<
  I extends NonNullable<unknown>, S extends ProcCastSkill, P, Direction,
  A extends ProcCastActor<P>,
>(ports: ProcCastingPorts<A, I, S, P, Direction>) {
  function cast(caster: A, instance: I | null, target: A | null, depth: number, spec: ProcCastSpec, aim?: P): boolean {
    const skill = ports.definition(spec.skillId);
    if (!skill) return false;
    const anchored = spec.at !== 'self' && target ? target : null;
    const origin = ports.copyPosition(anchored ? anchored.pos : spec.at !== 'self' && aim !== undefined ? aim : caster.pos);
    const count = ports.randomInt(spec.count[0], spec.count[1]);
    if (count <= 0) return false;
    const held = spec.own ? ports.heldInstance(caster, spec.skillId) : null;
    const level = held != null ? ports.effectiveLevel(held)
      : instance != null ? ports.effectiveLevel(instance) : Math.max(1, Math.round(caster.level / 2));
    const mult = spec.mult ?? 1;
    if (skill.delivery.type === 'projectile') {
      const bearing = target && target !== caster ? ports.direction(caster.pos, target.pos)
        : aim !== undefined ? ports.direction(caster.pos, aim) : ports.facing(caster);
      const from = anchored ? origin : ports.copyPosition(caster.pos);
      // Retain the phase draw even for a zero-width fan.
      const phase = ports.random(0, Math.PI * 2);
      const fan = typeof spec.spread === 'number' ? spec.spread : anchored ? undefined : 0;
      for (let i = 0; i < count; i++) {
        const direction = fan === undefined
          ? ports.ringDirection(phase + (i / count) * Math.PI * 2)
          : ports.rotate(bearing, count === 1 ? 0 : (i / (count - 1) - 0.5) * fan * Math.PI / 180);
        const payload = held ?? ports.makeInstance(skill, level, depth);
        ports.spawnProjectile(caster, payload, from, direction, {depth, mult});
        if (anchored) ports.lockLastProjectile(anchored);
      }
    } else {
      for (let i = 0; i < count; i++) {
        const payload = held ?? ports.makeInstance(skill, level, depth);
        ports.executeSkill(caster, payload, origin, {
          targetInfo: {pos: ports.copyPosition(origin)}, dmgMult: mult,
          noCooldown: true, noRepeat: true, noFollowUp: true, keepFacing: true,
        });
      }
    }
    return true;
  }
  return {cast};
}
