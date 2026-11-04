import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {root,listFiles,sha256,verifyReference,writeJSON} from './reference-utils.mjs';
import {prepareVocationObserver,captureVocationObserver,readVocationFixture} from './vocation-reference.mjs';

const reference=path.join(root,'.reference');
const sourceLock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));
const {fixtures}=JSON.parse(fs.readFileSync(path.join(root,'baseline/character-rules/acceptance.json')));
const account='meta/account.ts',character='meta/character.ts',world='engine/world.ts',kits='meta/classkit.ts',unlocks='meta/unlocks.ts';
const mutations={
  identity:[
    ['pending-selection',account,'isClassDiscovered(a, id) && !a.pendingClassUnlocks.has(id)','isClassDiscovered(a, id)'],
    ['registered-count',account,'CLASSES.filter(c => isClassUnlocked(a, c.id)).length','a.unlockedClasses.size'],
    ['owned-opening',world,'opening: [...bar],','opening: bar as (string | null)[],'],
    ['saved-attribute-alias',character,'baseAttrs: { ...save.baseAttrs },','baseAttrs: save.baseAttrs,'],
    ['saved-opening',character,'opening: [...(save.opening ?? classDef.bar)]','opening: [...classDef.bar]'],
    ['saved-name',character,'name: save.name?.trim() || classDef.name,','name: save.name || classDef.name,'],
    ['mode-stage',character,'modeStage: save.modeStage ?? 0,','modeStage: 0,'],
    ['retired-class',character,'const classDef = CLASSES.find(c => c.id === save.classId);','const classDef = CLASSES.find(c => c.id === save.classId) ?? CLASSES[0];']
  ],
  kits:[
    ['unowned-rung',kits,'filter(r => classTierOwned(a, c.id, r.tier))','filter(() => true)'],
    ['replacement-slot',kits,'owned.filter(r => r.replaces === base)','owned.filter(r => r.replaces !== base)'],
    ['explicit-pick',kits,'picks?.[base] ?? slot?.picked ?? base','slot?.picked ?? picks?.[base] ?? base'],
    ['unseated-grant',kits,'bar[free] = g.skill;','void g.skill;'],
    ['stale-memory',kits,'else delete a.kitPicks[c.id];','else void kept;'],
    ['lose-resolved-opening',world,'const bar = kit ?? classDef.bar;','const bar = classDef.bar;']
  ],
  claims:[
    ['merged-ledger',unlocks,'const probe: Account = view ? { ...a, ledger: view } : a;','const probe: Account = a;','claimClassUnlock'],
    ['investment-clear',unlocks,'delete a.invested[u.id];','void a.invested[u.id];','claimClassUnlock'],
    ['pending-grant',unlocks,'a.pendingClassUnlocks.add(u.payload.classId)','void u.payload.classId','claimClassUnlock'],
    ['acknowledgment',unlocks,'a.pendingClassUnlocks.delete(u.payload.classId)','a.pendingClassUnlocks.has(u.payload.classId)','acknowledgeClassUnlock'],
    ['gem-support-grant',unlocks,'for (const id of u.payload.supportIds) a.unlockedSupports.add(id);','for (const id of u.payload.supportIds) void id;','grantUnlock#class'],
    ['chained-settlement',unlocks,'while (grew) {','if (grew) {','settleClassUnlocks']
  ]
};

function substitute(source, method, needle, replacement) {
  let start=0, end=source.length;
  if (method) {
    const ast=ts.createSourceFile(unlocks,source,ts.ScriptTarget.Latest,true);
    const [name,caseName]=method.split('#');
    const fn=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);
    assert(fn,method);
    const target=caseName ? fn.body.statements.find(ts.isSwitchStatement)?.caseBlock.clauses.find(c=>c.expression?.text===caseName) : fn;
    assert(target,method);
    start=target.getStart(ast);
    end=target.end;
  }
  const region=source.slice(start,end);
  assert.equal(region.split(needle).length,2,needle);
  return source.slice(0,start)+region.replace(needle,replacement)+source.slice(end);
}

verifyReference(reference,sourceLock);
fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});
const directory=fs.mkdtempSync(path.join(root,'.artifacts/character-rule-source-faults-'));
const game=path.join(directory,'game'),src=path.join(game,'src');
fs.cpSync(path.join(reference,'src'),src,{recursive:true});
fs.copyFileSync(path.join(reference,'package.json'),path.join(game,'package.json'));
fs.symlinkSync(path.join(reference,'node_modules'),path.join(game,'node_modules'),process.platform==='win32'?'junction':'dir');
const results=[];
let passed=false;
try {
  for (const [name,changes] of Object.entries(mutations)) {
    const baseline=readVocationFixture(name,fixtures);
    const entry=prepareVocationObserver(name,game,directory,fixtures);
    // A faulty settlement can omit discoveries. Still serialize those lists so
    // the comparison detects the gameplay outcome independently of an assertion.
    if (name==='claims') {
      const source=fs.readFileSync(entry,'utf8');
      fs.writeFileSync(entry,substitute(source,null,'assert(first.length>0&&second.length===0);',''));
    }
    const capture=label=>captureVocationObserver(entry,directory,name+'-'+label);
    assert(capture('control').bytes.equals(baseline));
    const expected=new Map(fixtures[name].faults.map(f=>[f.name,f.sha256]));
    assert.deepEqual(changes.map(row=>row[0]),[...expected.keys()]);
    for (const [fault,file,needle,replacement,method] of changes) {
      const target=path.join(src,file),source=fs.readFileSync(target,'utf8');
      fs.writeFileSync(target,substitute(source,method,needle,replacement));
      try {
        const run=capture(fault);
        assert(!run.bytes.equals(baseline),fault);
        assert.equal(run.sha256,expected.get(fault),fault);
        results.push({name,fault,sha256:run.sha256});
      } finally {
        fs.writeFileSync(target,source);
      }
    }
    assert(capture('restored').bytes.equals(baseline));
  }
  passed=true;
} finally {
  for (const file of listFiles(src)) assert.equal(sha256(fs.readFileSync(path.join(src,file))),sourceLock.files['src/'+file],file);
  verifyReference(reference,sourceLock);
  writeJSON(path.join(directory,'verification.json'),{passed,directory,results});
  console.log({passed,directory,detected:results.length});
}
