import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {root,listFiles,sha256,verifyReference,writeJSON} from './reference-utils.mjs';
import {prepareVocationObserver,captureVocationObserver,readVocationFixture} from './vocation-reference.mjs';

const ref=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));
const {fixtures}=JSON.parse(fs.readFileSync(path.join(root,'baseline/character-continuity/acceptance.json')));
const unlocks='meta/unlocks.ts',world='engine/world.ts',character='meta/character.ts',account='meta/account.ts';
const changes={
  rewards:[
    ['explicit-alternative',unlocks,'isSkillUnlockedForSelection',' || a.explicitSkillUnlocks.has(id)',''],
    ['pending-only',unlocks,'isSkillUnlockedForSelection','return !owners.some(b => a.pendingClassUnlocks.has(b.classId));','return true;'],
    ['shared-active',unlocks,'isSkillUnlockedForSelection','if (owners.some(b => isClassUnlocked(a, b.classId))) return true;','if (owners.every(b => isClassUnlocked(a, b.classId))) return true;'],
    ['missing-skill',unlocks,'reconcileClassBundleGems','for (const id of b.skillIds) a.unlockedSkills.add(id);','for (const id of b.skillIds) void id;'],
    ['support-drop',unlocks,'reconcileClassBundleGems','a.unlockedSupports.add(id)','void id'],
    ['investment-transfer',unlocks,'reconcileClassBundleGems',' + held;',' + Math.min(held,1);'],
    ['legacy-mode',unlocks,'reconcileClassBundleGems','if (!MEMORY_UNLOCK_CFG.legacyGemBundles)','if (true)']
  ],
  mercs:[
    ['borrowed-opening',world,'normalizeMercMeta','opening: [...snapshot.bar]','opening: snapshot.bar'],
    ['snapshot-attributes',world,'normalizeMercMeta','baseAttrs: { ...snapshot.baseAttrs },','baseAttrs: snapshot.baseAttrs,'],
    ['numerical-gem-cap',world,'normalizeMercMeta','Math.round(orig * (capNow / capThen))','Math.round(orig)'],
    ['support-cap',world,'normalizeMercMeta','level: gemLevel(s.level)','level: s.level'],
    ['vocation-seed',world,'trimAllocated','...(snapshot.vocations ?? []).map(v => `voc_${v}_root`),',''],
    ['given-name',world,'applyMercNormalization','if (seat.merc) meta.name = seat.merc.name;','void seat.merc;'],
    ['resync-life',world,'applyMercNormalization','a.maxLife() * Math.min(1, frac)','a.maxLife()'],
    ['single-legacy',character,'applySavedCharacter','save.mercenaries ?? (save.mercenary?.snapshot ? [save.mercenary] : [])','save.mercenaries ?? []'],
    ['plural-precedence',character,'applySavedCharacter','save.mercenaries ?? (save.mercenary?.snapshot ? [save.mercenary] : [])','(save.mercenary?.snapshot ? [save.mercenary] : save.mercenaries ?? [])']
  ],
  account:[
    ['starter-seed',account,'deserializeAccount','unlockedClasses: new Set([...STARTER_CLASSES, ...(s.unlockedClasses ?? [])])','unlockedClasses: new Set(s.unlockedClasses ?? [])'],
    ['pending-retired',account,'deserializeAccount','CLASSES.some(c => c.id === id) && (s.unlockedClasses ?? []).includes(id)','(s.unlockedClasses ?? []).includes(id)'],
    ['pending-starters',account,'deserializeAccount',"typeof id === 'string' && !STARTER_CLASSES.includes(id)","typeof id === 'string'"],
    ['pending-undiscovered',account,'deserializeAccount','&& (s.unlockedClasses ?? []).includes(id)',''],
    ['tier-strings',account,'deserializeAccount',"(s.unlockedClassTiers ?? []).filter(t => typeof t === 'string')",'(s.unlockedClassTiers ?? [])'],
    ['kit-pick-strings',account,'deserializeAccount',".filter(([, sid]) => typeof sid === 'string')",'.filter(() => true)'],
    ['explicit-grants',account,'deserializeAccount','...(s.explicitSkillUnlocks ?? [])','...(s.unlockedSkills ?? [])'],
    ['kit-snapshot-alias',account,'serializeAccount','kitPicks: a.kitPicks,','kitPicks: { ...a.kitPicks },'],
    ['support-pool',account,'deserializeAccount','unlockedSupports: new Set([...STARTER_SUPPORTS, ...(s.unlockedSupports ?? [])])','unlockedSupports: new Set(STARTER_SUPPORTS)']
  ]
};
verifyReference(ref,lock);fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});
const directory=fs.mkdtempSync(path.join(root,'.artifacts/character-continuity-source-faults-')),game=path.join(directory,'game'),src=path.join(game,'src');
fs.cpSync(path.join(ref,'src'),src,{recursive:true});fs.copyFileSync(path.join(ref,'package.json'),path.join(game,'package.json'));
fs.symlinkSync(path.join(ref,'node_modules'),path.join(game,'node_modules'),process.platform==='win32'?'junction':'dir');
const results=[];let passed=false;
try{
  for(const [name,mutations]of Object.entries(changes)){
    const expected=readVocationFixture(name,fixtures),entry=prepareVocationObserver(name,game,directory,fixtures);
    if(name==='mercs'){
      let source=fs.readFileSync(entry,'utf8');
      // Keep the deliberately wrong life fraction and name in the observation.
      for(const needle of ['assert(Math.abs(synced.lifeFraction-.5)<1e-8);','assert.equal(synced.name,name);']){
        assert.equal(source.split(needle).length,2);source=source.replace(needle,'');
      }
      fs.writeFileSync(entry,source);
    }
    const capture=label=>captureVocationObserver(entry,directory,name+'-'+label);
    assert(capture('control').bytes.equals(expected));
    const accepted=new Map(fixtures[name].faults.map(f=>[f.name,f.sha256]));
    assert.deepEqual(mutations.map(m=>m[0]),[...accepted.keys()]);
    for(const [label,file,method,needle,replacement]of mutations){
      const target=path.join(src,file),source=fs.readFileSync(target,'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
      const cls=ast.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='World');
      const node=cls?cls.members.find(n=>ts.isMethodDeclaration(n)&&n.name.getText(ast)===method):
        ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===method);
      assert(node,method);const region=node.getText(ast);
      assert.equal(sha256(region.replaceAll('\r\n','\n')),fixtures[name].methods[file+'#'+method]);
      assert.equal(region.split(needle).length,2,label);
      fs.writeFileSync(target,source.slice(0,node.getStart(ast))+region.replace(needle,replacement)+source.slice(node.end));
      try{
        const run=capture(label);assert(!run.bytes.equals(expected),label);assert.equal(run.sha256,accepted.get(label),label);
        results.push({name,label,sha256:run.sha256});
      }finally{fs.writeFileSync(target,source);}
    }
    assert(capture('restored').bytes.equals(expected));
  }
  passed=true;
}finally{
  for(const file of listFiles(src))assert.equal(sha256(fs.readFileSync(path.join(src,file))),lock.files['src/'+file],file);
  verifyReference(ref,lock);writeJSON(path.join(directory,'verification.json'),{passed,directory,results});console.log({passed,directory,detected:results.length});
}
