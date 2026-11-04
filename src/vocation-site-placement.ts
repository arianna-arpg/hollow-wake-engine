import type {VocationSiteFilter} from './vocation-sites.js';

export interface SiteRandom {
  range(min: number, max: number): number;
}
export interface VocationSiteContent<Filter extends VocationSiteFilter = VocationSiteFilter> {
  readonly id: string;
  readonly secret?: {
    readonly site: {
      readonly npc: string;
      readonly filter: Filter;
      readonly chance: number;
      readonly doodads?: readonly {
        readonly kind: string;
        readonly count: number;
        readonly radius: number;
        readonly size: readonly [number, number];
      }[];
    };
  };
}
export interface VocationPlacementPorts<Zone, Point, Random extends SiteRandom, Filter extends VocationSiteFilter = VocationSiteFilter> {
  definitions(): Iterable<VocationSiteContent<Filter>>;
  standing(vocationId: string): boolean;
  qualifies(zone: Zone, filter: Filter): boolean;
  runSeed(): number;
  hash(identity: string): number;
  random(seed: number): Random;
  width(): number;
  height(): number;
  point(x: number, y: number): Point;
  spawn(vocationId: string, at: Point, random: Random): boolean;
}

/** One local random stream per eligible vocation and zone. The same stream
 * feeds the threshold, position and subsequent dressing. The draw order is
 * part of the content contract. Ordinary spawn refusal continues the scan. */
export function placeVocationSites<Zone extends {readonly id:string}, Point, Random extends SiteRandom, Filter extends VocationSiteFilter>(
  zone: Zone, ports: VocationPlacementPorts<Zone, Point, Random, Filter>,
): void {
  for (const vocation of ports.definitions()) {
    if (!vocation.secret || ports.standing(vocation.id) || !ports.qualifies(zone,vocation.secret.site.filter)) continue;
    const seed = (ports.runSeed() ^ ports.hash(`vocsite_${vocation.id}_${zone.id}`)) >>> 0;
    const random = ports.random(seed);
    if (random.range(0,1) >= vocation.secret.site.chance) continue;
    ports.spawn(
      vocation.id,
      ports.point(ports.width() * random.range(0.3, 0.7), ports.height() * random.range(0.3, 0.7)),
      random,
    );
  }
}

export interface VocationSiteSpawnPorts<Point, Npc> {
  definition(id: string): VocationSiteContent | null | undefined;
  npcAvailable(id: string): boolean;
  zoneLevel(): number;
  createNpc(id: string, level: number): Npc;
  radius(npc: Npc): number;
  clearSpot(at: Point, radius: number): Point;
  setPosition(npc: Npc, at: Point): void;
  publishNpc(npc: Npc): void;
  publishSite(vocationId: string, npc: Npc): void;
  radialPoint(npc: Npc, angle: number, distance: number): Point;
  publishDoodad(at: Point, radius: number, kind: string, rotation: number): void;
}

export function spawnVocationSite<Point, Npc>(
  id: string, at: Point, random: SiteRandom, ports: VocationSiteSpawnPorts<Point, Npc>,
): boolean {
  const vocation = ports.definition(id);
  if (!vocation?.secret || !ports.npcAvailable(vocation.secret.site.npc)) return false;
  const npc = ports.createNpc(vocation.secret.site.npc,Math.max(1,ports.zoneLevel()));
  ports.setPosition(npc,ports.clearSpot(at,ports.radius(npc)));
  ports.publishNpc(npc);
  ports.publishSite(id,npc);
  for (const dressing of vocation.secret.site.doodads ?? []) {
    for (let i=0;i<dressing.count;i++) {
      const angle = random.range(0,Math.PI*2);
      const distance = random.range(dressing.radius*0.5,dressing.radius);
      const point = ports.clearSpot(ports.radialPoint(npc,angle,distance),dressing.size[1]);
      ports.publishDoodad(point,random.range(dressing.size[0],dressing.size[1]),dressing.kind,random.range(0,Math.PI*2));
    }
  }
  return true;
}
