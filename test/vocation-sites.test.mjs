import test from 'node:test';
import assert from 'node:assert/strict';
import {matchesVocationSite,discoverVocationSites,placeVocationSites,spawnVocationSite} from '../dist/vocation-sites.js';

test('zones short-circuit territory reads and query a live owner on each visit',()=>{
  const reads=[],owner={faction:'grove',owned:false},ports={patronFaction:()=>{reads.push('patron');return 'grove';},owner:()=>{reads.push('owner');return owner;}};
  const zone={id:'z',level:30,biome:'woods',objective:{kind:'safe'},layoutType:'glade',harborhold:{state:'open'}};
  const filter={minLevel:30,biomes:['woods'],patronFactions:['grove'],controllingFactions:['grove'],layouts:['glade'],harborhold:'open'};
  assert.equal(matchesVocationSite(zone,filter,ports),false);assert.deepEqual(reads,[]);
  zone.objective.kind='field';assert.equal(matchesVocationSite(zone,filter,ports),false);owner.owned=true;
  assert.equal(matchesVocationSite(zone,filter,ports),true);assert.deepEqual(reads,['patron','owner','patron','owner']);
});

test('placement preserves draw order and forwards its one random stream into the host spawn',()=>{
  const rows=['normal','standing','equal','placed','also'].map(id=>({id,secret:id==='normal'?undefined:{site:{chance:.5,filter:{},npc:'keeper'}}}));
  const calls=[];let name;
  const ports={definitions:()=>rows,standing:id=>id==='standing',qualifies:()=>true,runSeed:()=>-1,
    hash(key){name=key;calls.push(key);return 0;},random(seed){assert.equal(seed,4294967295);const draws=name.includes('equal')?[.5]:[.1,.4,.6];return {range(lo,hi){calls.push([lo,hi]);return draws.shift();}};},
    width:()=>10,height:()=>20,point:(x,y)=>[x,y],spawn(id,at,rng){assert.deepEqual(at,[4,12]);assert.equal(typeof rng.range,'function');calls.push(id);return false;}};
  placeVocationSites({id:'map'},ports);
  assert.deepEqual(calls,['vocsite_equal_map',[0,1],'vocsite_placed_map',[0,1],[.3,.7],[.3,.7],'placed','vocsite_also_map',[0,1],[.3,.7],[.3,.7],'also']);
});

test('failure after publishing an opaque NPC preserves that publication and skips its dressing',()=>{
  const seen=[];const ports={definition:id=>({id,secret:{site:{npc:'keeper',doodads:[{}]}}}),npcAvailable:()=>true,zoneLevel:()=>0,
    createNpc(id,level){assert.equal(level,1);return 0;},radius:n=>n,clearSpot:at=>at+1,setPosition:(n,at)=>seen.push([n,at]),
    publishNpc:n=>seen.push(n),publishSite:()=>{throw Error('site ledger unavailable');}};
  assert.throws(()=>spawnVocationSite('test',10,{range(){throw Error('unexpected draw');}},ports),/site ledger unavailable/);
  assert.deepEqual(seen,[[0,11],0]);
});

test('dressing borrows the current NPC position and preserves authored random bounds',()=>{
  const ranges=[],points=[],events=[];let anchor=10;
  const rng={range(lo,hi){ranges.push([lo,hi]);return hi;}};
  const ports={definition:id=>({id,secret:{site:{npc:'s',doodads:[{kind:'stone',count:2,radius:8,size:[1,2]}]}}}),npcAvailable:()=>true,zoneLevel:()=>5,
    createNpc:()=>0,radius:()=>3,clearSpot:(p,r)=>{events.push(r);return p;},setPosition:()=>{},publishNpc:()=>{},publishSite:()=>{},
    radialPoint:()=>anchor,publishDoodad(at,radius,kind,rotation){points.push([at,radius,kind,rotation]);anchor++;}};
  assert(spawnVocationSite('s',20,rng,ports));assert.deepEqual(events,[3,2,2]);assert.deepEqual(points,[[10,2,'stone',Math.PI*2],[11,2,'stone',Math.PI*2]]);
  assert.deepEqual(ranges,Array.from({length:2},()=>[[0,Math.PI*2],[4,8],[1,2],[0,Math.PI*2]]).flat());
});

test('discovery sets the one-time silence before a callback and the run credit before reentry',()=>{
  const sites=[{vocId:'x',npc:0}],ledger={},account={},calls=[];const ports={definition:()=>({id:'x',secret:{},name:'X',color:'red',classId:'mage'}),
    dead:()=>false,runLedger:()=>ledger,accountLedger:()=>account,distanceFromPlayer:()=>5,discoveryRadius:()=>5,classId:()=>'warrior',
    cue(n,offset){assert.equal(n,0);calls.push(offset);discoverVocationSites(sites,ports);},markCharacterDirty(){calls.push('dirty');}};
  discoverVocationSites(sites,ports);assert.deepEqual(calls,[-40]);assert(sites[0].silentNoted);assert.deepEqual(ledger,{});
  account.vocation_unlocked_x=1;discoverVocationSites(sites,ports);assert.deepEqual(calls,[-40,-44,'dirty']);assert.equal(ledger.vocation_discovered_x,1);
});

test('a discovery cue failure keeps the committed run increment and prevents dirty notification',()=>{
  const ledger={vocation_discovered_x:-1},sites=[{vocId:'x',npc:0}];let dirty=false;
  const ports={definition:()=>({secret:{classLockedDiscovery:false},name:'X',color:'red',classId:'mage'}),dead:()=>false,
    runLedger:()=>ledger,accountLedger:()=>({}),distanceFromPlayer:()=>0,discoveryRadius:()=>0,classId:()=>{throw Error('unexpected class read');},
    cue(){throw Error('cue failed');},markCharacterDirty(){dirty=true;}};
  assert.throws(()=>discoverVocationSites(sites,ports),/cue failed/);assert.equal(ledger.vocation_discovered_x,0);assert.equal(dirty,false);
});

test('placement captures the chosen vocation and spawn method before position draws',()=>{
  const def={id:'first',secret:{site:{chance:1,filter:{},npc:'keeper'}}},events=[];
  const ports={definitions:()=>[def],standing:()=>false,qualifies:()=>true,runSeed:()=>0,hash:()=>0,
    random:()=>({range(min){if(min===0.3){def.id='changed';ports.spawn=()=>{throw Error('late spawn lookup');};}return min;}}),
    width:()=>10,height:()=>20,point:(x,y)=>[x,y],spawn(id,at){assert.equal(this,ports);events.push([id,at]);return true;}};
  placeVocationSites({id:'zone'},ports);
  assert.deepEqual(events,[['first',[3,6]]]);
});
