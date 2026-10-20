import { registerLandmarkComplex, type LandmarkComplex } from '../world/landmarkComplexes';
import { adventureForms } from './adventureForms';
import { TILESETS } from './tilesets';
import { registerMapFeature, type FeatureFinder } from '../world/atlas';

const stone = { floor: '#30312d', grid: '#3e4039', border: '#8f907f', obstacle: '#606454', obstacleEdge: '#a3a58e',
  ground: { palette: ['#252824', '#43473e', '#646457'], strength: 0.6, speckles: 0.4 } };
const crypt = { floor: '#27252d', grid: '#34303e', border: '#7c7287', obstacle: '#4b4354', obstacleEdge: '#a899b6',
  ground: { palette: ['#201e28', '#383240', '#514654'], strength: 0.5, speckles: 0.5 } };
const grove = { floor: '#263a2c', grid: '#304b35', border: '#79925f', obstacle: '#4c6045', obstacleEdge: '#8fac75',
  ground: { palette: ['#1d3022', '#354c31', '#62764b'], strength: 0.6 } };

const regions: LandmarkComplex[] = [
  { id: 'ravaged_borough', version: 1, label: 'Ravaged borough', entrance: 'verge',
    stages: [
      { id: 'verge', label: 'Roadside homesteads', locale: 'village_lanes', offset: [0, 0], sky: 'open' },
      { id: 'market', label: 'Pillaged market', locale: 'pillaged_lanes', offset: [85, 0], theme: stone, objective: { kind: 'unearth', count: [3, 4] } },
      { id: 'orchard', label: 'Overgrown orchard', locale: 'sacred_groves', offset: [75, 90], sky: 'open' },
      { id: 'vault', label: 'Buried parish', locale: 'burial_precinct', offset: [170, 0], theme: crypt, sky: 'sheltered', levelDelta: 1, objective: { kind: 'pyres', count: [3, 4] } },
    ],
    links: [{ from: 'verge', to: 'market' }, { from: 'verge', to: 'orchard' }, { from: 'orchard', to: 'market' },
      { from: 'market', to: 'vault', bountyPassage: 'The buried parish', fromAt: [0.80, 0.50] }] },
  { id: 'river_borough', version: 1, label: 'River borough', entrance: 'quays',
    stages: [
      { id: 'quays', label: 'Broken quays', locale: 'waterside_ward', offset: [0, 0], sky: 'open' },
      { id: 'ward', label: 'Upper ward', locale: 'city_wards', offset: [85, -30], theme: stone, objective: { kind: 'pyres', count: [3, 4] } },
      { id: 'banks', label: 'Backwater paths', locale: 'lake_shores', offset: [70, 65], sky: 'open' },
      { id: 'cistern', label: 'Sealed cistern', locale: 'burial_precinct', offset: [170, -30], theme: crypt, sky: 'sheltered', levelDelta: 1, objective: { kind: 'unearth', count: [3, 5] } },
    ], links: [{ from: 'quays', to: 'ward' }, { from: 'quays', to: 'banks' }, { from: 'banks', to: 'ward' },
      { from: 'ward', to: 'cistern', bountyPassage: 'The sealed cistern' }] },
  { id: 'woodland_sanctuary', version: 1, label: 'Woodland sanctuary', entrance: 'wood',
    stages: [
      { id: 'wood', label: 'Outer woodland', locale: 'woodland_paths', offset: [0, 0], sky: 'open' },
      { id: 'groves', label: 'Ring of groves', locale: 'sacred_groves', offset: [90, 0], theme: grove, objective: { kind: 'rifts', count: [2, 3] } },
      { id: 'pond', label: 'Stillwater glade', locale: 'woodland_pond', offset: [65, 90], sky: 'open' },
      { id: 'heart', label: 'Rootbound sanctuary', locale: 'burial_precinct', offset: [180, 0], theme: grove, sky: 'sheltered', levelDelta: 1, objective: { kind: 'unearth', count: [3, 4] } },
    ], links: [{ from: 'wood', to: 'groves' }, { from: 'wood', to: 'pond' }, { from: 'pond', to: 'groves' },
      { from: 'groves', to: 'heart', bountyPassage: 'The rootbound sanctuary' }] },
  { id: 'highland_pilgrimage', version: 1, label: 'Highland pilgrimage', entrance: 'foot',
    stages: [
      { id: 'foot', label: 'Wooded foothold', locale: 'woodland_paths', offset: [0, 0], sky: 'open' },
      { id: 'pass', label: 'Winding pass', locale: 'upland_pass', offset: [90, -20], sky: 'open', objective: { kind: 'pyres', count: [3, 4] } },
      { id: 'hollow', label: 'Sheltering galleries', locale: 'overland_cave_galleries', offset: [60, 70], sky: 'sheltered' },
      { id: 'tarn', label: 'Hidden tarn', locale: 'alpine_tarn', offset: [180, -20], sky: 'open', levelDelta: 1, objective: { kind: 'unearth', count: [3, 4] } },
    ], links: [{ from: 'foot', to: 'pass' }, { from: 'foot', to: 'hollow' }, { from: 'hollow', to: 'pass' },
      { from: 'pass', to: 'tarn', bountyPassage: 'The hidden tarn' }] },
  { id: 'necropolis_precinct', version: 1, label: 'Necropolis precinct', entrance: 'gate',
    stages: [
      { id: 'gate', label: 'Mourning streets', locale: 'city_wards', offset: [0, 0], theme: stone },
      { id: 'crypts', label: 'Processional crypts', locale: 'burial_precinct', offset: [90, 0], theme: crypt, sky: 'sheltered', objective: { kind: 'pyres', count: [4, 5] } },
      { id: 'cloister', label: 'Broken cloister', locale: 'stronghold_bailey', offset: [65, 85], theme: stone, sky: 'open' },
      { id: 'reliquary', label: 'Sealed reliquary', locale: 'stronghold_halls', offset: [180, 0], theme: crypt, sky: 'sheltered', levelDelta: 2, objective: { kind: 'rifts', count: [3, 4] } },
    ], links: [{ from: 'gate', to: 'crypts' }, { from: 'gate', to: 'cloister' }, { from: 'cloister', to: 'crypts' },
      { from: 'crypts', to: 'reliquary', bountyPassage: 'The sealed reliquary' }] },
];
for (const def of regions) {
  def.stages.find(s => s.id === def.entrance)!.objective = { kind: 'clear' };
  for (const stage of def.stages) if (stage.theme === crypt) stage.packs = TILESETS.crypt.packs;
  def.version = 2;
  def.forms = adventureForms(def);
  registerLandmarkComplex(def);
}

