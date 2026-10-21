import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {gunzipSync} from 'node:zlib';
import {ContainerLayout} from '../dist/container-layout.js';import {SeatRules,SeatGeometry,relicPowerActive} from '../dist/seat-rules.js';
const fixture=JSON.parse(gunzipSync(fs.readFileSync(new URL('../baseline/milestone-thirteen/containers.json.gz',import.meta.url))));
const pack={amplifiers:Object.values(fixture.authored.amplifiers),relicCaps:fixture.authored.relicCaps,relicBaseline:fixture.authored.relicBaseline},rules=new SeatRules(pack);
test('seat geometry and raw amplification match 600 original neighbourhoods including overlaps, masks and repeated UIDs',()=>{
 const geometry=new SeatGeometry(i=>fixture.authored.bases[i.baseId]??{w:1,h:1},(mods,mode)=>rules.power(mods,mode));
 for(const row of fixture.seats){const items=structuredClone(row.items),mods=structuredClone(row.mods),board=new ContainerLayout(fixture.definitions[row.definition].ladder).board(new Set(row.features)),before=JSON.stringify({items,mods,board});
  const hood=geometry.neighbourhood(board,items),amps=geometry.amplification(board,items,it=>mods[items.indexOf(it)]);
  const actual=items.map((it,i)=>{const factor=amps.get(it);return {neighbours:hood.get(it).pieces.map(p=>items.indexOf(p)),empty:hood.get(it).empty,factor,
   raw:['outward','solitude','communion'].map(mode=>rules.power(mods[i],mode)),amplified:rules.amplify(mods[i],factor),empowered:rules.empower(mods[i],row.power,factor),numeric:mods[i].map(m=>rules.numeric(m)),uniqueValues:mods[i].map(m=>rules.uniqueValue(m))};});
  // Compare through the original observer's JSON boundary (-0 serializes as 0).
  // The separate arithmetic test below also pins signed zero before serialization.
  assert.deepEqual(JSON.parse(JSON.stringify(actual)),row.results);assert.equal(JSON.stringify({items,mods,board}),before);
 }
 assert(geometry.scratchBytes<=16384);
});
test('every original relic numeric cap preserves tradeoffs, feedback and structural lines across 2816 power cases',()=>{
 for(const row of fixture.powerCases){assert.deepEqual(rules.empower(row.mods,row.power,row.seatFactor),row.result);assert.deepEqual(row.mods.map(m=>rules.numeric(m)),row.numeric);assert.deepEqual(row.mods.map(m=>rules.uniqueValue(m)),row.uniqueValues);}
 assert.equal(fixture.powerCases.length,2816);
});
test('two neighbouring crowns amplify raw damage once and never amplify each other’s amplifier',()=>{
 const geometry=new SeatGeometry(i=>i,(mods,mode)=>rules.power(mods,mode)),a={uid:1,x:0,y:0,w:1,h:1},b={uid:2,x:1,y:0,w:1,h:1},board={w:2,h:1,open:[true,true],cells:2};
 const lines=[{stat:'seatPower_outward',kind:'flat',value:.5},{stat:'damage',kind:'increased',value:10}];
 const factors=geometry.amplification(board,[a,b],()=>lines);assert.deepEqual([...factors.values()],[1.5,1.5]);
 assert.deepEqual(rules.amplify(lines,factors.get(a)),[{stat:'damage',kind:'increased',value:15}]);
 const plain=[lines[1]];assert.equal(rules.amplify(plain,1),plain);assert.equal(rules.amplify(lines,1)[0],lines[1]);
 assert(Object.is(rules.amplify([{stat:'damage',kind:'flat',value:-1}],0)[0].value,-0));
 assert.equal(relicPowerActive(true),false);assert.equal(relicPowerActive(undefined,false),false);assert.equal(relicPowerActive(undefined),true);
 const negative={stat:'damage',kind:'flat',value:-10},feedback={stat:'life',kind:'flat',value:1,fromStat:'mana'};
 const result=rules.empower([negative,feedback,{stat:'castSpeed',kind:'increased',value:1}],100,2);assert.equal(result[0],negative);assert.equal(result[1],feedback);assert.equal(result[2].value,2);
 const privatePack=structuredClone(pack),owned=new SeatRules(privatePack);privatePack.relicCaps.find(r=>r.stat==='castSpeed').cap=0;assert.equal(owned.empower([{stat:'castSpeed',kind:'flat',value:1}],10)[0].value,2);
 assert.throws(()=>new SeatRules({...pack,relicCaps:[{stat:'x',cap:Infinity}]}));assert.throws(()=>rules.amplify(plain,NaN));assert.throws(()=>rules.empower(plain,Infinity));
});
test('live footprint replacement is observed; reentrant or failing ports release scratch without changing inputs',()=>{
 const board={w:3,h:1,open:[true,true,true],cells:3},a={uid:1,x:0,y:0,w:1,h:1},b={uid:2,x:2,y:0,w:1,h:1},items=[a,b];let reenter=false,fail=false;
 const geometry=new SeatGeometry(it=>{if(reenter)geometry.neighbourhood(board,items);if(fail)throw Error('port failure');return it;},(mods,mode)=>rules.power(mods,mode));
 assert.equal(geometry.neighbourhood(board,items).get(a).pieces.length,0);a.w=2;assert.deepEqual(geometry.neighbourhood(board,items).get(a).pieces,[b]);
 const before=JSON.stringify(items);reenter=true;assert.throws(()=>geometry.neighbourhood(board,items),/Reentrant/);reenter=false;fail=true;assert.throws(()=>geometry.neighbourhood(board,items),/port failure/);fail=false;
 assert.deepEqual(geometry.neighbourhood(board,items).get(a).pieces,[b]);assert.equal(JSON.stringify(items),before);
});
