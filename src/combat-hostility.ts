export interface HostilityActor<A> {
  id: number; team: string; tier?: number; faction?: string; owner?: A;
  dead: boolean; downed: boolean; untargetable: boolean;
  possession?: {guiseFaction?: string; guiseBroken?: boolean};
  clingTo?: {id: number}; construct?: {breakable?: boolean};
}
/** Host-owned faction/AI/geography facts, queried only on their native branch. */
export interface HostilityFacts<A> {
  travelProtected(actor: A): boolean;
  crossLayerDuels(): boolean;
  burrowed(actor: A): boolean;
  prey(hunter: A, target: A): boolean;
  factionStance(a: string, b: string): string;
}

/** Combat targeting filters shared by casts, contacts and field selection.
 * Guise, burrowing and predation are deliberately one-directional. */
export class CombatHostility<A extends HostilityActor<A>> {
  constructor(readonly facts: HostilityFacts<A>) {}
  hostile(a: A, b: A): boolean {
    const p = this.facts;
    if (p.travelProtected(b)) return false;
    if ((a.tier ?? 0) !== (b.tier ?? 0) && !p.crossLayerDuels()) return false;
    if (b.possession?.guiseFaction && !b.possession.guiseBroken && a.team === 'enemy' && a.faction === b.possession.guiseFaction) return false;
    if (b.clingTo?.id === a.id && p.burrowed(b)) return false;
    if (a.team !== b.team) return true;
    if (p.prey(a, b)) return true;
    return !!(a.team === 'enemy' && a.faction && b.faction && p.factionStance(a.faction, b.faction) === 'hostile');
  }
}
