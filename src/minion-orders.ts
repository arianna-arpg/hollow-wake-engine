export interface OrderPoint {x: number; y: number}
export interface OrderSkill {
  readonly def: {readonly id: string; readonly throng?: {readonly tier?: string; readonly monsterId: string}};
  readonly hostSkillId?: string;
}
export interface OrderActor<A, I> {
  readonly id: number;
  readonly owner?: A | null;
  readonly dead: boolean;
  readonly construct?: unknown;
  readonly passive?: boolean;
  readonly squadId?: number;
  readonly faction?: string;
  readonly tier: number;
  readonly pos: OrderPoint;
  readonly skills: readonly (I | null | undefined)[];
  readonly summonInst?: I;
  readonly sheet: {get(stat: string): number};
  useLock: number;
  mana: number;
  maxMana(): number;
  ownedBy(actor: A): boolean;
}
export interface MinionCommandEffect {
  readonly command?: string;
  readonly affects?: 'minions' | 'squad' | 'both';
  readonly radius?: number;
  readonly duration?: number;
  readonly discipline?: number;
  readonly markRadius?: number;
}
export interface MinionCastEffect {readonly skillId: string; readonly at?: 'aim' | 'enemy'; readonly range?: number}
export interface IssuedMinionOrder {
  kind: string; pos: OrderPoint; until: number; radius: number | undefined;
  targetId: number | undefined; issuerId: number;
}
export interface MinionOrderRules {readonly duration: number; readonly pinRadius: number; readonly earshot: number; readonly delegates: number}
export interface MinionOrderPorts<A, I> {
  actors(): readonly A[];
  enemies(actor: A): Iterable<A>;
  time(): number;
  random(): number;
  commandExists(kind: string): boolean;
  skillExists(id: string): boolean;
  serves(actor: A, hostId: string): boolean;
  throng(actor: A): boolean;
  obedience(actor: A): number;
  /** Host AI consumes this explicit combat command. Navigation is not run here. */
  issue(actor: A, order: IssuedMinionOrder): void;
  promoteCommand(caster: A, skill: I, affects: NonNullable<MinionCommandEffect['affects']>, radius?: number): void;
  liteKind(monsterId: string): number;
  promote(at: OrderPoint, query: {within: number; max: number; story: number; owner: number; kindIdx: number}): void;
  level(skill: I): number;
  makeSkill(id: string, level: number): I;
  forwardSockets(source: I | undefined, destinations: I[]): void;
  execute(actor: A, skill: I, aim: OrderPoint, options: {noRepeat: true}): boolean;
  assault(caster: A, skill: I, recipients: A[], recall: boolean): void;
  defied(actor: A): void;
  sent(at: OrderPoint, color: string): void;
  unheeded(caster: A): void;
  empty(caster: A, skillId: string): void;
  unknown(kind: string, skillId: string): void;
}
const distance = (a: OrderPoint, b: OrderPoint): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Spell-owned selection, obedience, delegation and ordering. General AI owns
 * interpreting the resulting order. Roster traversal and synchronous callbacks
 * retain original visibility; partial writes survive a thrown host callback. */
export class MinionOrders<A extends OrderActor<A, I>, I extends OrderSkill> {
  constructor(readonly rules: MinionOrderRules, readonly ports: MinionOrderPorts<A, I>) {}

