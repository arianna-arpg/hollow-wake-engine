import assert from 'node:assert/strict';
import { makeSimWorld } from '../src/sim/arena';
import { ASHEN_KENNELS } from '../src/data/tetheredHabitats';
import { validateAuthoredMap } from '../src/engine/authoredMaps';
import { MONSTERS } from '../src/data/monsters';
import { ROOTWILD_MONSTERS } from '../src/data/rootwildMonsters';
import { DOODAD_VISUALS } from '../src/data/doodadVisuals';
import { movementTetherDistance, movementTetherErrors } from '../src/engine/movementTether';
import { updateAI } from '../src/engine/ai';
import { seedGlobalRandom } from '../src/sim/rng';
import { START_ZONE } from '../src/data/zones';
import { setSimTap } from '../src/engine/tap';
import { lairLandmarkRolls } from '../src/engine/lairs';
import { generateLayout } from '../src/engine/levelgen';
import { Rng } from '../src/core/rng';

const restore = seedGlobalRandom(0xcee1);
assert.deepEqual(validateAuthoredMap(ASHEN_KENNELS), []);
assert.equal(MONSTERS.gravebound_shade.movementTether?.anchorDoodad, 'tombstone');
assert.equal(MONSTERS.rootlash_snapper.movementTether?.anchorDoodad, 'vine_coil');
const rooted = Object.values(ROOTWILD_MONSTERS).filter(d => d.movementTether);
assert.equal(rooted.length, 5);
for (const def of rooted) {
  assert.deepEqual(movementTetherErrors(def.movementTether!), []);
  assert.ok(DOODAD_VISUALS[def.movementTether!.anchorDoodad!]);
}
assert.ok(movementTetherErrors({length:100,opacity:NaN}).length);
assert.ok(movementTetherErrors({length:100,glow:{width:10,opacity:2}}).length);
assert.ok(movementTetherErrors({length:100,glow:{width:Infinity,opacity:0.2}}).length);

const w = makeSimWorld('warrior', 0xcee1);
for (const biome of ['steppes','volcanic']) {
  const eligible=(level:number)=>lairLandmarkRolls({place:'surface',biome,level,tileset:'hell_steppes'})
    .some(r=>r.landmark==='ashen_kennel_mouth');
  assert.ok(eligible(8)); assert.ok(!eligible(7));
}
const surface={...w.zone,level:8,layout:[],exits:[],landmarks:[{landmark:'ashen_kennel_mouth',chance:1}]};
const generate=()=>generateLayout(surface,surface.size,new Rng(90210),{x:140,y:650},[{x:1400,y:650}]);
const layout=generate(); assert.deepEqual(layout,generate());
assert.equal(layout.doodads.filter(d=>d.kind==='ashen_kennel_gate').length,1);
const parentId=w.zone.id;
w.player.sheet.setBase('life',90000); w.player.life=90000;
// Enter through production sidezone mint/load, not a mock encounter spawner.
(w as any).enterSidezone({pos:{...w.player.pos},seed:413,kind:'ashen_kennel_gate'});
const kennelId = w.zone.id;
assert.equal(w.zone.layoutParams?.authored, ASHEN_KENNELS.id);
const master = w.actors.find(a => a.defId === 'ashen_houndmaster')!;
const hounds = w.actors.filter(a => a.defId === 'stakebound_hound');
assert.ok(master); assert.equal(hounds.length,3);
assert.equal(w.actors.filter(a => a.team === 'enemy' && !a.dead && !a.passive).length,4);
for (let i=0;i<180;i++) w.update(1/60);
assert.ok(hounds.every(a=>a.bondHeld && a.bondFrom === master));
assert.ok(hounds.every(a=>a.sheet.get('attackSpeed') > 1));
const roots=hounds.map(a=>({...a.movementTether!.point}));
const casts=new Set<string>();
setSimTap({onCast(c,s){if(c===master) casts.add(s.def.id);}});
// Draw them south: live AI still cannot drag their posts with them.
w.player.pos={x:600,y:650};
for (let i=0;i<600;i++) {
  for (const a of [master,...hounds]) updateAI(a,w,1/60);
  w.update(1/60);
  for (const a of hounds) assert.ok(movementTetherDistance(a.movementTether!,a.pos)<=235.001);
}
for (let i=0;i<hounds.length;i++) assert.deepEqual(hounds[i].movementTether!.point,roots[i]);
assert.ok(casts.has('rallying_howl'), 'Houndmaster never rallies his crew');
// The posted keeper does not chase the player across the yard. His lash is
// melee: approach his post before requiring an attack from the live AI.
w.player.pos={x:master.pos.x,y:master.pos.y+75};
for (let i=0;i<180;i++) {
  for (const a of [master,...hounds]) updateAI(a,w,1/60);
  w.update(1/60);
  for (const a of hounds) assert.ok(movementTetherDistance(a.movementTether!,a.pos)<=235.001);
}
setSimTap(null);
assert.ok(casts.has('hellfire_lash'), 'Houndmaster never fights through his skill bar');
w.kill(master,false,w.player);
for (let i=0;i<60;i++) w.update(1/60);
assert.ok(hounds.every(a=>!a.bondHeld && !a.bondFrom));
const positions=hounds.map(a=>({...a.pos}));
w.loadZone(START_ZONE);
const saved=JSON.parse(JSON.stringify(w.serializeWorldState()));
w.loadZone(kennelId);
assert.ok(!w.actors.some(a=>a.defId==='ashen_houndmaster' && !a.dead));
const returned=w.actors.filter(a=>a.defId==='stakebound_hound' && !a.dead);
assert.equal(returned.length,3);
for (let i=0;i<3;i++) {
  assert.deepEqual(returned[i].movementTether!.point,roots[i]);
  assert.deepEqual(returned[i].pos,positions[i]);
}
const resumed=makeSimWorld('warrior',0xcee2);
assert.ok(resumed.adoptWorldState(saved)); resumed.loadZone(parentId);
(resumed as any).enterSidezone({pos:{...resumed.player.pos},seed:413,kind:'ashen_kennel_gate'});
assert.equal(resumed.zone.id,kennelId);
assert.equal(resumed.actors.filter(a=>a.defId==='stakebound_hound' && !a.dead).length,3);
assert.ok(!resumed.actors.some(a=>a.defId==='ashen_houndmaster' && !a.dead));
for (const a of resumed.actors.filter(a=>a.defId==='stakebound_hound' && !a.dead)) resumed.kill(a,false,resumed.player);
resumed.update(0.2);
assert.ok((resumed as any).objectiveDone,'Defeating the kennel crew must complete its objective');
restore();
console.log('PASS tether ecology: shared scenery, five rooted plants, exact kennel crew, leadership, reach and durable visits');
