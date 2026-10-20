import type { ZoneDef } from '../data/zones';
import { compileLocale, localeProgram, localeSeed } from '../world/locales';
import { distinctLocale, spatialFormIndex } from '../world/generationDiversity';
import { landmarkComplex, resolveComplexForm, validateLandmarkComplex } from '../world/landmarkComplexes';
import { spacedExitAt } from './worldgen';
import { OPP_DIR, type Dir } from '../world/coords';

/** Build the whole small graph before publishing any member. Existing discoveries
 * are never recompiled from live content, including on a second approach. */
export function materializeComplex(entry: ZoneDef, zones: Record<string, ZoneDef>, kind: string): ZoneDef[] {
  if (entry.complex) return [];
  const registered = landmarkComplex(kind);
  const form = registered?.forms?.[spatialFormIndex(entry.destination?.seed ?? entry.seed ?? 0, kind, entry.map.x, entry.map.y, registered.forms.length)];
  const def = registered && form ? resolveComplexForm(registered, form) : registered;
  if (!def) throw new Error(`unknown landmark complex ${kind}`);
  const errors = validateLandmarkComplex(def);
  if (errors.length) throw new Error(`complex ${kind}: ${errors.join('; ')}`);
  if (entry.locale?.program !== def.stages.find(s => s.id === def.entrance)!.locale)
    throw new Error(`complex ${kind}: entrance locale mismatch`);
  const turn = localeSeed(`${entry.seed}/${kind}/bearing`) % 4;
  const root = structuredClone(entry);
  // Stable sibling order; no mutable discovery ledger or global random stream.
  const plans = new Map([[def.entrance, root.locale!]]);
  for (const stage of [...def.stages].filter(s => s.id !== def.entrance).sort((a,b) => a.id.localeCompare(b.id))) {
    const seed = localeSeed(entry.seed + '/' + kind + '/' + def.version + '/' + stage.id);
    plans.set(stage.id, stage.locales
      ? distinctLocale(stage.locales, seed, [...plans.values()])
      : compileLocale(localeProgram(stage.locale)!, seed));
  }
  const members = def.stages.map(stage => {
    const isEntry = stage.id === def.entrance;
    const id = isEntry ? entry.id : `${entry.id}__${stage.id}`;
    if (!isEntry && zones[id]) throw new Error(`complex member collision ${id}`);
    let [x, y] = stage.offset;
    for (let i = 0; i < turn; i++) [x, y] = [-y, x];
    const program = localeProgram(stage.locale)!;
    const seed = localeSeed(`${entry.seed}/${kind}/${def.version}/${stage.id}`);
    const locale = plans.get(stage.id)!;
    const member: ZoneDef = isEntry ? root : {
      id, name: `${entry.name} — ${stage.label}`, level: entry.level + (stage.levelDelta ?? 0),
      size: locale.size ?? { ...program.size }, shape: 'rect', seed,
      biome: entry.biome, tileset: entry.tileset, theme: { ...structuredClone(entry.theme), ...structuredClone(stage.theme) },
      packs: structuredClone(entry.packs), layout: [], layoutType: 'districts', locale,
      objective: { kind: 'clear' }, exits: [], map: { x: entry.map.x + x, y: entry.map.y + y },
      kind: 'landmark_section', waypoint: false, veiled: true,
      ...(entry.geo ? { geo: { ...structuredClone(entry.geo), escarpment: undefined } } : {}),
      ...(stage.sky ? { sky: stage.sky } : entry.sky ? { sky: entry.sky } : {}),
    };
    if (stage.packs) member.packs = structuredClone(stage.packs);
    if (stage.objective) member.objective = structuredClone(stage.objective);
    member.complex = { root: entry.id, kind, version: def.version, label: entry.name, stage: stage.id, stageLabel: stage.label, ...(form ? { form: form.id } : {}) };
    if (isEntry && def.links.some(l => l.bountyPassage)) member.complex.bountyPassageBoard = true;
    if (isEntry) {
      member.name = `${entry.name} — ${stage.label}`;
      member.level += stage.levelDelta ?? 0;
      if (stage.theme) Object.assign(member.theme, structuredClone(stage.theme));
      if (stage.sky) member.sky = stage.sky;
    }
    if (!isEntry && member.geo) delete member.geo.escarpment;
    return member;
  });
  for (const link of def.links) {
    const a = members.find(z => z.complex!.stage === link.from)!, b = members.find(z => z.complex!.stage === link.to)!;
    if (link.bountyPassage) a.complex!.bountyPassage = { to: b.id, label: link.bountyPassage, opened: false };
    const dx = b.map.x - a.map.x, dy = b.map.y - a.map.y;
    const side: Dir = Math.abs(dx) >= Math.abs(dy) ? dx >= 0 ? 'e' : 'w' : dy >= 0 ? 's' : 'n';
    a.exits.push({ to: b.id, side, at: spacedExitAt(a, side), notarized: true,
      ...(link.fromAt ? { posFrac: { fx: link.fromAt[0], fy: link.fromAt[1] } } : {}) });
    b.exits.push({ to: a.id, side: OPP_DIR[side], at: spacedExitAt(b, OPP_DIR[side]), notarized: true,
      ...(link.toAt ? { posFrac: { fx: link.toAt[0], fy: link.toAt[1] } } : {}) });
  }
  Object.assign(entry, root);
  for (const z of members) if (z.id !== entry.id) zones[z.id] = z;
  return members.filter(z => z.id !== entry.id);
}
