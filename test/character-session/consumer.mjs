import fs from 'node:fs';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';
import {Random,CastRuntime} from '@hollow-wake/engine';
import {createCharacterKit} from '@hollow-wake/characters';
import {body,liveHost,damage} from './host.mjs';
import {contracts} from './contracts.mjs';
const read=name=>JSON.parse(fs.readFileSync(new URL(import.meta.resolve(name))));
const pack=read('@hollow-wake/character-builds/builds.json'),content=read('@hollow-wake/characters/characters.json'),kit=createCharacterKit(pack,content);
const courses=JSON.parse(gunzipSync(fs.readFileSync(process.argv[2]))).courses;
const copy=x=>JSON.parse(JSON.stringify(x)),same=(a,b,message)=>assert.deepEqual(copy(a),copy(b),message);
Math.random=()=>assert.fail('Ambient random');globalThis.fetch=()=>assert.fail('Network');
for(const key of ['window','document','localStorage'])Object.defineProperty(globalThis,key,{get(){assert.fail('Ambient '+key);}});
const grants=new Set(['vocation','xp','points','projection']);let checks=0;
function admitted(course){
  const i=copy(course.initial),context={schemaVersion:2,capability:'workshop-character/progression-diagnostic',contentId:content.contentId,...i.data.character};
  return kit.admit({schemaVersion:1,capability:'character/v1',contentId:content.contentId,...i.data,character:context,nextUid:10000000,random:new Random(17).snapshot(),craftLore:{}},i.projection);
}
for(const course of courses){
  const session=admitted(course),host=liveHost(kit,session),actor=host.actor,skill=()=>host.meta.knownSkills.get(course.spec.skill),pipe=damage(kit,()=>assert.fail('Preview consumed random'));
  const observe=expected=>{
    const saved=session.export(),{schemaVersion,capability,contentId,...character}=saved.character;
    same({state:saved.state,character,xp:saved.xp},expected.data,course.spec.id+' data');same(session.current().projection,expected.projection,'external projection');
    same(session.inspect(),expected.build,'private build');same(host.view(),expected.build,'live build');
    same(Object.fromEntries(course.statIds.map(id=>[id,session.stat(id)])),expected.stats,'owned stats');same(Object.fromEntries(course.statIds.map(id=>[id,actor.sheet.get(id)])),expected.stats,'live stats');
    same(pipe.skillDamageBands(actor,skill()),expected.preview,'damage preview');same(kit.pricing.profile(actor,skill()),expected.price,'cast price');
    same(expected.legal.map(([id])=>[id,kit.queries.treeNodeRefusal(skill(),id)]),expected.legal,'legal investment');
    same(expected.supportLegal.map(([id])=>[id,session.canSocket(course.spec.skill,id)]),expected.supportLegal,'support compatibility');checks++;
  };
  observe(course.initial);let cast;
  for(const step of course.steps){
    if(step.label==='rebuild-during-cast'){
      actor.life=actor.maxLife();actor.mana=actor.availableMaxMana();same({life:actor.life,mana:actor.mana},course.cast.before,'precast resources');
      cast=new CastRuntime({life:actor.life,mana:actor.mana});assert.equal(cast.press(kit.pricing.profile(actor,skill())).kind,'started');
      actor.life=cast.life;actor.mana=cast.mana;const active=cast.snapshot().active;actor.casting={inst:skill(),total:active.total,elapsed:active.elapsed,mode:'cast'};
      same({life:actor.life,mana:actor.mana,total:active.total,elapsed:active.elapsed},course.cast.pressed,'original cast press');
      cast.advance(active.total/3);actor.casting.elapsed=cast.snapshot().active.elapsed;
    }
    const currentSkill=skill(),currentCast=actor.casting,held=session.export();
    const change=grants.has(step.command.kind)?session.authorize(step.command):session.prepare(step.command,step.conditions);
    assert(change.accepted,step.label+': '+change.refusal);same(session.export(),held,'preparation wrote owned state');assert.equal(skill(),currentSkill);assert.equal(actor.casting,currentCast);
    session.commit(change,host.publisher);assert.equal(skill(),currentSkill,'surviving learned identity');
    if(step.label==='rebuild-during-cast'){
      assert.equal(actor.casting,currentCast);same({life:actor.life,mana:actor.mana,total:currentCast.total,elapsed:currentCast.elapsed},course.cast.during,'original cast rebuild');
      cast.setResources({life:actor.life,mana:actor.mana});assert.equal(cast.advance(currentCast.total,{completionCooldown:kit.pricing.profile(actor,skill()).cooldown}).kind,'completed');actor.casting=null;
      assert.equal(cast.cooldown(course.spec.skill),course.cast.cooldown);
      const random=new Random(711),draws=[],hits=damage(kit,()=>{const n=random.next();draws.push(n);return n;}),target=body(kit.rules,2);
      target.sheet.setBase('life',100000);target.life=100000;target.sheet.setBase('armor',200);target.sheet.setBase('fireRes',.25);target.sheet.setBase('chaosRes',.25);
      const packet=hits.rollSkillDamage(actor,skill()),outgoing=copy(packet.amounts),result=hits.applyHit(actor,target,packet);
      same({outgoing,result,life:target.life,crit:packet.crit,rollT:packet.rollT,draws},course.hit,'actual confirmed contact');
    }
    observe(step.expected);
  }
  const saved=session.export(),roundtrip=kit.admit(saved,session.current().projection);same(roundtrip.export(),saved,'detached round trip');same(roundtrip.inspect(),session.inspect(),'reconstructed build');
  saved.character.baseAttrs[Object.keys(saved.character.baseAttrs)[0]]+=900;assert.notDeepEqual(saved,session.export());
}
// A new character and an import use the same ownership boundary.
const fresh=kit.create('magician'),before=fresh.export();assert(before.state.skillBook.known.length);assert(!('account'in before));
const point=fresh.authorize({kind:'points',currency:'passive',amount:2});fresh.commit(point);assert.equal(fresh.export().character.passives.passivePoints,before.character.passives.passivePoints+2);
const stable=kit.create('magician').export(),authority=kit.create('magician').current().projection;
pack.definitions.classes.find(row=>row.id==='magician').bar=[];pack.definitions.skills.firebolt.name='changed caller content';content.contentId='foreign';
assert.deepEqual(kit.create('magician').export(),stable);content.contentId=stable.contentId;
const contractCount=contracts(kit,content,courses);
console.log(JSON.stringify({passed:true,courses:courses.length,observations:checks,contracts:contractCount,actualContacts:courses.length,liveCastRebuilds:courses.length,optionalExtensionsRequired:false}));
