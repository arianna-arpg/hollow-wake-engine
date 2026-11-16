/** Combat crowd state is local, packed and bounded. Rendering and navigation
 * may inspect it, but promotion, ply damage and keeper ownership stay here. */
export function installCombatPopulation(w, content, options = {}) {
  const q = {...content.queries, ...content.hitQueries}, cfg = content.staticRules.lite;
  const capacity = options.capacity ?? cfg.capacity;
  if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > cfg.capacity) throw new RangeError('Invalid combat crowd capacity');
  const arena = w.host.space.arena();
  if (!arena || !Number.isFinite(arena.w) || !Number.isFinite(arena.h) || arena.w <= 0 || arena.h <= 0) throw new RangeError('Invalid combat crowd bounds');
  w.lite = new q.LitePool(capacity); w.lite.reset(arena.w, arena.h);
  w.liteKinds = []; w.liteKindIdxMap = new Map(); w.liteMaxR = 0;
  w.liteBeatAt = new Map(); w.liteOrders = new Map(); w.liteXpAcc = 0;
  w.liteKills = new Map(); w.liteDemoteClock = 0; w.litePromoteBudget = 0;
  w.liteCounts = new Int32Array(16); w.litePockets = [];
  w.liteHasTrample = false; w.liteMinTrampleSpeed = Infinity;
  w.liteVec = {x: 0, y: 0}; w.liteKeeperScratch = new Map(); w.liteVictimScratch = [];
  w.liteOpenAt = (x, y) => x >= 0 && y >= 0 && x <= arena.w && y <= arena.h && w.host.space.isWalkable(x, y, 0);
  const advance = dt => {
    w.liteDemoteClock -= dt;
    if (w.liteDemoteClock <= 0) {w.liteDemoteClock = cfg.demote.every; w.liteDemoteSweep();}
    if (w.lite.liveCount > 0) w.liteSteerAndBite(dt);
    if (w.liteXpAcc >= 1) {
      const amount = Math.floor(w.liteXpAcc); w.liteXpAcc -= amount;
      w.signal('combat-xp', {amount});
    }
    if (w.liteKills.size) {
      const kills = [...w.liteKills]; w.liteKills.clear();
      w.signal('crowd-kills', {kills});
    }
  };
  return Object.freeze({advance});
}
