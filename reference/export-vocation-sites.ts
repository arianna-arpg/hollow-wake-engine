import fs from 'node:fs';
import assert from 'node:assert/strict';
import {VOCATION_LIST,VOCATION_CFG,vocationDiscoveryKey,vocationLedgerKey,type VocationSiteFilter} from '../src/data/vocations';
import {mintHoldState,HOLD_CLASSES} from '../src/data/harborholds';
import {TILESETS} from '../src/data/tilesets';
import {placeZoneAt} from '../src/engine/worldgen';
import {ZONE_LIST} from '../src/data/zones';
import {makeSimWorld,bootSimEngine} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
bootSimEngine();
const sampleBiomes=['grove','highland','taiga','ossuary','jungle','desert'];
function frontierZones(world:ReturnType<typeof makeSimWorld>,seed:number){
 const anchor=world.zoneMap.lastlight, zones=[];
 for(const [i,biome] of sampleBiomes.entries()){
   const tileset=Object.values(TILESETS).find(t=>t.biome===biome);if(!tileset)continue;
   for(let j=0;j<3;j++){
     const id='__site_'+seed+'_'+biome+'_'+j,point={x:anchor.map.x+400+i*700,y:anchor.map.y+300+j*650};
     const zone=placeZoneAt(point,anchor,world.zoneMap,100+i*3+j,{id,level:30,seed:seed+i*3+j,tileset:tileset.id,noWeave:true});
     assert.equal(zone.id,id);world.zoneMap[id]=zone;zones.push(zone);
   }
 }
 return zones;
}

const secret=VOCATION_LIST.filter(v=>v.secret);
const reset=seedGlobalRandom(193);
const w=makeSimWorld('warrior',193),filterCases=[];
for(const zone of [...ZONE_LIST,...frontierZones(w,193)])for(const v of secret)filterCases.push([zone.id,v.id,w['zoneMatchesSiteFilter'](zone,v.secret!.site.filter)]);
const policies: {name:string,filter:VocationSiteFilter}[]=[
 {name:'empty',filter:{}},{name:'level',filter:{minLevel:30}},{name:'biome',filter:{biomes:['grove','highland']}},
 {name:'missing-biome',filter:{biomes:[]}},{name:'patron',filter:{patronFactions:['sylvan']}},
 {name:'territory',filter:{controllingFactions:['sylvan']}},{name:'layout',filter:{layouts:['plains']}},
 {name:'any-hold',filter:{harborhold:true}},{name:'open-hold',filter:{harborhold:'open'}},
 {name:'axes',filter:{biomes:['grove'],patronFactions:['sylvan'],controllingFactions:['sylvan'],layouts:['plains'],minLevel:30,harborhold:'open'}},
];
const axes: {name:string,eligible:boolean,ownerReads:string[]}[]=[];
const generated=frontierZones(w,555).find(z=>z.biome==='grove')!;
assert(generated);
const authority=w.sim.faction,originalOwner=authority.owner;
try{
 for(const safe of [false,true])for(const level of [29,30])for(const biome of [undefined,'grove','desert'])
 for(const layoutType of [undefined,'plains','other'])for(const hold of [undefined,'besieged','fallen','open'] as const)
 for(const owned of [false,true])for(const faction of ['sylvan','other']){
  const zone={...generated,level,biome,layoutType,objective:safe?w.zone.objective:generated.objective,
   harborhold:hold?{...mintHoldState(HOLD_CLASSES.landing),state:hold}:undefined};
  for(const {name,filter} of policies){
    const reads:string[]=[];authority.owner=(id)=>{reads.push(id);return {...originalOwner.call(authority,id),owned,faction};};
    axes.push({name:[safe,level,biome,layoutType,hold,owned,faction,name].join('/'),eligible:w['zoneMatchesSiteFilter'](zone,filter),ownerReads:reads});
  }
 }
}finally{authority.owner=originalOwner;}

