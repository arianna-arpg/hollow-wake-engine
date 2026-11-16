export interface RelocationPoint {x: number; y: number}
export interface RelocationSkill {readonly def: {readonly id: string}}
export interface RelocationDelivery {readonly type: string; readonly kind?: string; readonly castSkillId?: string; readonly placeRange?: number}
export interface RelocationActor<A, I> {
  readonly dead: boolean;
  readonly downed?: boolean;
  readonly skills: readonly (I | null | undefined)[];
  readonly owner?: A | null;
  readonly summonInst?: I;
  readonly construct?: {readonly kind: string};
  readonly lifespan?: number;
  readonly team: string;
  readonly radius: number;
  pos: RelocationPoint;
  facing: number;
  casting: unknown;
  push?: unknown;
}
export interface RelocationPorts<A, I> {
  actors(): readonly A[];
  metas(skill: I): readonly {readonly skillId: string}[];
  delivery(skill: I): RelocationDelivery;
  sameLayer(a: A, b: A): boolean;
  clamp(point: RelocationPoint, radius: number, mover: A): RelocationPoint;
  moved(actor: A, color: string): void;
}

/** A minted meta payload carries its original host identity, never merely a
 * matching skill id. This instance-owned association has no account/save owner.
 * The command's target query is also suitable for cast admission. */
export class ConstructRelocation<A extends RelocationActor<A, I>, I extends RelocationSkill> {
  readonly #hosts = new WeakMap<I, I>();
  constructor(readonly ports: RelocationPorts<A, I>, readonly hostOf?: (payload: I) => I | undefined) {}
  bind(payload: I, host: I): void {this.#hosts.set(payload, host);}

  target(caster: A, payload: I, radius: number): A | undefined {
    const host = this.hostOf ? this.hostOf(payload) : this.#hosts.get(payload);
    if (!host || !caster.skills.includes(host) || caster.dead || caster.downed
      || !this.ports.metas(host).some(meta => meta.skillId === payload.def.id)) return;
    const delivery = this.ports.delivery(host);
    if (delivery.type !== 'construct' || !['totem', 'sentry'].includes(delivery.kind ?? '') || !delivery.castSkillId) return;
    let best: A | undefined, bestDistance = radius;
    for (const body of this.ports.actors()) {
      if (body.dead || body.downed || body.owner !== caster || body.summonInst !== host
        || !body.construct || !['totem', 'sentry'].includes(body.construct.kind)
        || !this.ports.sameLayer(body, caster) || body.team !== caster.team || !(body.lifespan! > 0)) continue;
      const distance = Math.hypot(caster.pos.x - body.pos.x, caster.pos.y - body.pos.y);
      if (distance <= bestDistance && (!best || distance < bestDistance)) {best = body; bestDistance = distance;}
    }
    return best;
  }

  move(caster: A, payload: I, aim: RelocationPoint, radius: number, color: string): void {
    const body = this.target(caster, payload, radius), host = this.hostOf ? this.hostOf(payload) : this.#hosts.get(payload);
    const delivery = host && this.ports.delivery(host);
    if (body && delivery?.type === 'construct') {
      const angle = Math.atan2(aim.y - caster.pos.y, aim.x - caster.pos.x);
      const reach = Math.min(Math.hypot(aim.x - caster.pos.x, aim.y - caster.pos.y), delivery.placeRange ?? 100);
      body.pos = this.ports.clamp({x: caster.pos.x + Math.cos(angle) * reach, y: caster.pos.y + Math.sin(angle) * reach}, body.radius, body);
      body.facing = angle;
      body.casting = null;
      body.push = null;
      this.ports.moved(body, color);
    }
  }
}
