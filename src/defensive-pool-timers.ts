export interface DefensivePoolActor {
  readonly dead: boolean;
  life: number;
  absorb: number;
  absorbTimer: number;
  ward: number;
  stagger?: {amount: number; perSec: number};
  readonly guardIntervention: Record<string, number>;
  readonly sheet: {get(stat: string): number};
}
export interface DefensivePoolPorts<A> {tickAbsorbLayers(actor: A, dt: number): void}

/** Original actor phase between status expiry and restoration streams.
 * The caller admits frame time and owns post-frame death collection. In
 * particular stagger is already mitigated life damage, never a second hit. */
export function advanceDefensivePools<A extends DefensivePoolActor>(actor: A, dt: number, ports: DefensivePoolPorts<A>): void {
  ports.tickAbsorbLayers(actor, dt);
  for (const key of Object.keys(actor.guardIntervention)) {
    actor.guardIntervention[key] = Math.max(0, actor.guardIntervention[key] - dt);
    if (actor.guardIntervention[key] === 0) delete actor.guardIntervention[key];
  }
  if (actor.absorb > 0) {
    actor.absorbTimer -= dt;
    if (actor.absorbTimer <= 0) actor.absorb = 0;
  }
  if (actor.ward > 0) {
    const rate = actor.sheet.get('wardDecay');
    actor.ward = Math.max(0, actor.ward - Math.max(actor.ward * rate, 2) * dt);
    if (actor.ward < Number.EPSILON) actor.ward = 0;
  }
  if (actor.stagger && actor.stagger.amount > 0 && !actor.dead) {
    const drain = Math.min(actor.stagger.amount, actor.stagger.perSec * dt);
    actor.stagger.amount -= drain;
    actor.life -= drain;
    if (actor.stagger.amount <= 0.1) actor.stagger = undefined;
  }
}
