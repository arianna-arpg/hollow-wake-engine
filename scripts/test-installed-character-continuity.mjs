import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {readVocationFixture,prepareVocationObserver,captureVocationObserver} from './vocation-reference.mjs';
import {prepareVocationFaultGame} from './vocation-installed-fault-tools.mjs';

const [flag,file]=process.argv.slice(2);assert.equal(flag,'--location');
const location=JSON.parse(fs.readFileSync(path.resolve(file)));
assert(location.characterContinuityDecision,'Prepare an integrated continuity game first');
execFileSync(process.execPath,[path.join(root,'scripts/test-reference-character-continuity.mjs'),'--game',location.game],{cwd:root,stdio:'inherit',windowsHide:true});
const {directory,game,copy,verifyUnchanged}=prepareVocationFaultGame(location,'installed-character-continuity-');
const {fixtures}=JSON.parse(fs.readFileSync(path.join(root,'baseline/character-continuity/acceptance.json')));
const rewards=path.join(copy,'dist/class-rewards.js'),account=path.join(copy,'dist/class-account.js'),mercs=path.join(copy,'dist/mercenary-identity.js');
const world=path.join(game,'src/engine/world.ts'),unlocks=path.join(game,'src/meta/unlocks.ts');
const changes={
  rewards:[
    ['explicit-alternative',rewards,' || account.explicitSkillUnlocks.has(id)',''],
    ['pending-only',rewards,'return !pendingOwner;','return true;'],
    ['shared-active',rewards,'account.unlockedClasses.has(bundle.classId) && !account.pendingClassUnlocks.has(bundle.classId)',
      'bundles.filter(owner => owner.skillIds.includes(id)).every(owner => account.unlockedClasses.has(owner.classId) && !account.pendingClassUnlocks.has(owner.classId))'],
    ['missing-skill',rewards,'account.unlockedSkills.add(skill);','void skill;'],
    ['support-drop',rewards,'account.unlockedSupports.add(support);','void support;'],
    ['investment-transfer',rewards,' + credit;',' + Math.min(credit,1);'],
    ['legacy-mode',unlocks,'engineClassRewards.reconcileClassRewards(a,CLASS_BUNDLES,MEMORY_UNLOCK_CFG.legacyGemBundles,UNLOCK_CATALOG,\n    MEMORY_UNLOCK_CFG.legacyGemBundles ? undefined : MEMORY_UNLOCKS.find', 'engineClassRewards.reconcileClassRewards(a,CLASS_BUNDLES,false,UNLOCK_CATALOG,\n    false ? undefined : MEMORY_UNLOCKS.find']
  ],
  mercs:[
    ['borrowed-opening',mercs,'opening: [...snapshot.bar]','opening: snapshot.bar'],
    ['snapshot-attributes',mercs,'baseAttrs: { ...snapshot.baseAttrs }','baseAttrs: snapshot.baseAttrs'],
    ['numerical-gem-cap',mercs,'Math.round(level * ratio)','Math.round(level)'],
    ['support-cap',world,'level: gemLevel(s.level)','level: s.level'],
    ['vocation-seed',mercs,", ...(snapshot.vocations ?? []).map(v => 'voc_' + v + '_root')",''],
    ['given-name',world,'if (seat.merc) meta.name = seat.merc.name;','void seat.merc;'],
    ['resync-life',world,'a.maxLife() * Math.min(1, frac)','a.maxLife()'],
    ['single-legacy',mercs,'save.mercenaries ?? (save.mercenary?.snapshot ? [save.mercenary] : [])','save.mercenaries ?? []'],
    ['plural-precedence',mercs,'save.mercenaries ?? (save.mercenary?.snapshot ? [save.mercenary] : [])','(save.mercenary?.snapshot ? [save.mercenary] : save.mercenaries ?? [])']
  ],
  account:[
    ['starter-seed',account,'new Set([...starters, ...(saved.unlockedClasses ?? [])])','new Set(saved.unlockedClasses ?? [])'],
    ['pending-retired',account,'classes.some(c => c.id === id) && (saved.unlockedClasses ?? []).includes(id)','(saved.unlockedClasses ?? []).includes(id)'],
    ['pending-starters',account,"typeof id === 'string' && !starters.includes(id)","typeof id === 'string'"],
    ['pending-undiscovered',account,'&& (saved.unlockedClasses ?? []).includes(id)',''],
    ['tier-strings',account,"(saved.unlockedClassTiers ?? []).filter((id) => typeof id === 'string')",'(saved.unlockedClassTiers ?? [])'],
    ['kit-pick-strings',account,".filter(([, skill]) => typeof skill === 'string')",'.filter(() => true)'],
    ['explicit-grants',account,'...(saved.explicitSkillUnlocks ?? [])','...(saved.unlockedSkills ?? [])'],
    ['kit-snapshot-alias',account,'kitPicks: state.kitPicks','kitPicks: { ...state.kitPicks }'],
    ['support-pool',account,'new Set([...starterSupports, ...(saved.unlockedSupports ?? [])])','new Set(starterSupports)']
  ]
};
const results=[];let passed=false;
try{
  for(const [name,mutations]of Object.entries(changes)){
    const expected=readVocationFixture(name,fixtures),entry=prepareVocationObserver(name,game,directory,fixtures);
    if(name==='mercs'){
      let source=fs.readFileSync(entry,'utf8');
      for(const needle of ['assert(Math.abs(synced.lifeFraction-.5)<1e-8);','assert.equal(synced.name,name);']){
        assert.equal(source.split(needle).length,2);source=source.replace(needle,'');
      }
      fs.writeFileSync(entry,source);
    }
    const capture=label=>captureVocationObserver(entry,directory,name+'-'+label);
    assert(capture('control').bytes.equals(expected));
    const accepted=new Map(fixtures[name].faults.map(f=>[f.name,f.sha256]));
    assert.deepEqual(mutations.map(m=>m[0]),[...accepted.keys()]);
    for(const [label,target,needle,replacement]of mutations){
      const bytes=fs.readFileSync(target),source=bytes.toString().replaceAll('\r\n','\n');
      assert.equal(source.split(needle).length,2,label);fs.writeFileSync(target,source.replace(needle,replacement));
      try{
        const run=capture(label);assert(!run.bytes.equals(expected),label);assert.equal(run.sha256,accepted.get(label),label);
        results.push({name,label,sha256:run.sha256,matchedOriginalFault:true});
      }finally{fs.writeFileSync(target,bytes);}
    }
    assert(capture('restored').bytes.equals(expected));
  }
  passed=true;
}finally{
  verifyUnchanged();
  writeJSON(path.join(directory,'verification.json'),{passed,directory,results,sourceRestored:true,packageRestored:true,contractSha256:sha256(fs.readFileSync(path.join(root,'baseline/character-continuity/acceptance.json')))});
  console.log({passed,directory,detected:results.length});
}
