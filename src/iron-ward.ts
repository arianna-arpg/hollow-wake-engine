export interface IronWardState {
  stored: number; cap: number; until: number; ratio: number; radius: number; visualColor?: string;
}
export interface IronWardEffect {
  readonly duration: number; readonly cap: number; readonly ratio: number;
  readonly radius: number; readonly reduce: number;
}
export interface IronWardActor<Tags, M> {
  readonly dead: boolean;
  readonly team: string;
  readonly pos: {readonly x: number; readonly y: number};
  readonly sheet: {get(stat: string, tags: Tags, extra: readonly M[]): number};
  ironWard?: IronWardState;
}
export interface IronWardPorts<A,I=unknown> {
  time(): number;
  buff(actor: A, effect: {type: 'buff'; id: 'iron_ward'; duration: number; mods: {stat: 'damageTaken'; kind: 'more'; value: number}[]}, durationScale: number, skill?:I): void;
  burst(at: {x: number; y: number}, radius: number, amount: number, type: 'physical', color: string, team: string, layer: 0): void;
}

/** Accumulation is shared with HitAftermath. The expiry phase deliberately uses
 * the original ground-layer burst; changing that rule needs a separate baseline
 * decision. A build/scene retirement can clear the actor's bank without a burst. */
export class IronWard<A extends IronWardActor<Tags, M>, Tags, M,I=unknown> {
  constructor(readonly ports: IronWardPorts<A,I>) {}
  arm(actor: A, effect: IronWardEffect, durationScale: number, areaScale: number, tags: Tags, extra: readonly M[], color: string, skill?:I): void {
    const duration = effect.duration * durationScale;
    actor.ironWard = {stored: 0, cap: effect.cap * actor.sheet.get('poolCap', tags, extra), until: this.ports.time() + duration,
      ratio: effect.ratio, radius: effect.radius * areaScale, visualColor: color};
    this.ports.buff(actor, {type:'buff', id:'iron_ward', duration:effect.duration, mods:[{stat:'damageTaken',kind:'more',value:-effect.reduce}]}, durationScale, ...(skill!==undefined?[skill]:[]));
  }
  advance(actor: A): void {
    if (actor.ironWard && this.ports.time() >= actor.ironWard.until) {
      const bank = actor.ironWard;
      actor.ironWard = undefined;
      const amount = Math.min(bank.cap, bank.stored) * bank.ratio;
      if (amount > 0 && !actor.dead) this.ports.burst({...actor.pos}, bank.radius, amount, 'physical', bank.visualColor ?? '#c8c0a8', actor.team, 0);
    }
  }
}
