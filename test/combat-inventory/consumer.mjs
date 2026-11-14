import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=name=>JSON.parse(fs.readFileSync(new URL(import.meta.resolve(name)),'utf8'));
const content=read('@hollow-wake/engine/content/milestone-one.json');
const buildContent=read('@hollow-wake/character-builds/builds.json');
// Loading data is the host's job. Gameplay receives no storage, quest, account
// owner, browser, wall clock, network or global random service.
Math.random=()=>assert.fail('Ambient randomness used');
globalThis.fetch=()=>assert.fail('Network used');
for(const key of ['window','document','localStorage'])Object.defineProperty(globalThis,key,{get(){assert.fail('Ambient '+key+' used');}});
const {Engine,CastRuntime,TimedDamage,Inventory}=await import('@hollow-wake/engine');
const {createCharacterBuilds}=await import('@hollow-wake/character-builds');

const engine=new Engine(content,42),hero=engine.character({classId:'magician',passivePoints:1});
hero.equip('lapis-reference','ring1');hero.allocate('cross_int_pursuit');
const skill=engine.skill({id:'ruin',level:5,sockets:2,treePoints:1,supports:[{id:'corrosion',level:2},{id:'measured_blows',level:1}],nodes:['ruin_studies']});
const profile=engine.castProfile(hero,skill),cast=new CastRuntime({mana:100,life:100});
assert.equal(cast.press(profile).kind,'started');assert.equal(cast.mana,100-profile.cost.mana);
assert.equal(cast.press(profile).kind,'rejected');
const completed=cast.advance(10);assert.equal(completed.kind,'completed');assert.equal(completed.skillId,'ruin');
assert.equal(cast.advance(0),null,'Completion repeated');
// Contact is explicitly confirmed by this small host after casting completes.
const target=engine.target({life:500}),hit=engine.resolveHit(hero,skill,target);
assert(hit.damage>0&&hit.life<500);assert.equal(target.life,hit.life);
const burn=new TimedDamage({id:'burn',damageType:'fire',duration:4,reapply:'strongest',clock:'hollow-wake-frame/v1'});
burn.apply(10);assert.equal(target.receiveDot(burn.advance(.5),'fire'),5);
const bag=new Inventory({w:2,h:2});assert(bag.insert({id:'kept-ring',w:1,h:1,data:{quality:'kept'}}));assert.equal(bag.at(0,0),'kept-ring');

// The broader authored builder is a separate existing API. This checks its
// independence too; connecting its private graph to live casts is milestone 2.
const builds=createCharacterBuilds(buildContent),def=buildContent.definitions.classes.find(row=>row.id==='magician');
const input={level:1,classId:def.id,baseAttrs:def.attributes,allocated:[],choices:{},grafts:{},equipped:{},containers:{},features:[],relicEnabled:true,relicEmpowerment:0,learned:[]};
const before=JSON.stringify(input),first=builds.open(input,Array(8).fill(null)),second=builds.rebuild(first,{...input,level:2});
assert.equal(builds.stat(second,'life')-builds.stat(first,'life'),buildContent.definitions.progression.lifePerLevel);
assert.equal(JSON.stringify(input),before);assert.deepEqual(builds.investment(second),{learned:[],grants:[]});
console.log(JSON.stringify({passed:true,configuredCast:true,confirmedContact:true,timedEffect:true,inventory:true,authoredBuildWithoutAccount:true,damage:hit.damage,randomDraws:hit.randomDraws,completeBuildCombatComposition:false}));
