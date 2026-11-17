export type StreamResource = 'life' | 'mana' | 'es';
export interface RestorationStream<Cue> {
  onHeal?:(amount:number)=>void;
  resource: StreamResource;
  perSec: number;
  remaining: number;
  feedingCue?: Cue | false;
}
export interface StreamActor<Cue> {
  mana: number;
  absorb: number;
  absorbTimer: number;
  readonly restoreStreams: RestorationStream<Cue>[];
  readonly sheet: {get(stat: string): number};
  maxLife(): number;
  availableMaxMana(): number;
  healBy(amount: number): number;
  gainEs(amount: number): number;
}
export interface StreamPorts<A, Cue> {
  gain(actor: A, resource: StreamResource | 'absorb', landed: number, cue: Cue | false | undefined): void;
}

/** The host admits a finite nonnegative frame and runs the actor's earlier
 * timer phases first. Streams iterate backwards, like the original actor;
 * callbacks see each debit before its gain. No dead-body policy, elapsed-time
 * source, persistence or presentation implementation is installed here. */
export function advanceRestorationStreams<A extends StreamActor<Cue>, Cue>(actor: A, dt: number, ports: StreamPorts<A, Cue>): void {
  for (let i = actor.restoreStreams.length - 1; i >= 0; i--) {
    const stream = actor.restoreStreams[i];
    const step = Math.min(stream.remaining, stream.perSec * dt);
    stream.remaining -= step;
    if (stream.resource === 'life') {
      const landed = actor.healBy(step);
      if(landed>0)stream.onHeal?.(landed);
      ports.gain(actor, 'life', landed, stream.feedingCue);
      const spill = step * actor.sheet.get('healTaken') - landed;
      if (spill > 0.0001) {
        const overmend = actor.sheet.get('overheal');
        if (overmend > 0) {
          const before = actor.absorb;
          actor.absorb = Math.min(actor.maxLife() * 0.5, actor.absorb + spill * overmend);
          actor.absorbTimer = Math.max(actor.absorbTimer, 6);
          ports.gain(actor, 'absorb', actor.absorb - before, stream.feedingCue);
        }
      }
    } else if (stream.resource === 'mana') {
      const before = actor.mana;
      actor.mana = Math.min(actor.availableMaxMana(), actor.mana + step);
      ports.gain(actor, 'mana', actor.mana - before, stream.feedingCue);
    } else {
      ports.gain(actor, 'es', actor.gainEs(step), stream.feedingCue);
    }
    if (stream.remaining <= 0) actor.restoreStreams.splice(i, 1);
  }
}
