// Original-only diagnostic construction order and branch contracts. Temporary
// definitions and prototype hooks are restored even if an assertion fails.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {MONSTERS,type MonsterDef} from '../src/data/monsters';
import {SKILLS} from '../src/data/skills';
import {Actor} from '../src/engine/actor';
import {StatSheet} from '../src/engine/stats';
import {treeGraph} from '../src/engine/skilltree';

bootSimEngine();const restore=seedGlobalRandom(0x5fac71),probe='hwe_body_factory_order_diagnostic',rows:unknown[]=[];
assert(!MONSTERS[probe]);
type Host={stampMonsterLevel(a:Actor,d:MonsterDef,level:number):void;applyPartyScale(a:Actor):void;bombardMintRev:number};
function fixture(){
 const w=makeSimWorld('magician',0x5fac71),owner=new Actor('factory-owner','player',{x:80,y:80});
 owner.sheet=new StatSheet();owner.sheet.setBase('minionDamage',1.25);owner.sheet.setBase('minionLife',1.5);
 w.walk=null;w.time=37;w.actors=[owner];
 const def:MonsterDef={id:probe,name:'Factory diagnostic',color:'#abcdef',shape:'circle',radius:16,base:{life:100,mana:20,moveSpeed:100},skills:['cleave'],xp:10};
 MONSTERS[probe]=def;const host=w as unknown as Host;
 const c={w,owner,def,host,events:[] as unknown[],body:undefined as Actor|undefined,result:undefined as Actor|undefined,error:undefined as string|undefined,draws:0,random:.25,level:1,owned:false,scale:undefined as number|undefined};
 const stamp=host.stampMonsterLevel.bind(w);host.stampMonsterLevel=(a,d,level)=>{c.body=a;c.events.push({kind:'stamp',relay:!!a.statusRelay,bombardRevision:host.bombardMintRev,life:a.life,level:a.level});stamp(a,d,level);};
 return c;
}
type Context=ReturnType<typeof fixture>;
function snapshot(c:Context){const a=c.body;return{error:c.error,draws:c.draws,worldIds:c.w.actors.map(a=>a.id),bombardRevision:c.host.bombardMintRev,events:c.events,body:a?{id:a.id,name:a.name,defId:a.defId,color:a.color,level:a.level,kind:a.kind,ownerId:a.owner?.id,life:a.life,maxLife:a.maxLife(),radius:a.radius,spawnScale:a.spawnScale,juvenile:a.juvenile,brainVariant:a.brainVariant,look:a.look,spawnedAt:a.spawnedAt,skills:a.skills.map(s=>s&&{id:s.def.id,level:s.level,treeNodes:s.treeNodes}),sources:a.sheet.sourceNames().map(id=>({id,mods:a.sheet.getSourceMods(id)}))}:null};}
function course(label:string,setup:(c:Context)=>void,check:(c:Context)=>void){
 const c=fixture(),originalFill=Actor.prototype.fillResources,random=Math.random;
 try{setup(c);Math.random=()=>{c.draws++;return c.random;};try{c.result=c.w.createMonster(probe,c.level,c.owned?'player':'enemy',c.owned?c.owner:undefined,c.scale===undefined?undefined:{scale:c.scale});}catch(e){c.error=String(e);}check(c);rows.push(JSON.parse(JSON.stringify({label,...snapshot(c)})));}
 finally{Actor.prototype.fillResources=originalFill;Math.random=random;delete MONSTERS[probe];}
}
const good=(c:Context)=>{assert.equal(c.error,undefined);assert(c.result&&c.result===c.body);assert(!c.w.actors.includes(c.result));return c.result;};
try{
 const pinSkill=Object.values(SKILLS).find(s=>treeGraph(s)?.rootChildren.some(id=>treeGraph(s)!.nodes.get(id)!.ranks===1));assert(pinSkill);
 const pin=treeGraph(pinSkill)!.rootChildren.find(id=>treeGraph(pinSkill)!.nodes.get(id)!.ranks===1)!;
 course('diagnostic-pins-validate-structure-without-level-budget-and-own-each-result',c=>{c.def.skills=[pinSkill.id,pinSkill.id];c.def.skillTrees={[pinSkill.id]:[pin,pin,'hwe_missing_pin']};},c=>{
  const a=good(c),first=a.skills[0]!,second=a.skills[1]!;assert.equal(first.level,1);assert.deepEqual(first.treeNodes,[pin]);assert.deepEqual(second.treeNodes,[pin]);assert.notEqual(first,second);assert.notEqual(first.treeNodes,second.treeNodes);assert.notEqual(first.treeNodes,c.def.skillTrees![pinSkill.id]);assert.deepEqual(c.def.skillTrees![pinSkill.id],[pin,pin,'hwe_missing_pin']);
 });
 for(const value of [.5,0,Number.NaN,Number.POSITIVE_INFINITY]){
  course('diagnostic-scale-override:'+String(value),c=>{c.def.scaleVariance=[.5,1.5];c.def.scaleStats=true;c.def.juvenileBelow=.75;c.scale=value;},c=>{
   const a=good(c),valid=Number.isFinite(value)&&value>0,expected=valid?value:.75;assert.equal(a.spawnScale,expected);assert.equal(a.radius,16*expected);assert.equal(c.draws,valid?0:1);assert(a.juvenile);assert.deepEqual(a.sheet.getSourceMods('scaleVar')?.map(m=>[m.stat,m.value]),[['life',expected-1],['damage',expected-1]]);
  });
 }
 const minds=Object.values(MONSTERS).flatMap(d=>d.brain?[d.brain]:[]);assert(minds.length>1);
 for(const value of [1/3,.5])course('diagnostic-personality-boundary:'+value,c=>{c.random=value;c.def.brainVariants=[{weight:1,brain:minds[0]},{weight:2,brain:minds[1]}];},c=>{const a=good(c),index=value===1/3?0:1;assert.equal(c.draws,1);assert.equal(a.brainVariant,index);assert.equal(a.brain,minds[index]);});
 course('owner-query-mutation-observes-early-color-and-late-kit-reads',c=>{c.owned=true;const get=c.owner.sheet.get.bind(c.owner.sheet);c.owner.sheet.get=(stat,...args)=>{c.events.push({kind:'owner-query',stat});if(stat==='minionDamage'){c.def.color='#123456';c.def.skills=['heavy_strike'];}return get(stat,...args);};},c=>{const a=good(c);assert.equal(a.color,'#abcdef');assert.deepEqual(a.skills.map(s=>s?.def.id),['heavy_strike']);assert.deepEqual(c.events.filter((e:any)=>e.kind==='owner-query').map((e:any)=>e.stat),['minionDamage','minionLife']);});
 course('dialogue-appearance-overrides-authored-look',c=>{c.def.look='skeleton';c.w.npcDialogues.appearanceFor=id=>{c.events.push({kind:'appearance',id});return 'wraith';};},c=>{assert.equal(good(c).look,'wraith');assert.deepEqual(c.events.filter((e:any)=>e.kind==='appearance'),[{kind:'appearance',id:probe}]);});
 const bombard=Object.values(MONSTERS).find(d=>!!d.bombard)?.bombard;assert(bombard);
 course('party-failure-retains-mint-and-level-before-owner-and-fill',c=>{c.def.bombard=bombard;c.host.applyPartyScale=a=>{c.events.push({kind:'party',sameBody:a===c.body});throw Error('diagnostic-party-failure');};},c=>{assert.match(c.error??'',/diagnostic-party-failure/);assert.equal(c.result,undefined);assert(c.body);assert.equal(c.host.bombardMintRev,1);assert.equal(c.body.life,1);assert(c.body.sheet.sourceNames().includes('level'));assert(!c.body.owner);assert.equal(c.body.skills.length,0);assert(!c.w.actors.includes(c.body));});
 course('appearance-failure-retains-owner-source-and-size-before-skills',c=>{c.owned=true;c.def.scaleVariance=[.5,1.5];c.scale=.5;c.w.npcDialogues.appearanceFor=()=>{throw Error('diagnostic-appearance-failure');};},c=>{assert.match(c.error??'',/diagnostic-appearance-failure/);assert(c.body);assert.equal(c.body.owner,c.owner);assert(c.body.sheet.sourceNames().includes('owner'));assert.equal(c.body.radius,8);assert.equal(c.body.life,1);assert.equal(c.body.skills.length,0);assert(!c.w.actors.includes(c.body));});
 course('fill-failure-retains-complete-kit-before-return-and-publication',c=>{Actor.prototype.fillResources=function(this:Actor){c.events.push({kind:'fill',sameBody:this===c.body,skills:this.skills.map(s=>s?.def.id),spawnedAt:this.spawnedAt});throw Error('diagnostic-fill-failure');};},c=>{assert.match(c.error??'',/diagnostic-fill-failure/);assert(c.body);assert.equal(c.result,undefined);assert.equal(c.body.life,1);assert.deepEqual(c.body.skills.map(s=>s?.def.id),['cleave']);assert.equal(c.body.spawnedAt,37);assert(!c.w.actors.includes(c.body));});
 assert.equal(rows.length,12);
 writeFileSync(process.argv[2],JSON.stringify({scope:'original-body-factory-order-draft/v1',pinSkill:pinSkill.id,pin,rows,limits:['Diagnostic definitions and throwing host callbacks supplement the loaded-catalogue census.','The party failure course checks callback order, not multiplayer party arithmetic.','Private body ownership, actual world publication and device performance remain separate.']}),{flag:'wx'});
}finally{delete MONSTERS[probe];restore();}