reset();
const spawns=[];
for(const v of secret){
 const restore=seedGlobalRandom(515),world=makeSimWorld('warrior',515),d=world.doodads.length,actors=world.actors.length;
 try{
  assert(world.devForceVocationSite(v.id));const site=world['vocationSites'].at(-1)!;
  assert.equal(site.vocId,v.id);assert.equal(world.actors.at(-1),site.npc);
  const npc=site.npc,notes:any[]=[],positions:any[]=[],text=world.text.bind(world),dirty=world.markMetaDirty.bind(world);
  world.text=(...args)=>{notes.push([args[0],...args.slice(1)]);return text(...args);};
  world.markMetaDirty=(...args)=>{positions.push(args[0]===world.localSeat);return dirty(...args);};
  const key=vocationDiscoveryKey(v.id),snap=()=>({credit:world.ledger[key]??null,silent:site.silentNoted??null,count:notes.length,dirty:positions.length});
  world.player.pos={x:npc.pos.x+VOCATION_CFG.discoveryRadius+1,y:npc.pos.y};world['updateVocationSites']();const outside=snap();
  world.player.pos={x:npc.pos.x+VOCATION_CFG.discoveryRadius,y:npc.pos.y};world['updateVocationSites']();const edge=snap();
  world['updateVocationSites']();const repeat=snap();
  world.account.ledger[vocationLedgerKey(v.id)]=1;world['updateVocationSites']();const unlocked=snap();
  spawns.push({vocation:v.id,npc:npc.defId,tier:npc.tier,position:npc.pos,addedActors:world.actors.length-actors,dressing:world.doodads.slice(d),outside,edge,repeat,unlocked,notes,positions});
 }finally{restore();}
}
const natural: {seed:number;zone:string;sites:{vocation:string;npc:string|undefined;at:{x:number;y:number}}[];dressing:number}[]=[],loaded=[];
for(const seed of [0,1,193,999]){
 const restore=seedGlobalRandom(seed),world=makeSimWorld('warrior',seed);
 try{
  for(const zone of [...ZONE_LIST,...frontierZones(world,seed)]){
    const beforeNpcs=world.actors.length,beforeDressing=world.doodads.length;
    world['vocationSites']=[];world['placeVocationSites'](zone);
    const sites=world['vocationSites'].map(s=>({vocation:s.vocId,npc:s.npc.defId,at:s.npc.pos}));
    const count=sites.length,actors=world.actors.length,dressing=world.doodads.length;
    world['placeVocationSites'](zone);
    assert.equal(world['vocationSites'].length,count);assert.equal(world.actors.length,actors);assert.equal(world.doodads.length,dressing);
    natural.push({seed,zone:zone.id,sites,dressing:dressing-beforeDressing});
    world.actors.length=beforeNpcs;world.doodads.length=beforeDressing;
  }
  const present=natural.find(r=>r.seed===seed&&r.sites.length);
  if(present){
    world.loadZone(present.zone);
    const first=world['vocationSites'].map(s=>({vocation:s.vocId,npc:s.npc.defId,position:s.npc.pos}));
    assert.deepEqual(first.map(s=>s.vocation),present.sites.map(s=>s.vocation));
    world.loadZone('lastlight');world.loadZone(present.zone);
    const second=world['vocationSites'].map(s=>({vocation:s.vocId,npc:s.npc.defId,position:s.npc.pos}));
    assert.deepEqual(second.map(s=>s.vocation),first.map(s=>s.vocation));
    loaded.push({seed,zone:present.zone,first,second});
  }
 }finally{restore();}
}
assert(natural.some(s=>s.sites.length)&&loaded.length>0,'Need a naturally placed and reloaded site');
function visitHarbor(seed:number) {
  const restore=seedGlobalRandom(seed),world=makeSimWorld('warrior',seed);
  try {
    const anchor=world.zoneMap.lastlight,zone=placeZoneAt({x:anchor.map.x+770,y:anchor.map.y+480},anchor,world.zoneMap,718,
      {id:'__site_harbor_'+seed,level:30,seed,tileset:'meadow',noWeave:true});
    zone.harborhold=mintHoldState(HOLD_CLASSES.landing);world.zoneMap[zone.id]=zone;
    world.loadZone(zone.id);
    const capture=()=>({hold:zone.harborhold!.state,defenses:zone.harborhold!.defenses,
      stone:world['vocationSites'].filter(s=>s.vocId==='harborwarden').map(s=>({npc:s.npc.defId,pos:s.npc.pos})),credit:world.ledger[vocationDiscoveryKey('harborwarden')]??null});
    const before=capture();assert.equal(before.stone.length,0);
    // Provide the completed siege boundary, then execute the original reward,
    // prosperity, site placement and discovery. Siege combat is outside this course.
    world['holdDefense']={zoneId:zone.id,phase:'wave',wave:1,phaseAt:0,wardId:null,alive:new Set(),toSpawn:0,spawnAt:0,pulseAt:0};
    world['resolveHoldDefense'](true);const won=capture();
    assert.equal(won.hold,'open');assert.equal(won.stone.length,1);
    world['placeVocationSites'](zone);assert.deepEqual(capture(),won);
    const npc=world['vocationSites'].find(s=>s.vocId==='harborwarden')!.npc;
    world.player.pos={...npc.pos};world['updateVocationSites']();const heard=capture();assert.equal(heard.credit,1);
    world.loadZone('lastlight');world.loadZone(zone.id);const revisit=capture();assert.equal(revisit.stone.length,1);assert.equal(revisit.credit,1);
    return {seed,before,won,heard,revisit};
  }finally{restore();}
}
const harbors=[0,193].map(visitHarbor);
assert(spawns.every(s=>s.addedActors===1&&s.outside.credit===null&&s.unlocked.credit===1));
fs.writeFileSync(process.argv[2],JSON.stringify({filterCases,axes,spawns,natural,loaded,harbors})+'\n',{flag:'wx'});
console.log({vocations:secret.length,zones:ZONE_LIST.length,filters:filterCases.length,placements:natural.length,placed:natural.filter(s=>s.sites.length).length});
