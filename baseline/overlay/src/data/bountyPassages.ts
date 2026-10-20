import { registerBountyKind, type BountyRollHost } from './bountyboard';
import { OBJECTIVE_READS, type ZoneDef } from './zones';
import { registerEdgeBlockSource } from '../world/edgeBlocks';
import { registerZoneInfoSource } from '../world/zoneInfo';

/** Gates are optional leaves of a saved landmark graph. The task is outside. */
export const BOUNTY_PASSAGE_CFG = { weight: 1.6, levelAbove: 3, reach: 720 };
function eligible(host: BountyRollHost, z: ZoneDef): boolean {
  const gate = z.complex?.bountyPassage, home = host.zoneMap[host.boardZoneId];
  return !!gate && !gate.opened && !!host.zoneMap[gate.to] && !!home
    && z.complex!.root === host.boardZoneId
    && (!host.pin || host.pin === z.id)
    && z.level <= host.playerLevel + BOUNTY_PASSAGE_CFG.levelAbove
    && Math.hypot(z.map.x - home.map.x, z.map.y - home.map.y) <= BOUNTY_PASSAGE_CFG.reach * host.reach
    && (host.routeFits?.(z.id) ?? false)
    && !host.kindClaimed('passage', z.id);
}
registerBountyKind({
  id: 'passage', weight: BOUNTY_PASSAGE_CFG.weight,
  bountyPriority: host => !!host.zoneMap[host.boardZoneId]?.complex?.bountyPassageBoard,
  available: host => Object.values(host.zoneMap).some(z => eligible(host, z)),
  roll(host, rng, taken) {
    const pool = Object.values(host.zoneMap).filter(z => !taken.has(z.id) && eligible(host, z))
      .sort((a, b) => a.id.localeCompare(b.id));
    if (!pool.length) return null;
    const z = rng.pick(pool);
    return { id: `bounty_${host.slateKey}_${host.seq}`, kind: 'passage', boardId: host.boardId,
      zoneId: z.id, beat: host.beat, pay: {}, challengeLevel: z.level };
  },
  accept(world, p) {
    const gate = world.zoneMap[p.zoneId]?.complex?.bountyPassage;
    if (!gate || gate.opened || !world.zoneMap[gate.to]) return 'the passage is no longer sealed';
    return world.bountyApproaches(p.boardId, false).has(p.zoneId) ? null : 'the approach is blocked';
  },
  // A deed done before the commission still earns access. Offered cards stay
  // live: only the accepted hand can become ready and collect its permission.
  done: (world, p) => p.acceptAt !== undefined && world.objectiveDoneAt(p.zoneId),
  annulled(world, p) {
    const gate = world.zoneMap[p.zoneId]?.complex?.bountyPassage;
    return gate && !gate.opened && world.zoneMap[gate.to] ? null : 'the passage is no longer sealed';
  },
  collectBounty(world, p) {
    const gate = world.zoneMap[p.zoneId]?.complex?.bountyPassage;
    if (gate && !gate.opened && p.acceptAt !== undefined && world.objectiveDoneAt(p.zoneId)) {
      gate.opened = true;
      world.charDirty = true;
    }
  },
  copy(world, p) {
    const z = world.zoneMap[p.zoneId], gate = z?.complex?.bountyPassage;
    const deed = z ? OBJECTIVE_READS[z.objective.kind]?.read : undefined;
    return { title: `Open: ${gate?.label ?? 'Sealed passage'}`,
      ask: `${z?.name ?? 'Lost ground'}: ${deed ?? 'complete the objective'}. Return to this board to open ${gate?.label ?? 'the passage'}.` };
  },
});

registerEdgeBlockSource((world, from, to) => {
  for (const [a, b] of [[from, to], [to, from]]) {
    const gate = world.zoneMap[a]?.complex?.bountyPassage;
    if (gate?.to === b && !gate.opened)
      return { source: 'bountyPassage', reason: `${gate.label} is sealed by a bounty commission`, color: '#cfb477' };
  }
  return null;
});
registerZoneInfoSource((world, id) => {
  const z = world.zoneMap[id], gate = z?.complex?.bountyPassage;
  if (!gate || z.veiled) return [];
  return [{ kind: 'condition', icon: gate.opened ? '◇' : '◆', color: '#cfb477', z: 21,
    label: gate.label, detail: gate.opened ? 'Passage opened' : 'Bounty commission · return to a board' }];
});