const strewn = (salt: number, span: number, gates: Extract<FeatureFinder, { kind: 'strewn' }>['gates']): FeatureFinder =>
  ({ kind: 'strewn', salt, span, gates, jitter: 0.7, chance: 0.42 });
for (const row of [
  { id: 'ravaged_borough', locale: 'village_lanes', label: 'pillaged borough', glyph: 'ruin', color: '#baa27d', words: ['Borough', 'Parish'],
    find: strewn(0x6b010, 1750, [{ axis: 'elevation', min: 0.10, max: 0.64 }]),
    read: 'homesteads surround a pillaged market; recover its caches to commission entry into the buried parish' },
  { id: 'river_borough', locale: 'waterside_ward', label: 'river borough', glyph: 'ruin', color: '#91b9be', words: ['Quays', 'Riverward'],
    find: { kind: 'river-sites', minRun: 8, progress: [0.35, 0.8], chance: 0.45, salt: 0x6b011, interpolate: true } as FeatureFinder,
    read: 'crossings connect the quays to an upper ward; relight the ward to gain a commission for the cistern' },
  { id: 'woodland_sanctuary', locale: 'woodland_paths', label: 'woodland sanctuary', glyph: 'ruin', color: '#8caf74', words: ['Sanctuary', 'Rootwood'],
    find: strewn(0x6b012, 1900, [{ axis: 'moisture', min: 0.46 }, { axis: 'temperature', min: 0.32, max: 0.76 }, { axis: 'elevation', max: 0.68 }]),
    read: 'enclosed groves and pond paths surround a rootbound sanctuary; seal the tears to earn passage' },
  { id: 'highland_pilgrimage', locale: 'woodland_paths', label: 'high-country passage', glyph: 'summit', color: '#acbac9', words: ['Pilgrim Heights', 'Hidden Pass'],
    find: strewn(0x6b013, 1850, [{ axis: 'elevation', min: 0.62 }, { axis: 'temperature', max: 0.58 }]),
    read: 'a winding pass and covered galleries climb from wooded footholds; kindle the wayfires to open a hidden tarn' },
  { id: 'necropolis_precinct', locale: 'city_wards', label: 'necropolis', glyph: 'ruin', color: '#ac9cbd', words: ['Necropolis', 'Mourning Precinct'],
    find: strewn(0x6b014, 2100, [{ axis: 'elevation', min: 0.16, max: 0.78 }]),
    read: 'mourning streets lead into crypt wings and a broken cloister; relight the tombs to commission the reliquary' },
]) registerMapFeature({ id: row.id, label: row.label, glyph: row.glyph, icon: row.glyph === 'summit' ? '⛰' : '⌘',
  color: row.color, find: row.find, reach: 200, size: 64, destination: { locale: row.locale, complex: row.id },
  names: { first: ['Grey', 'Hollow', 'Windworn', 'Forgotten', 'Silent', 'Old'], second: row.words }, read: row.read });
