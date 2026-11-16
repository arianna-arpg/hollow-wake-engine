import {Tethers} from '../../dist/tethers.js';
import {isBurstTarget} from '../../dist/combat-target-policy.js';

export function installCombatTethers(w, content) {
  const q = {...content.queries, ...content.hitQueries};
  const tethers = new Tethers(w, {tick: .4, memoTtl: q.LOS_CFG.memoTtl, memoJitter: q.LOS_CFG.memoJitter,
    links: q.LOS_CFG.tetherLinks, colors: q.DAMAGE_COLOR}, {
    actors: () => w.actors, time: () => w.time, tags: q.skillContextTags, modifiers: q.instanceMods,
    grantedTags: q.grantedTags, specs: q.instanceTethers, packSpec: id => q.MONSTERS[id]?.tether,
    applyConversion: (...args) => w.damage.applyConversion(...args), mitigate: (...args) => w.damage.mitigateTyped(...args),
    dominantType: q.dominantTypeOf,
    bodyWhere: (...args) => w.host.space.bodyWhere(...args), lineOfFire: (...args) => w.lineOfFire(...args),
    isBurstTarget, stampSegment: q.stampSegFlash,
    damageCue: (...args) => w.accumulateDotText(...args), kill: (...args) => w.kill(...args),
  });
  w.addTether = (...args) => tethers.add(...args);
  w.attachObjectTethers = (...args) => tethers.attach(...args);
  w.updatePackTethers = dt => tethers.advancePacks(dt);
  w.updateTethers = dt => tethers.advance(dt);
  w.isBurstTarget = isBurstTarget;
  return tethers;
}
