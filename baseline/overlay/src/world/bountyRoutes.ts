import type { World } from '../engine/world';
import { escarpmentRoad } from './escarpments';
import { edgeBlockAt } from './edgeBlocks';
import { travelRoutes, type TravelPolicy } from './travelRoutes';

/** The same live lock sources as portal travel, evaluated without loading a zone.
 * Conservative land routes: no undiscovered sailing, purchases, or dimensional
 * shortcuts are assumed. Safe board interiors may lead out through their real door. */
export function bountyRoutes(w: World, home: string, policy: TravelPolicy) {
  return travelRoutes(w.zoneMap, home, policy, (a, e, b) => {
    if (b.floating || b.concealed || b.pocket || b.caveDepth != null || e.crossDim
      || (a.dimension ?? 'surface') !== (b.dimension ?? 'surface')) return false;
    const unlocked = (from: typeof a, exit: typeof e, to: typeof b): boolean => {
      if (exit.crossDim) return false;
      if (exit.lock === 'harborhold' && from.harborhold && from.harborhold.state !== 'open') return false;
      if (exit.lock && exit.lock !== 'harborhold' && w.sim.holdfastField?.isLocked(from.id, exit.lock)) return false;
      return !edgeBlockAt(w, from.id, to.id);
    };
    const back = b.exits.find(x => x.to === a.id && unlocked(b, x, a));
    // Baked landmark passages already realize their crossing locally (bridges,
    // galleries, passes). Macro river/scarp samples must not erase that route.
    const internal = !!a.complex && a.complex.root === b.complex?.root;
    return !!back && unlocked(a, e, b) && (internal || (!w.roadIsWet(a.map, b.map)
      && escarpmentRoad(a.map, b.map, w.sim.biomeField.fieldSeed)));
  }, id => w.objectiveDoneAt(id));
}