  command(caster: A, skill: I, aim: OrderPoint, effect: MinionCommandEffect, color: string): void {
    const kind = effect.command ?? 'assault';
    if (!this.ports.commandExists(kind)) {this.ports.unknown(kind, skill.def.id); return;}
    const affects = effect.affects ?? 'minions';
    this.ports.promoteCommand(caster, skill, affects, effect.radius);
    const until = this.ports.time() + (effect.duration ?? this.rules.duration), mark = {...aim};
    let quarry: A | undefined, nearest = this.rules.pinRadius;
    for (const enemy of this.ports.enemies(caster)) {
      if (enemy.passive || enemy.sheet.get('invisible') > 0) continue;
      const gap = distance(enemy.pos, mark);
      if (gap < nearest) {nearest = gap; quarry = enemy;}
    }
    const discipline = (effect.discipline ?? 0) + caster.sheet.get('commandDiscipline');
    let sent = 0, balked = 0;
    const recipients: A[] = [];
    for (const actor of this.ports.actors()) {
      if (actor === caster || actor.dead || actor.construct) continue;
      const owned = actor.ownedBy(caster);
      const squadmate = !actor.owner && !actor.passive
        && ((caster.squadId !== undefined && actor.squadId === caster.squadId)
          || (caster.faction !== undefined && actor.faction === caster.faction
            && distance(actor.pos, caster.pos) <= (effect.radius ?? this.rules.earshot)));
      const takes = affects === 'minions' ? owned : affects === 'squad' ? squadmate : owned || squadmate;
      if (!takes || (skill.hostSkillId && !this.ports.serves(actor, skill.hostSkillId))) continue;
      if (effect.radius !== undefined && distance(actor.pos, caster.pos) > effect.radius) continue;
      const obedience = Math.min(1, this.ports.obedience(actor) + discipline);
      if (!(this.ports.random() < obedience)) {
        balked++; this.ports.defied(actor); continue;
      }
      this.ports.issue(actor, {kind, pos: {...mark}, until, radius: effect.markRadius, targetId: quarry?.id, issuerId: caster.id});
      recipients.push(actor); sent++;
    }
    this.ports.assault(caster, skill, recipients, kind === 'recall');
    if (sent > 0) this.ports.sent({...mark}, color);
    else if (balked > 0) this.ports.unheeded(caster);
    else this.ports.empty(caster, skill.def.id);
  }

  cast(caster: A, skill: I, aim: OrderPoint, effect: MinionCastEffect): void {
    if (!this.ports.skillExists(effect.skillId)) return;
    const lord = caster.owner ?? caster, hostId = skill.hostSkillId;
    if (hostId) {
      const spec = lord.skills.find(candidate => candidate?.def.id === hostId)?.def.throng;
      if (spec?.tier === 'lite') {
        const kindIdx = this.ports.liteKind(spec.monsterId);
        if (kindIdx >= 0) this.ports.promote(aim, {within: 1e9, max: this.rules.delegates, story: caster.tier, owner: lord.id, kindIdx});
      }
    }
    let troops = this.ports.actors().filter(actor => actor.owner === lord && !actor.dead && !actor.construct
      && (!hostId || this.ports.serves(actor, hostId)));
    const throng = troops.filter(actor => this.ports.throng(actor));
    if (throng.length > this.rules.delegates) {
      throng.sort((a, b) => distance(a.pos, aim) - distance(b.pos, aim));
      const keep = new Set(throng.slice(0, this.rules.delegates));
      troops = troops.filter(actor => !this.ports.throng(actor) || keep.has(actor));
    }
    let sent = 0;
    for (const actor of troops) {
      let at: OrderPoint | undefined;
      if ((effect.at ?? 'aim') === 'enemy') {
        let best: A | undefined, nearest = effect.range ?? 340;
        for (const enemy of this.ports.enemies(actor)) {
          const gap = distance(actor.pos, enemy.pos);
          if (gap < nearest) {nearest = gap; best = enemy;}
        }
        if (best) at = {...best.pos};
      } else at = {...aim};
      if (!at) continue;
      const order = this.ports.makeSkill(effect.skillId, this.ports.level(skill));
      this.ports.forwardSockets(actor.summonInst, [order]);
      actor.useLock = 0;
      actor.mana = Math.max(actor.mana, actor.maxMana());
      this.ports.execute(actor, order, at, {noRepeat: true});
      sent++;
    }
    if (!sent) this.ports.empty(caster, skill.def.id);
  }
}
