import '../engine/escarpmentGen';
// Atlas destinations share builders, terrain rules and connection grammar.
// A new site family is a program + a map-feature row, not a new generator.
import '../engine/localeGen';
import './landformLocales';
import './explorationLocales';
import './complexLocales';
import './landmarkComplexes';
import './adventureLocales';
import './adventureRegions';
import { registerLocaleProgram, type LocaleDistrict } from '../world/locales';
import { registerRegion, regionKind } from '../world/regions';

registerRegion({ ...regionKind('water')!, id: 'locale_river', label: 'the river',
  visual: { fill: '#285b72', alpha: 0.88 } });
registerRegion({ id: 'locale_bridge', label: 'the crossing', walkable: true, blocks: false,
  laid: 'built', pathCost: 1, visual: { fill: '#9c8969', alpha: 0.95 } });

const river = { width: [110, 170] as [number, number], bend: [-0.08, 0.08] as [number, number],
  region: 'locale_river', crossing: 'locale_bridge' };
const district = (id: string, builder: string, at: [number, number], size: [number, number], cave = false): LocaleDistrict => ({
  id, builder, at, size, jitter: 0.012, ...(cave ? { cave } : {}),
  dress: [{ kind: builder === 'open' ? 'tree' : 'rock', count: [6, 12], radius: [22, 40] }],
});

registerLocaleProgram({
  id: 'river_fortress', version: 1, label: 'River fortress', size: { w: 2400, h: 2100 },
  variants: [
    {
      id: 'encircled_keep', weight: 1, entrance: 'meadow', goal: 'keep', river,
      districts: [district('meadow', 'open', [0.23, 0.24], [0.32, 0.32]),
        district('keep', 'court', [0.68, 0.34], [0.43, 0.40]),
        district('backwater', 'open', [0.72, 0.77], [0.34, 0.30]),
        district('grotto', 'cavern', [0.23, 0.77], [0.29, 0.28], true)],
      links: [
        { from: 'meadow', to: 'keep', role: 'main', width: 150 },
        { from: 'meadow', to: 'backwater', role: 'flank', width: 120, via: [[0.45, 0.73]] },
        { from: 'backwater', to: 'keep', role: 'flank', width: 120 },
        { from: 'backwater', to: 'grotto', role: 'discovery', width: 105 },
      ],
    },
    {
      id: 'divided_stronghold', weight: 1, entrance: 'approach', goal: 'citadel', river,
      districts: [district('approach', 'open', [0.24, 0.24], [0.32, 0.30]),
        district('gatehouse', 'court', [0.67, 0.23], [0.38, 0.30]),
        district('citadel', 'court', [0.67, 0.73], [0.42, 0.40]),
        district('caverns', 'cavern', [0.23, 0.73], [0.32, 0.36], true)],
      links: [
        { from: 'approach', to: 'gatehouse', role: 'main', width: 160 },
        { from: 'gatehouse', to: 'citadel', role: 'main', width: 150 },
        { from: 'approach', to: 'caverns', role: 'discovery', width: 105 },
        { from: 'caverns', to: 'citadel', role: 'flank', width: 110 },
      ],
    },
  ],
}, true);

registerLocaleProgram({
  id: 'sundered_arches', version: 1, label: 'Sundered arches', size: { w: 2700, h: 2100 },
  variants: [{
    id: 'pilgrim_spurs', weight: 1, entrance: 'valley', goal: 'sanctuary',
    river: { ...river, width: [150, 220], bend: [0.10, 0.16] },
    districts: [district('valley', 'open', [0.24, 0.25], [0.34, 0.34]),
      district('arches', 'arches', [0.51, 0.52], [0.38, 0.38]),
      district('sanctuary', 'court', [0.79, 0.24], [0.26, 0.30]),
      district('deep_grotto', 'cavern', [0.23, 0.79], [0.28, 0.27], true),
      district('overlook', 'open', [0.79, 0.79], [0.28, 0.27])],
    links: [
      { from: 'valley', to: 'arches', role: 'main', width: 160 },
      { from: 'arches', to: 'sanctuary', role: 'main', width: 150 },
      { from: 'arches', to: 'deep_grotto', role: 'discovery', width: 100 },
      { from: 'arches', to: 'overlook', role: 'discovery', width: 110 },
    ],
  }],
});


registerLocaleProgram({ id: 'cliff_ascent', version: 1, label: 'Cliff ascent', size: { w: 2400, h: 2700 }, variants: [{
  id: 'broken_stair', weight: 1, portalMode: 'nearest', entrance: 'lower_ledge', goal: 'summit',
  approaches: { n: { district: 'summit' }, s: { district: 'lower_ledge' },
    w: { district: 'lower_ledge', via: [[0.04, 0.93]] }, e: { district: 'lower_ledge', via: [[0.96, 0.93]] } }, terrain: { background: 'cliff_drop' },
  districts: [district('lower_ledge', 'open', [0.22, 0.84], [0.3, 0.2]),
    { id: 'ascent', builder: 'switchback', at: [0.5, 0.5], size: [0.72, 0.58], external: false,
      params: { pathWidth: 110, turns: 5 }, ports: { lower: [0.12, 0.88], upper: [0.88, 0.12] } },
    district('summit', 'court', [0.78, 0.15], [0.28, 0.18]),
    district('shelter', 'cavern', [0.17, 0.19], [0.22, 0.24], true)],
  links: [{ from: 'lower_ledge', to: 'ascent', toPort: 'lower', role: 'main', width: 110 },
    { from: 'ascent', fromPort: 'upper', to: 'summit', role: 'main', width: 110 },
    { from: 'summit', to: 'shelter', role: 'discovery', width: 100 }],
}] });
registerLocaleProgram({ id: 'cliff_foothills', version: 1, label: 'Cliff foothills', size: { w: 2400, h: 2100 }, variants: [{
  id: 'beneath_the_wall', weight: 1, entrance: 'foothills', goal: 'overlook', terrain: { background: 'wall' },
  districts: [district('foothills', 'open', [0.28, 0.7], [0.42, 0.4]),
    district('overlook', 'open', [0.72, 0.36], [0.36, 0.36]),
    district('hollow', 'cavern', [0.25, 0.26], [0.28, 0.3], true)],
  links: [{ from: 'foothills', to: 'overlook', role: 'main', width: 150 },
    { from: 'foothills', to: 'hollow', role: 'discovery', width: 110 }],
}] });
