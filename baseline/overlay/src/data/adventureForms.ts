import type { LandmarkComplex, ComplexForm, ComplexStage } from '../world/landmarkComplexes';
const POOLS:Record<string,string[]>={
  village_lanes:['village_lanes','terrace_hamlet','orchard_homesteads','arcaded_village'],
  pillaged_lanes:['pillaged_lanes','burnt_crossroads','shattered_wards','abandoned_quarries'],
  city_wards:['city_wards','market_arcades','courtyard_wards','arcaded_village'],
  burial_precinct:['burial_precinct','ossuary_galleries','cloister_tombs','catacomb_spurs'],
  sacred_groves:['sacred_groves','braided_woodland','pond_gardens','rootbound_clearings'],
  upland_pass:['upland_pass','terraced_ridge','ravine_trails','scree_hollows'],
  waterside_ward:['waterside_ward','canal_wards','reed_islands','millpond_paths'],
  woodland_paths:['woodland_paths','braided_woodland','rootbound_clearings','orchard_homesteads'],
  lake_shores:['lake_shores','reed_islands','millpond_paths','pond_gardens'],
  woodland_pond:['woodland_pond','pond_gardens','millpond_paths'],
  overland_cave_galleries:['overland_cave_galleries'],
  alpine_tarn:['alpine_tarn'],
  stronghold_bailey:['stronghold_bailey','courtyard_wards','shattered_wards'],
  stronghold_halls:['stronghold_halls','cloister_tombs','ossuary_galleries'],
};
const EXTRA_POOLS:Record<string,string[]>={
  ravaged_borough:['orchard_homesteads','terrace_hamlet','arcaded_village','burnt_crossroads'],
  river_borough:['waterside_ward','canal_wards','reed_islands','millpond_paths'],
  woodland_sanctuary:['braided_woodland','rootbound_clearings','pond_gardens','orchard_homesteads'],
  highland_pilgrimage:['scree_hollows','terraced_ridge','ravine_trails'],
  necropolis_precinct:['cloister_tombs','ossuary_galleries','catacomb_spurs','courtyard_wards'],
};
const SIDE_LABELS:Record<string,string[]>={
  ravaged_borough:['Crofter yards','Abandoned farm lanes','Broken garden walls'],
  river_borough:['Reed-cut banks','Millrace terraces','Forgotten landing'],
  woodland_sanctuary:['Tangled clearings','Stillwater gardens','Root-clasped hollow'],
  highland_pilgrimage:['Lateral ravine','Weathered shelves','Scree amphitheatre'],
  necropolis_precinct:['Outer burial walks','Ossuary annex','Sunken mourning court'],
};
/** Compose geographic alternatives without replacing any base stage rule. */
export function adventureForms(def:LandmarkComplex):ComplexForm[] {
  const [entry,task,side,sealed]=def.stages;
  for(const stage of def.stages) if(stage.id!==def.entrance) stage.locales=POOLS[stage.locale];
  const gate=structuredClone(def.links.find(l=>l.bountyPassage)!);
  const e=(from:string,to:string)=>({from,to});
  const pos=(taskAt:[number,number],sideAt:[number,number],gateAt:[number,number])=>({
    [entry.id]:[0,0] as [number,number],[task.id]:taskAt,[side.id]:sideAt,[sealed.id]:gateAt});
  const extra=(i:number,offset:[number,number]):ComplexStage=>({
    id:'side_'+i,label:SIDE_LABELS[def.id][i],locale:EXTRA_POOLS[def.id][0],locales:EXTRA_POOLS[def.id],offset,
    ...(side.theme?{theme:structuredClone(side.theme)}:{}),...(side.sky?{sky:side.sky}:{}),
    // Same clear-zone rules; this is optional generated ground, not a new activity.
  });
  return [
    {id:'circuit',offsets:Object.fromEntries(def.stages.map(s=>[s.id,s.offset])),links:structuredClone(def.links)},
    {id:'fork',offsets:pos([90,-50],[60,85],[180,-80]),links:[e(entry.id,task.id),e(entry.id,side.id),gate]},
    {id:'promenade',offsets:pos([100,0],[100,110],[210,0]),extras:[extra(0,[0,110])],
      links:[e(entry.id,task.id),e(entry.id,'side_0'),e('side_0',side.id),e(side.id,task.id),gate]},
    {id:'linked_precincts',offsets:pos([110,0],[110,110],[220,-30]),extras:[extra(0,[0,110]),extra(1,[220,110])],
      links:[e(entry.id,task.id),e(entry.id,'side_0'),e('side_0',side.id),e(side.id,task.id),e(task.id,'side_1'),e('side_1',side.id),gate]},
    {id:'long_excursion',offsets:pos([90,-50],[0,90],[180,-90]),extras:[extra(0,[90,150]),extra(1,[180,150])],
      links:[e(entry.id,task.id),e(entry.id,side.id),e(side.id,'side_0'),e('side_0','side_1'),gate]},
    {id:'braided_approach',offsets:pos([220,0],[60,90],[320,0]),extras:[extra(0,[110,-70]),extra(1,[150,90]),extra(2,[150,190])],
      links:[e(entry.id,'side_0'),e(entry.id,side.id),e('side_0',task.id),e(side.id,'side_1'),e('side_1',task.id),e('side_1','side_2'),gate]},
  ];
}
