import '../engine/explorationDistricts';
import '../engine/adventureDistricts';
import { registerLocaleProgram, type DistrictChoice } from '../world/locales';
import { adventureVariants, type AdventurePalette } from './adventureGrammar';
const c=(builder:string,params:Record<string,number>={},id=builder+JSON.stringify(params)):DistrictChoice=>({id,builder,params,weight:1});
const homes=[c('settlement_blocks',{breach:0}),c('terraced_homes',{rows:3}),c('cloister_walk',{cuts:2})];
const ruins=[c('settlement_blocks',{breach:.85}),c('arcade_rows',{rows:2}),c('terraced_homes',{rows:2})];
const urban=[c('arcade_rows',{rows:4}),c('settlement_blocks',{breach:.35}),c('cloister_walk',{cuts:4})];
const tombs=[c('crypt_wings',{rows:4}),c('ossuary_spokes',{spokes:5}),c('cloister_walk',{cuts:3})];
const groves=[c('grove_ring',{bearing:.8}),c('braided_thickets',{lobes:3}),c('stepping_pools',{pools:3})];
const ridges=[c('switchback',{turns:5,pathWidth:120}),c('ridge_spurs',{branches:3}),c('terraces',{shelves:3})];
const waters=[c('sunken_channels',{bridges:2}),c('stepping_pools',{pools:4}),c('basin',{bank:.22,island:.18})];
const rocks=[c('arches'),c('cavern',{chambers:7}),c('ridge_spurs',{branches:4})];
const rows:AdventurePalette[]=[];
function family(id:string,label:string,core:DistrictChoice[],side:DistrictChoice[],grammars:number[],scenery:AdventurePalette['scenery'],river=false) {
  rows.push({id,label,core,side,grammars,scenery,river});
}
family('village_lanes','Walled village lanes',homes,groves,[0,1,2,3,5],'rubble');
family('pillaged_lanes','Pillaged streets',ruins,rocks,[1,2,3,5,6],'rubble');
family('city_wards','Old city wards',urban,tombs,[0,2,3,4,6],'rubble');
family('burial_precinct','Burial precinct',tombs,rocks,[0,1,3,5,6],'burial_urn');
family('sacred_groves','Enclosed sacred groves',groves,rocks,[1,2,3,5,7],'flowers');
family('upland_pass','Pass and sheltering hollow',ridges,rocks,[0,1,2,5,7],'rock');
family('waterside_ward','Waterside settlement',homes,waters,[0,2,3,4,7],'rubble',true);
family('terrace_hamlet','Terraced hamlet',[c('terraced_homes',{rows:4}),c('terraced_homes',{rows:2})],groves,[0,1,4,5,6],'rubble');
family('orchard_homesteads','Orchard homesteads',[c('terraced_homes',{rows:2}),c('settlement_blocks',{breach:0})],groves,[1,2,3,5,7],'flowers');
family('arcaded_village','Arcaded village',[c('terraced_homes',{rows:2}),c('terraced_homes',{rows:3})],[c('arcade_rows',{rows:2}),c('arcade_rows',{rows:3})],[0,2,3,4,6],'rubble');
family('burnt_crossroads','Broken crossroads',ruins,groves,[0,1,4,5,7],'rubble');
family('shattered_wards','Shattered wards',[c('cloister_walk',{cuts:4}),c('settlement_blocks',{breach:1})],ruins,[1,2,3,4,6],'rubble');
family('abandoned_quarries','Abandoned quarry cuts',ridges,ruins,[0,1,3,5,6],'rock');
family('canal_wards','Canal wards',[c('sunken_channels',{bridges:2}),c('sunken_channels',{bridges:3})],urban,[0,2,3,4,7],'rubble',true);
family('market_arcades','Market arcades',[c('arcade_rows',{rows:3}),c('arcade_rows',{rows:4})],homes,[1,2,3,4,6],'rubble');
family('courtyard_wards','Linked courtyard wards',[c('cloister_walk',{cuts:2}),c('cloister_walk',{cuts:3})],urban,[0,2,3,4,7],'rubble');
family('ossuary_galleries','Radial ossuary galleries',[c('ossuary_spokes',{spokes:4}),c('ossuary_spokes',{spokes:6})],tombs,[0,1,3,5,7],'burial_urn');
family('cloister_tombs','Cloister tombs',[c('cloister_walk',{cuts:2}),c('crypt_wings',{rows:2})],tombs,[0,2,3,4,6],'burial_urn');
family('catacomb_spurs','Branching catacombs',[c('crypt_wings',{rows:3}),c('ossuary_spokes',{spokes:3})],rocks,[0,1,4,5,6],'burial_urn');
family('braided_woodland','Braided woodland',[c('braided_thickets',{lobes:2}),c('braided_thickets',{lobes:4})],groves,[1,2,3,5,7],'flowers');
family('pond_gardens','Scattered pond gardens',[c('stepping_pools',{pools:2}),c('stepping_pools',{pools:5})],groves,[0,2,3,4,7],'flowers');
family('rootbound_clearings','Rootbound clearings',[c('grove_ring',{bearing:1.2}),c('braided_thickets',{lobes:3})],rocks,[0,1,2,5,6],'flowers');
family('terraced_ridge','Terraced ridge',[c('terraces',{shelves:3}),c('terraces',{shelves:5})],ridges,[0,1,3,4,5],'rock');
family('ravine_trails','Forking ravine trails',[c('ridge_spurs',{branches:2}),c('ridge_spurs',{branches:4})],rocks,[0,1,2,5,7],'rock');
family('scree_hollows','Sheltered scree hollows',[c('cavern',{chambers:3}),c('arches',{passage:170})],ridges,[1,2,3,5,6],'rock');
family('reed_islands','Reed island paths',[c('basin',{bank:.20,island:.25}),c('stepping_pools',{pools:4})],groves,[0,2,3,4,7],'flowers',true);
family('millpond_paths','Old millpond paths',[c('basin',{bank:.28,island:.08}),c('stepping_pools',{pools:2})],homes,[1,2,3,5,7],'rubble',true);
// District proportions express their physical role, independently of whole-zone scale.
const footprints:Record<string,{coreSize:[number,number];sideSize:[number,number]}>={
  sacred_groves:{coreSize:[.30,.30],sideSize:[.24,.24]},
  rootbound_clearings:{coreSize:[.30,.20],sideSize:[.22,.24]},
  orchard_homesteads:{coreSize:[.24,.30],sideSize:[.30,.26]},
  arcaded_village:{coreSize:[.30,.20],sideSize:[.30,.24]},
  market_arcades:{coreSize:[.26,.30],sideSize:[.24,.24]},
  courtyard_wards:{coreSize:[.30,.30],sideSize:[.26,.24]},
  cloister_tombs:{coreSize:[.20,.30],sideSize:[.22,.24]},
  canal_wards:{coreSize:[.18,.30],sideSize:[.30,.24]},
  millpond_paths:{coreSize:[.30,.30],sideSize:[.20,.24]},
  reed_islands:{coreSize:[.30,.22],sideSize:[.24,.22]},
};
for(const row of rows)Object.assign(row,footprints[row.id]);
export const ADVENTURE_LOCALE_IDS=rows.map(row=>row.id);
for(const row of rows) registerLocaleProgram({id:row.id,label:row.label,version:2,size:{w:3600,h:3100},
  sizeScale:[.95,1.2],underways:true,variants:adventureVariants(row)});
