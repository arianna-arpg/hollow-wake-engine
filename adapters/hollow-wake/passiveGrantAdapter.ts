// Game-owned authoring boundary. Refresh explicitly after a live definition edit.
import { PassiveGrants, type PassiveGrantPack } from '@hollow-wake/engine/passives/grants';
import { PASSIVE_NODES } from '../data/passives';
import { CHOICE_GROUPS } from '../data/passiveChoices';
import { ATTRIBUTES, ATTRIBUTE_IDS, STAT_DEFS, type Modifier } from './stats';
import { SUPPORTS } from '../data/supports';
import { PROC_RIDER_LIST, procRiderStat } from '../data/procs';
import type { PlayerMeta } from './world';
let cached: PassiveGrants | undefined, revision = 0;
export function refreshSdkPassiveGrants(): void { cached = undefined; revision++; }
function content(): PassiveGrants {
  if (cached) return cached;
  const nodes = Object.values(PASSIVE_NODES), groups = Object.values(CHOICE_GROUPS);
  const grants = [...nodes, ...groups.flatMap(g => g.options)];
  const authoredMods = grants.flatMap(n => n.mods ?? []);
  const payload = (g: Pick<PassiveGrantPack['nodes'][number], 'attributes' | 'attributesPct' | 'mods' | 'conduit' | 'graft'>) =>
    ({ attributes: g.attributes, attributesPct: g.attributesPct, mods: g.mods, conduit: g.conduit, graft: g.graft });
  cached = new PassiveGrants({ schemaVersion: 1, capability: 'passive-grants/v1', contentId: `hollow-wake-live-grants:${revision}`,
    attributes: ATTRIBUTE_IDS.map(id => ({ id, perPoint: ATTRIBUTES[id].perPoint })),
    // Riders are read by the gameplay engine but do not register a STAT_DEFS display row.
    // The editor also permits ad-hoc numeric keys, which the original sheet reads from a zero base.
    statIds: [...new Set([...Object.keys(STAT_DEFS), ...PROC_RIDER_LIST.map(r => procRiderStat(r.id)),
      ...authoredMods.flatMap(m => m.fromStat ? [m.stat, m.fromStat] : [m.stat])])],
    // Retired authoring references remain visible; the original host support lookup skips missing definitions.
    supportIds: [...new Set([...Object.keys(SUPPORTS), ...grants.flatMap(g => g.graft ? [g.graft.support] : [])])],
    nodes: nodes.map(n => ({ id: n.id, name: n.name, description: n.description,
      choiceGroup: n.choice && Object.hasOwn(CHOICE_GROUPS,n.choice.group) ? n.choice.group : undefined, ...payload(n) })),
    groups: groups.map(g => ({ id: g.id, options: g.options.map(o => ({ id: o.id, name: o.name, description: o.description, ...payload(o) })) })),
  });
  return cached;
}
type GameGrantBuild = Omit<ReturnType<PassiveGrants['begin']>, 'passiveModifiers' | 'addItemModifiers' | 'attributeModifiers'> & {
  readonly passiveModifiers: Modifier[];
  addItemModifiers(mods: readonly Modifier[]): Modifier[];
  attributeModifiers(): Modifier[];
};
export function beginSdkPassiveGrants(meta: Pick<PlayerMeta, 'baseAttrs' | 'allocated' | 'choices'>): GameGrantBuild {
  // The original rebuild tolerates retired saved node/option ids. Policy loading is separately strict.
  // Tags originate from the game's typed registries and pass through unchanged.
  return content().begin(meta.baseAttrs, meta.allocated, meta.choices, 'skip') as GameGrantBuild;
}
