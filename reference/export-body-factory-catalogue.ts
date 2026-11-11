// Original-only factory census. These are direct construction calls, not AI,
// complete spawn/death scheduling, private construction or device measurements.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {MONSTERS} from '../src/data/monsters';
import {SKILLS} from '../src/data/skills';
import {SUPPORTS} from '../src/data/supports';
import {Actor} from '../src/engine/actor';
import {StatSheet} from '../src/engine/stats';
import {monsterSkillLevelOf} from '../src/engine/world';

bootSimEngine();
const restore=seedGlobalRandom(0x5fac70),rows:unknown[]=[];
const fields=['ambushArmed','adorn','aims','anchored','brain','brainVariant','breathes','carriedGear','cling','color','deathBurst','defId','driven','explodeOnDeath','facing','facingPrev','faction','flying','flyingBase','fromZoneGen','grabbable','habitat','immuneGround','invulnerable','juvenile','kind','level','levitates','look','material','movementTetherSpec','onHitByType','onHitTypeIcd','passive','pathCosts','plies','pliesMax','plySpec','postSpec','radius','refuge','reserveSpecs','rootedSpec','shape','shellGuard','spawnScale','spawnedAt','squish','stationary','tag','tellSpecs','tone','tune','turnSpeed','untargetable','volatile','wake','watch','worm','wornConduits','xpValue'] as const;
const borrowed=[['cling','cling'],['watch','watch'],['movementTetherSpec','movementTether'],['deathBurst','deathBurst'],['refuge','refuge'],['habitat','habitat'],['wake','wake'],['reserveSpecs','reserves'],['rootedSpec','rooted'],['volatile','volatile'],['onHitByType','onHitByType'],['tune','tune'],['immuneGround','immuneGround'],['pathCosts','pathCosts']] as const;
function snapshot(a:Actor){
 const values=a as unknown as Record<string,unknown>;
 return{fields:Object.fromEntries(fields.map(key=>[key,values[key]])),id:a.id,name:a.name,team:a.team,pos:a.pos,ownerId:a.owner?.id,
  bases:[...(a.sheet as unknown as {baseOverrides:Map<string,number>}).baseOverrides],sources:a.sheet.sourceNames().map(name=>({name,mods:a.sheet.getSourceMods(name)})),
  resources:{life:a.life,maxLife:a.maxLife(),mana:a.mana,maxMana:a.maxMana(),es:a.es,maxEs:a.maxEs(),poise:a.poise,maxPoise:a.maxPoise(),insight:a.insight,maxInsight:a.maxInsight(),endurance:a.endurance,maxEndurance:a.maxEndurance()},
  reserves:a.reserves?[...a.reserves]:undefined,statuses:a.statuses,
  skills:a.skills.map(s=>s?{id:s.def.id,level:s.level,treeNodes:s.treeNodes,sockets:s.sockets.map(x=>x?{id:x.def.id,level:x.level,forwarded:x.forwarded}:null),grafts:s.grafts?.map(x=>({id:x.def.id,level:x.level}))}:null)};
}
try{
 const world=makeSimWorld('magician',0x5fac70);world.walk=null;world.time=17;world.actors=[world.player];
 const host=world as unknown as {zoneGenTagging:boolean;bombardMintRev:number;relayStatus:Actor['statusRelay']};host.zoneGenTagging=true;
 const owner=new Actor('factory-census-owner','player',{x:80,y:80});owner.sheet=new StatSheet();owner.sheet.setBase('minionDamage',1.25);owner.sheet.setBase('minionLife',1.5);
 const catalogue=Object.keys(MONSTERS).sort(),coverage:Record<string,number>={};assert(catalogue.length>100);
 for(const defId of catalogue){
  const def=MONSTERS[defId];for(const key of Object.keys(def))coverage[key]=(coverage[key]??0)+1;
  const levels=[...new Set([1,17,...(def.grants??[]).flatMap(g=>[Math.max(1,g.atLevel-1),g.atLevel]),...(def.boons??[]).flatMap(b=>b.minLevel?[Math.max(1,b.minLevel-1),b.minLevel]:[])])].sort((a,b)=>a-b);
  for(const level of levels)for(const owned of [false,true]){
   const seed=0x5fac70+rows.length,caseRestore=seedGlobalRandom(seed),random=Math.random;let draws=0;
   const beforeActors=world.actors.slice(),revision=host.bombardMintRev;
   Math.random=()=>{draws++;return random();};let a:Actor;
   try{a=world.createMonster(defId,level,owned?'player':'enemy',owned?owner:undefined);}
   finally{Math.random=random;caseRestore();}
   assert.equal(a.defId,defId);assert.equal(a.level,level);assert.equal(a.owner,owned?owner:undefined);assert.equal(a.name,def.name);
   assert.equal(a.statusRelay,host.relayStatus);assert.equal(a.spawnedAt,17);assert.deepEqual(world.actors,beforeActors);assert(!world.actors.includes(a));
   assert.equal(host.bombardMintRev-revision,def.bombard?1:0);assert.equal(!!a.fromZoneGen,!owned);
   assert.deepEqual(a.pos,{x:0,y:0});assert.notEqual(a.pos,owner.pos);
   assert.equal(a.life,a.maxLife());assert.equal(a.mana,a.maxMana());assert.equal(a.es,a.maxEs());assert.equal(a.poise,a.maxPoise());assert.equal(a.insight,a.maxInsight());assert.equal(a.endurance,a.maxEndurance());
   assert.equal(a.invulnerable,!!def.invulnerable);assert.equal(a.untargetable,!!def.untargetable || !!(def.ambush && !def.ambush.visible),defId);assert.equal(!!a.ambushArmed,!!def.ambush,defId);assert.equal(a.levitates,!!def.levitates);
   if(owned){assert.equal(a.kind,'minion');assert.deepEqual(a.sheet.getSourceMods('owner')?.map(m=>[m.stat,m.value]),[['damage',.25],['life',.5]]);}
   if(def.cling)assert.equal(a.cling,def.cling);if(def.post&&def.post!==true)assert.equal(a.postSpec,def.post);
   if(def.base.moveSpeed===0)assert(a.stationary);assert.equal(a.anchored,(def.base.moveSpeed??1)<=0&&!def.orbDrops);
   const identities=borrowed.filter(([,key])=>!!def[key]).map(([key,source])=>{assert.equal((a as unknown as Record<string,unknown>)[key],def[source],defId+': '+key);return key;});
   if(def.reserves?.length){assert.equal(a.reserveSpecs,def.reserves);assert(a.reserves);for(const spec of def.reserves)assert(a.reserves.has(spec.id));}
   if(def.worm){assert(a.worm);assert.notEqual(a.worm,def.worm);assert.deepEqual(a.worm.segments,[]);}
   if(def.shellGuard){assert(a.shellGuard);assert.notEqual(a.shellGuard,def.shellGuard);assert.equal(a.shellGuard.pool,def.shellGuard.max);}
   for(const skill of a.skills){assert(skill);assert.equal(skill.def,SKILLS[skill.def.id]);assert.equal(skill.level,monsterSkillLevelOf(level));for(const socket of skill.sockets)if(socket)assert.equal(socket.def,SUPPORTS[socket.def.id]);}
   rows.push(JSON.parse(JSON.stringify({label:defId+':'+level+':'+(owned?'owned':'hostile'),seed,draws,borrowed:identities,bombardRevisionDelta:host.bombardMintRev-revision,body:snapshot(a)})));
  }
 }
 writeFileSync(process.argv[2],JSON.stringify({scope:'original-body-factory-catalogue-draft/v1',catalogue,coverage,rows,limits:['Every loaded definition at levels 1 and 17 plus its authored grant/boon thresholds and their preceding levels, in hostile and owner-bound contexts.','No world ticks, AI, deaths, multiplayer party scale, explicit scale override or exception injection in this census. Those need separate courses.','Snapshots record selected factory fields, stat sources, skills, resources, RNG draws and borrowed identity assertions; they are not general actor serialization.']}),{flag:'wx'});
}finally{restore();}
