import {discoverVocationSites, matchesVocationSite, placeVocationSites, spawnVocationSite, type VocationDiscoveryPorts, type VocationPlacementPorts, type VocationSiteSpawnPorts} from '@hollow-wake/engine/progression/vocation-sites';
import {VOCATIONS, VOCATION_CFG} from '../data/vocations';
import {patronFaction} from '../world/biomes';
import {MONSTERS} from '../data/monsters';
import {Rng} from '../core/rng';
import {dist, vec, type Vec2} from '../core/math';
import type {Actor} from './actor';
import type {World} from './world';
import type {ZoneDef} from '../data/zones';
import type {VocationSiteFilter} from '../data/vocations';

export function bindVocationSites(world: World, hash: (value:string)=>number) {
  const territory = {patronFaction, owner: (id:string) => world.sim.faction.owner(id)};
  const discovery: VocationDiscoveryPorts<Actor> = {
    definition: id => VOCATIONS[id],
    dead: actor => actor.dead,
    runLedger: () => world.ledger,
    accountLedger: () => world.account.ledger,
    distanceFromPlayer: actor => dist(actor.pos,world.player.pos),
    discoveryRadius: () => VOCATION_CFG.discoveryRadius,
    classId: () => world.meta.classDef.id,
    cue: (actor, offset, message, color, size) => world.text(vec(actor.pos.x,actor.pos.y+offset),message,color,size),
    markCharacterDirty: () => world.markMetaDirty(world.localSeat),
  };
  // Preserve the World receiver and the method selected before position draws.
  // An ordinary standing shrine reuses the binding while this method is stable.
  let lastSpawn: World['spawnVocationSite'] | undefined;
  let boundSpawn: World['spawnVocationSite'] | undefined;
  const placement: VocationPlacementPorts<ZoneDef,Vec2,Rng,VocationSiteFilter> = {
    definitions: () => Object.values(VOCATIONS),
    standing: id => world['vocationSites'].some(site => site.vocId===id && !site.npc.dead),
    qualifies: (zone,filter) => world['zoneMatchesSiteFilter'](zone,filter),
    runSeed: () => world.manifest.seed, hash, random: seed => new Rng(seed),
    width: () => world.arena.w, height: () => world.arena.h, point: vec,
    get spawn() {
      const current = world['spawnVocationSite'];
      if (!boundSpawn || lastSpawn !== current) {
        boundSpawn = current.bind(world);
        lastSpawn = current;
      }
      return boundSpawn;
    },
  };
  const materialization: VocationSiteSpawnPorts<Vec2,Actor> = {
    definition: id => VOCATIONS[id], npcAvailable: id => !!MONSTERS[id],
    zoneLevel: () => world.zone.level, createNpc: (id,level) => world['createMonster'](id,level,'enemy'),
    radius: npc => npc.radius, clearSpot: (at,radius) => world['findFreeSpot'](at,radius),
    setPosition: (npc,at) => {npc.pos=at;}, publishNpc: npc => {world.actors.push(npc);},
    publishSite: (vocId,npc) => {world['vocationSites'].push({vocId,npc});},
    radialPoint: (npc,angle,distance) => vec(npc.pos.x+Math.cos(angle)*distance,npc.pos.y+Math.sin(angle)*distance),
    publishDoodad: (pos,radius,kind,rot) => {world.doodads.push({pos,radius,kind,rot});},
  };
  return {
    place: (zone:ZoneDef) => placeVocationSites(zone,placement),
    spawn: (id:string,at:Vec2,random:Rng) => spawnVocationSite(id,at,random,materialization),
    matches: (zone:ZoneDef,filter:VocationSiteFilter) => matchesVocationSite(zone,filter,territory),
    update: () => discoverVocationSites(world['vocationSites'],discovery),
  };
}
