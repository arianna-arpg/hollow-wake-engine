import {vocationDiscoveryKey,vocationUnlockKey} from './vocation-keys.js';
export * from './vocation-site-placement.js';

export interface VocationSiteZone {
  readonly id: string;
  readonly objective: {readonly kind: string};
  readonly level: number;
  readonly biome?: string;
  readonly layoutType?: string;
  readonly harborhold?: {readonly state: string};
}
export interface VocationSiteFilter {
  readonly minLevel?: number;
  readonly biomes?: readonly string[];
  readonly layouts?: readonly string[];
  readonly patronFactions?: readonly string[];
  readonly controllingFactions?: readonly string[];
  readonly harborhold?: true | string;
}
export interface VocationSiteTerritory {
  patronFaction(biome: string): string | null | undefined;
  owner(zoneId: string): {readonly faction?: string | null; readonly owned: boolean};
}

export function matchesVocationSite(zone: VocationSiteZone, filter: VocationSiteFilter, territory: VocationSiteTerritory): boolean {
  if (zone.objective.kind === 'safe') return false;
  if (filter.minLevel !== undefined && zone.level < filter.minLevel) return false;
  if (filter.biomes && !(zone.biome && filter.biomes.includes(zone.biome))) return false;
  if (filter.patronFactions) {
    const faction = zone.biome ? territory.patronFaction(zone.biome) : null;
    if (!faction || !filter.patronFactions.includes(faction)) return false;
  }
  if (filter.controllingFactions) {
    const owner = territory.owner(zone.id);
    if (!owner.faction || !owner.owned || !filter.controllingFactions.includes(owner.faction)) return false;
  }
  if (filter.layouts && !(zone.layoutType && filter.layouts.includes(zone.layoutType))) return false;
  if (filter.harborhold !== undefined) {
    const hold = zone.harborhold;
    if (!hold || (filter.harborhold !== true && hold.state !== filter.harborhold)) return false;
  }
  return true;
}

export interface VocationSite<Npc> {
  readonly vocId: string;
  readonly npc: Npc;
  silentNoted?: boolean;
}
export interface VocationDiscoveryDefinition {
  readonly name: string;
  readonly color: string;
  readonly classId: string;
  readonly secret?: {readonly classLockedDiscovery?: boolean; readonly discoveryText?: string};
}
type Ledger = Record<string, number | undefined>;
export interface VocationDiscoveryPorts<Npc> {
  definition(id: string): VocationDiscoveryDefinition | null | undefined;
  dead(npc: Npc): boolean;
  runLedger(): Ledger;
  accountLedger(): Readonly<Ledger>;
  distanceFromPlayer(npc: Npc): number;
  discoveryRadius(): number;
  classId(): string;
  cue(npc: Npc, offset: number, text: string, color: string, size: number): void;
  markCharacterDirty(): void;
}

/** A site's silence is per standing NPC. Discovery belongs to the run, while an
 * account unlock may make a different class eligible to hear a future shrine. */
export function discoverVocationSites<Npc>(sites: Iterable<VocationSite<Npc>>, ports: VocationDiscoveryPorts<Npc>): void {
  for (const site of sites) {
    const definition = ports.definition(site.vocId);
    if (!definition?.secret || ports.dead(site.npc)) continue;
    if ((ports.runLedger()[vocationDiscoveryKey(site.vocId)] ?? 0) >= 1) continue;
    if (ports.distanceFromPlayer(site.npc) > ports.discoveryRadius()) continue;
    const unlocked = (ports.accountLedger()[vocationUnlockKey(site.vocId)] ?? 0) >= 1;
    if (!unlocked && (definition.secret.classLockedDiscovery ?? true) && ports.classId() !== definition.classId) {
      if (!site.silentNoted) {
        site.silentNoted = true;
        ports.cue(site.npc, -40, 'It does not stir for you.', '#8a8678', 13);
      }
      continue;
    }
    const ledger = ports.runLedger(), key = vocationDiscoveryKey(site.vocId);
    ledger[key] = (ledger[key] ?? 0) + 1;
    ports.cue(site.npc, -44, definition.secret.discoveryText ?? `A calling takes notice of you. (${definition.name})`, definition.color, 16);
    ports.markCharacterDirty();
  }
}
