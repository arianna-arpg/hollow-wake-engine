import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';import {pathToFileURL} from 'node:url';import {build} from 'esbuild';
import {root,sha256} from './reference-utils.mjs';import {parityDirectory} from './prototype-parity-tools.mjs';
import {readPrototypeContent} from './prototype-content.mjs';import {buildCharacterBuilds} from './compile-character-builds.mjs';
import {buildCharacterSession} from './compile-character-session.mjs';import {Random} from '../dist/index.js';
import {buildCombatContent} from './compile-combat-content.mjs';import {createCombatSession} from '../adapters/embedded/combat-session.mjs';import {emptyCombatSpace} from '../test/combat-empty-space.mjs';
const profile=readPrototypeContent(),accepted=JSON.parse(fs.readFileSync(path.join(parityDirectory,'character-v2-acceptance.json'))),archive=fs.readFileSync(path.join(parityDirectory,'character-v2.json.gz'));
assert.equal(sha256(archive),accepted.compressedSha256);assert.equal(sha256(profile.lockBytes),accepted.sourceLockSha256);
assert.equal(sha256(fs.readFileSync(path.join(root,accepted.observer))),accepted.observerSha256);
const bytes=gunzipSync(archive);assert.equal(sha256(bytes),accepted.sha256);const fixture=JSON.parse(bytes);assert(fixture.originalOnly);
const relicAcceptance=JSON.parse(fs.readFileSync(path.join(parityDirectory,'relics-acceptance.json'))),relicArchive=fs.readFileSync(path.join(parityDirectory,'relics.json.gz'));
assert.equal(sha256(relicArchive),relicAcceptance.compressedSha256);assert.equal(sha256(profile.lockBytes),relicAcceptance.sourceLockSha256);
assert.equal(sha256(fs.readFileSync(path.join(root,relicAcceptance.observer))),relicAcceptance.observerSha256);
const relicBytes=gunzipSync(relicArchive);assert.equal(sha256(relicBytes),relicAcceptance.sha256);const relicFixture=JSON.parse(relicBytes);assert(relicFixture.originalOnly);
const parent=fs.realpathSync(path.join(root,'.artifacts')),work=fs.mkdtempSync(path.join(parent,'parity-character-owned-'));
const copy=x=>JSON.parse(JSON.stringify(x));let comparisons=0;
try{
  const builds=await buildCharacterBuilds(path.join(work,'builds'),profile),characters=buildCharacterSession(path.join(work,'characters'),profile);
  await build({entryPoints:[path.join(work,'characters/index.js')],outfile:path.join(work,'kit.mjs'),bundle:true,platform:'neutral',format:'esm',target:'es2022',
    alias:{'@hollow-wake/character-builds':path.join(work,'builds/index.js')},external:['@hollow-wake/engine','@hollow-wake/engine/*']});
  const {createCharacterKit}=await import(pathToFileURL(path.join(work,'kit.mjs'))),kit=createCharacterKit(builds.pack,characters.pack);
  await buildCombatContent(path.join(work,'combat'),profile);
  const {combatContent}=await import(pathToFileURL(path.join(work,'combat/content.mjs')));
  const savedRandom=Math.random;Math.random=()=>assert.fail('Ambient character random');
  try{for(const course of fixture.courses){
    const initial=copy(course.initial),data={schemaVersion:1,capability:'character/v1',contentId:characters.pack.contentId,...initial.data,
      character:{schemaVersion:2,capability:'workshop-character/progression-diagnostic',contentId:characters.pack.contentId,...initial.data.character},
      nextUid:10000000,random:new Random(17).snapshot(),craftLore:{}};
    const session=kit.admit(data,initial.projection);
    const battle=createCombatSession(combatContent,{space:emptyCombatSpace()},{seed:7331}),hero=battle.addCharacter(kit,session,{name:'Hero',position:{x:400,y:400}});
    const observe=expected=>{const saved=session.export(),{schemaVersion,capability,contentId,...character}=saved.character;
      // The original export drops school choices. Preserve the independent
      // live observation as durable investment, without changing other data.
      const durable=copy(expected.data);
      for(const row of durable.state.skillBook.known){const schools=expected.build.known.find(([id])=>id===row.gem.skillId)?.[1].summonSchools;if(schools)row.gem.summonSchools=[...schools];}
      assert.deepEqual(copy({state:saved.state,character,xp:saved.xp}),durable,course.id+' investment');
      assert.deepEqual(copy(session.inspect()),expected.build,course.id+' preview');
      assert.deepEqual(copy(battle.build(hero)),expected.build,course.id+' live combat build');comparisons++;};
    observe(initial);
    for(const step of course.steps){const before=session.export(),change=session.prepare(step.command,step.conditions);
      assert.deepEqual(session.export(),before,'Preparation changed live investment');assert.equal(change.accepted,step.accepted,course.id+' admission');
      if(change.accepted)assert.equal(battle.commitCharacter(hero,change).accepted,true);observe(step.expected);
      const reopened=kit.admit(session.export(),session.current().projection);assert.deepEqual(reopened.inspect(),session.inspect(),'School choice round trip');
    }
    for(const conditions of [{nearFont:false,memory:{[course.spec.skill]:'Held memory'},hold:null},{nearFont:false,memory:{},hold:'Locked sockets'}]){
      const before=session.export(),change=session.prepare({kind:'skill',request:{op:'schools',skillId:course.spec.skill,choices:['cold']}},conditions);
      assert.equal(change.accepted,false);assert.deepEqual(session.export(),before);
    }
    const invalid=session.export();invalid.state.skillBook.known[0].gem.summonSchools=['not-a-school'];
    assert.throws(()=>kit.admit(invalid,session.current().projection));
  }
  for(const course of relicFixture.courses){
    const base=kit.create('summoner'),data=base.export(),projection=base.current().projection;
    data.state.items=copy(course.initial.items);data.state.essences=copy(course.initial.wallet);data.nextUid=10000000;
    const retired=new Set(),canonical=new Set(course.initial.canonical);let calls=0;
    const hasRelic=item=>canonical.has(item.relicKey)&&course.initial.items.some(i=>i.uid===item.uid&&i.relicKey===item.relicKey);
    const custody={hasRelic,retireRelics(items){calls++;for(const item of items){const key=item.relicKey??'legacy:parity-relic:'+item.uid;retired.add(key);canonical.delete(key);}}};
    assert.throws(()=>kit.admit(data,projection),/external-relic-authority/);
    assert.throws(()=>kit.admit(data,projection,{hasRelic:()=>false}),/external-relic-authority/);
    const session=kit.admit(data,projection,course.spec.custody?custody:{hasRelic});
    const battle=createCombatSession(combatContent,{space:emptyCombatSpace()},{seed:7331}),hero=battle.addCharacter(kit,session,{name:'Hero',position:{x:400,y:400}});
    const step=course.steps[0],before=session.export(),change=session.prepare(step.command,step.conditions);
    assert.deepEqual(session.export(),before,'Relic preparation changed character');assert.equal(calls,0,'Relic preview retired external custody');
    const accepted=JSON.stringify(course.initial.items)!==JSON.stringify(step.expected.items);assert.equal(change.accepted,accepted);
    if(change.accepted){assert.equal(battle.commitCharacter(hero,change).accepted,true);assert.throws(()=>session.commit(change),/stale/);}
    const saved=session.export();assert.deepEqual(copy({items:saved.state.items,wallet:saved.state.essences,retired:[...retired],canonical:[...canonical]}),step.expected,course.id);
    assert.equal(calls,step.expected.retired.length?1:0,'Retirement must be one batch, including bulk');comparisons++;
    if(course.spec.custody&&accepted){
      const failed=kit.admit(data,projection,{hasRelic:()=>true,retireRelics(){throw Error('Custody unavailable');}}),bad=failed.prepare(step.command,step.conditions);let published=false;
      assert.throws(()=>failed.commit(bad,{publish(){published=true;}}),/Custody unavailable/);assert.equal(published,false);assert.throws(()=>failed.export(),/publication-failed/);
      let owned=true;
      const stale=kit.admit(data,projection,{hasRelic:()=>owned,retireRelics(){assert.fail('Stale custody reached retirement');}}),staleChange=stale.prepare(step.command,step.conditions);
      owned=false;assert.throws(()=>stale.commit(staleChange),/stale-relic-custody/);assert.throws(()=>stale.export(),/publication-failed/);
      const asyncOwner=kit.admit(data,projection,{hasRelic:()=>true,async retireRelics(){}}),asyncChange=asyncOwner.prepare(step.command,step.conditions);
      assert.throws(()=>asyncOwner.commit(asyncChange),/asynchronous-relic-custody/);assert.throws(()=>asyncOwner.export(),/publication-failed/);
      const duplicate=copy(data),first=duplicate.state.items.find(i=>i.relicKey),second=duplicate.state.items.find(i=>i.relicKey&&i!==first);
      if(second){second.relicKey=first.relicKey;assert.throws(()=>kit.admit(duplicate,projection,{hasRelic:()=>true}),/relic-address-collision/);}
    }
  }
  }finally{Math.random=savedRandom;}
  console.log(JSON.stringify({passed:true,courses:fixture.courses.length+relicFixture.courses.length,comparisons,source:profile.lock.commit,accountOrPersistence:false}));
}finally{assert.equal(path.dirname(fs.realpathSync(work)),parent);fs.rmSync(work,{recursive:true,maxRetries:3});}
